// The invoice you can print for a job: the business name, who's being billed, the original estimate, any extra work the customer approved, and the final total.
// Only approved extra work makes it onto the invoice. The Print button lets you save it as a PDF.

// Borrowed tools: the line item table, money helpers, our login/database connection (Supabase), links, "not found" and redirect helpers, and the print button.
import LineItems from "@/components/LineItems";
import { formatCents, totalCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import PrintInvoiceButton from "./PrintInvoiceButton";
import { decryptContact } from "@/lib/field-crypto";

// The job's ID, which comes from the web address.
type InvoicePageProps = { params: Promise<{ id: string }> };
// Quick descriptions of the info we pull in. A Job is its ID, business, customer, description and creation date.
type Job = {
  id: string;
  business_id: string;
  customer_id: string;
  description: string;
  created_at: string;
};
// The customer's name and contact info. Some of it might be missing.
type Customer = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};
// One line on the invoice: what it is, the quantity (in thousandths) and the price per item in cents.
type InvoiceLine = {
  id: string;
  description: string;
  quantity_milli: number;
  unit_price_cents: number;
};
// A change order the customer approved: its reason, version number and saved total.
type ApprovedChangeOrder = {
  id: string;
  reason: string;
  version: number;
  total_cents: number;
};
// An invoice line that also remembers which change order it belongs to.
type ChangeOrderLine = InvoiceLine & { change_order_id: string };
// The record of the customer's okay: who approved, when, and which version they approved.
type Approval = {
  change_order_id: string;
  version: number;
  approver_name: string;
  decided_at: string;
  decision: string;
};
// Your plumbing business, just its name.
type Business = { name: string };

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// The page itself. It's built on the server, before anything gets to your browser.
export default async function InvoicePage({ params }: InvoicePageProps) {
  // Wait until someone's actually visiting, so we show fresh info. Then we read the job's ID from the web address.
  await connection();
  const { id } = await params;
  // Are you signed in? If not, we send you to the login page, because we don't want strangers poking around.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Look up the job. If it's not there (or isn't yours to see), we show a "not found" page.
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("id, business_id, customer_id, description, created_at")
    .eq("id", id)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Could not load the job: ${jobError.message}`);
  }
  if (!jobData) {
    notFound();
  }

  // Fetch four things at once: the customer, the business, the estimate lines, and the change orders that were approved.
  const job = jobData as Job;
  const [
    { data: customerData, error: customerError },
    { data: businessData, error: businessError },
    { data: estimateData, error: estimateError },
    { data: changeOrderData, error: changeOrderError },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("name, email, phone, address")
      .eq("business_id", job.business_id)
      .eq("id", job.customer_id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("name")
      .eq("id", job.business_id)
      .maybeSingle(),
    supabase
      .from("estimate_lines")
      .select("id, description, quantity_milli, unit_price_cents")
      .eq("business_id", job.business_id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("change_orders")
      .select("id, reason, version, total_cents")
      .eq("business_id", job.business_id)
      .eq("job_id", job.id)
      .eq("status", "approved"),
  ]);

  // If any lookup failed, or the customer or business is missing, we stop.
  if (customerError) throw new Error(`Could not load the customer: ${customerError.message}`);
  if (businessError) throw new Error(`Could not load the business: ${businessError.message}`);
  if (estimateError) throw new Error(`Could not load estimate lines: ${estimateError.message}`);
  if (changeOrderError) throw new Error(`Could not load approved changes: ${changeOrderError.message}`);
  if (!customerData || !businessData) notFound();

  // For the approved change orders, load their lines and the customer's approval records. If there aren't any, we skip the trip.
  const changeOrders = changeOrderData as ApprovedChangeOrder[];
  const changeOrderIds = changeOrders.map((changeOrder) => changeOrder.id);
  const [{ data: changeLineData, error: changeLineError }, { data: approvalData, error: approvalError }] =
    changeOrderIds.length > 0
      ? await Promise.all([
          supabase
            .from("change_order_lines")
            .select("id, change_order_id, description, quantity_milli, unit_price_cents")
            .eq("business_id", job.business_id)
            .in("change_order_id", changeOrderIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("approvals")
            .select("change_order_id, version, approver_name, decided_at, decision")
            .eq("business_id", job.business_id)
            .in("change_order_id", changeOrderIds)
            .eq("decision", "approved"),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

  // If either of those lookups failed, stop and say so.
  if (changeLineError) {
    throw new Error(`Could not load approved change lines: ${changeLineError.message}`);
  }
  if (approvalError) {
    throw new Error(`Could not load approval records: ${approvalError.message}`);
  }

  // Label the loaded info with the shapes above.
  const customer = decryptContact(customerData as Customer);
  const business = businessData as Business;
  const estimateLines = estimateData as InvoiceLine[];
  const changeLines = changeLineData as ChangeOrderLine[];
  const approvals = approvalData as Approval[];
  // Build a quick way to find an approval by change order and version.
  const approvalByChangeOrder = new Map(
    approvals.map((approval) => [
      `${approval.change_order_id}:${approval.version}`,
      approval,
    ]),
  );

  // Now build each approved change order with its approval and lines, double-checking as we go.
  const approvedChanges = changeOrders.map((changeOrder) => {
    const approval = approvalByChangeOrder.get(
      `${changeOrder.id}:${changeOrder.version}`,
    );
    // Check one: an approved change order must have a real approval record (who and when). If not, we stop rather than bill for work nobody signed off on.
    if (!approval || !approval.approver_name || !approval.decided_at) {
      throw new Error(
        `Approved change order ${changeOrder.id} does not have a matching approval record.`,
      );
    }
    // Grab just this change order's lines.
    const lines = changeLines.filter(
      (line) => line.change_order_id === changeOrder.id,
    );
    const calculatedTotal = totalCents(
      lines.map((line) => ({
        quantityMilli: line.quantity_milli,
        unitPriceCents: line.unit_price_cents,
      })),
    );
    // Check two: the saved total has to match the sum of its lines. If not, we stop instead of billing the wrong amount.
    if (calculatedTotal !== changeOrder.total_cents) {
      throw new Error(
        `Approved change order ${changeOrder.id} has an incorrect stored total.`,
      );
    }
    return { ...changeOrder, approval, lines };
  });

  // Add up the original estimate.
  const estimateTotal = totalCents(
    estimateLines.map((line) => ({
      quantityMilli: line.quantity_milli,
      unitPriceCents: line.unit_price_cents,
    })),
  );
  // The invoice total is the estimate plus every line from the approved change orders.
  const invoiceTotal = totalCents([
    ...estimateLines.map((line) => ({
      quantityMilli: line.quantity_milli,
      unitPriceCents: line.unit_price_cents,
    })),
    ...approvedChanges.flatMap((changeOrder) =>
      changeOrder.lines.map((line) => ({
        quantityMilli: line.quantity_milli,
        unitPriceCents: line.unit_price_cents,
      })),
    ),
  ]);

  // Now we draw the page.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8 print:min-h-0 print:bg-white print:p-0">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-4xl">
        {/* The top bar with Back and Print. It's marked "no-print", so it won't show up on paper. */}
        <nav className="no-print mb-5 flex items-center justify-between gap-3">
          <Link
            className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
            href={`/jobs/${job.id}`}
          >
            ← Back to job
          </Link>
          <PrintInvoiceButton />
        </nav>

        {/* This is the invoice itself, the part that actually gets printed. */}
        <article className="invoice-document rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
          {/* The invoice heading: business name, job reference and today's date. */}
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-zinc-200 pb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-hivis-800 print:text-black">
                Invoice
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
                {business.name}
              </h1>
            </div>
            <dl className="grid gap-2 text-sm sm:text-right">
              <div>
                <dt className="text-zinc-500">Job reference</dt>
                <dd className="font-medium text-zinc-950">{job.id.slice(0, 8)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Invoice date</dt>
                <dd className="font-medium text-zinc-950">
                  {new Date().toLocaleDateString("en-US")}
                </dd>
              </div>
            </dl>
          </header>

          {/* "Bill to": the customer's name plus whatever contact info we have. */}
          <section className="border-b border-zinc-200 py-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Bill to
            </h2>
            <p className="mt-2 font-semibold text-zinc-950">{customer.name}</p>
            {customer.address && <p className="mt-1 text-zinc-700">{customer.address}</p>}
            {customer.email && <p className="mt-1 text-zinc-700">{customer.email}</p>}
            {customer.phone && <p className="mt-1 text-zinc-700">{customer.phone}</p>}
          </section>

          {/* The original estimate: the job description, the date and the lines. */}
          <section className="border-b border-zinc-200 py-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-950">
              {job.description}
            </h2>
            <p className="mb-4 text-sm text-zinc-600">
              Original estimate ·{" "}
              {new Date(job.created_at).toLocaleDateString("en-US")}
            </p>
            {/* The table of estimate lines, with a total. */}
            <LineItems
              lines={estimateLines.map((line) => ({
                id: line.id,
                description: line.description,
                quantityMilli: line.quantity_milli,
                unitPriceCents: line.unit_price_cents,
              }))}
              totalLabel="Original estimate"
            />
          </section>

          {/* One section for each approved change order: the reason, who approved it and when, and its lines. */}
          {approvedChanges.map((changeOrder) => (
            <section
              className="border-b border-zinc-200 py-6"
              key={`${changeOrder.id}:${changeOrder.version}`}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-zinc-950">
                  Approved additional work
                </h2>
                <p className="mt-1 text-zinc-700">{changeOrder.reason}</p>
                <p className="mt-2 text-sm text-zinc-600">
                  Approved by {changeOrder.approval.approver_name} on{" "}
                  {new Date(changeOrder.approval.decided_at).toLocaleDateString("en-US")}
                </p>
              </div>
              <LineItems
                lines={changeOrder.lines.map((line) => ({
                  id: line.id,
                  description: line.description,
                  quantityMilli: line.quantity_milli,
                  unitPriceCents: line.unit_price_cents,
                }))}
                totalLabel="Approved change"
              />
            </section>
          ))}

          {/* The grand total. */}
          <footer className="flex justify-between gap-4 pt-6 text-xl font-bold text-zinc-950">
            <span>Invoice total</span>
            <span>{formatCents(invoiceTotal)}</span>
          </footer>
          {/* The breakdown: original estimate versus approved extra work. */}
          <p className="mt-3 text-right text-sm text-zinc-600">
            Original estimate: {formatCents(estimateTotal)} · Approved additional
            work: {formatCents(invoiceTotal - estimateTotal)}
          </p>
        </article>
      </div>
    </main>
  );
}
