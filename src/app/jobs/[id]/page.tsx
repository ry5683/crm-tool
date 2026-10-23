// A job's own page: the customer, the assigned technician, the original estimate, and every change order with its status.
// From here you can edit the job, start a change order, send a draft to the customer for approval, open the invoice, or delete the job (owners only).

// Borrowed tools: money math, our login/database connection (Supabase), links, "not found" and redirect helpers, some shared display pieces (the line item table and status badge) and this job's buttons.
import { totalCents } from "@/lib/money";
import { callHref, formatPhone, mapsHref, textHref, usPhoneDigits } from "@/lib/contact";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import LineItems from "@/components/LineItems";
import StatusBadge, {
  type ChangeOrderStatus,
} from "@/components/StatusBadge";
import SendApprovalButton from "./SendApprovalButton";
import DeleteJobButton from "./DeleteJobButton";

// Quick descriptions of the info we pull in. A Job is its ID, business, customer, assigned technician, status, description and creation date.
type Job = {
  id: string;
  business_id: string;
  customer_id: string;
  assigned_tech_id: string | null;
  status: string;
  description: string;
  created_at: string;
};

// A customer's name and contact info. Some of it might be missing.
type Customer = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

// One line of the original estimate: what it is, the quantity (in thousandths, so 1 = 1000) and the price per item in cents.
type EstimateLine = {
  id: string;
  description: string;
  quantity_milli: number;
  unit_price_cents: number;
};

// A team member: their user ID and, sometimes, their role (like owner or tech).
type Member = {
  user_id: string;
  role?: string;
};

// A change order: why it's needed, its status, the total we saved for it (in cents) and when it was made.
type ChangeOrder = {
  id: string;
  reason: string;
  status: string;
  total_cents: number;
  created_at: string;
};

// One line inside a change order, tied back to the change order it belongs to.
type ChangeOrderLine = {
  id: string;
  change_order_id: string;
  description: string;
  quantity_milli: number;
  unit_price_cents: number;
};

// A safety net: a change order's status has to be draft, sent, approved or declined. If the database ever gives us something else, we stop with an error.
function changeOrderStatus(value: string): ChangeOrderStatus {
  if (value === "draft" || value === "sent" || value === "approved" || value === "declined") {
    return value;
  }
  throw new Error(`The database returned an unknown change-order status: ${value}`);
}

// The job's ID, which comes from the web address.
type JobDetailPageProps = {
  params: Promise<{ id: string }>;
};

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// The page itself. It's built on the server, before anything gets to your browser.
export default async function JobDetailPage({ params }: JobDetailPageProps) {
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
  // Grab your user ID. We'll need it in a moment to look up your role.
  const userId = claims.claims.sub;
  if (typeof userId !== "string") {
    throw new Error("Your sign-in token did not contain a user ID.");
  }

  // Look up the job. If it's not there (or isn't yours to see), we show a "not found" page.
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("id, business_id, customer_id, assigned_tech_id, status, description, created_at")
    .eq("id", id)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Could not load this job: ${jobError.message}`);
  }
  if (!jobData) {
    notFound();
  }

  // Fetch five things at the same time, because that's faster: the customer, the estimate lines, the assigned technician, the change orders, and your own role.
  const job = jobData as Job;
  const [
    { data: customerData, error: customerError },
    { data: lineData, error: lineError },
    { data: memberData, error: memberError },
    { data: changeOrderData, error: changeOrderError },
    { data: currentMemberData, error: currentMemberError },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("name, email, phone, address")
      .eq("business_id", job.business_id)
      .eq("id", job.customer_id)
      .maybeSingle(),
    supabase
      .from("estimate_lines")
      .select("id, description, quantity_milli, unit_price_cents")
      .eq("business_id", job.business_id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: true }),
    job.assigned_tech_id
      ? supabase
          .from("members")
          .select("user_id")
          .eq("business_id", job.business_id)
          .eq("user_id", job.assigned_tech_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("change_orders")
      .select("id, reason, status, total_cents, created_at")
      .eq("business_id", job.business_id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("members")
      .select("user_id, role")
      .eq("business_id", job.business_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // If any of those lookups failed, stop and say so.
  if (customerError) {
    throw new Error(`Could not load the customer: ${customerError.message}`);
  }
  if (lineError) {
    throw new Error(`Could not load estimate lines: ${lineError.message}`);
  }
  if (memberError) {
    throw new Error(`Could not load the assigned technician: ${memberError.message}`);
  }
  if (changeOrderError) {
    throw new Error(`Could not load change orders: ${changeOrderError.message}`);
  }
  if (currentMemberError) {
    throw new Error(`Could not load your membership role: ${currentMemberError.message}`);
  }

  // A job whose customer we can't see isn't worth showing, so it's "not found".
  if (!customerData) {
    notFound();
  }

  // Label the loaded info with the shapes above. Only an owner is allowed to delete the job.
  const customer = customerData as Customer;
  // A small "Add" link shown next to any missing detail, taking you straight to the edit page.
  const addLink = (
    <Link className="font-medium text-blue-700 hover:underline" href={`/jobs/${job.id}/edit`}>
      Add
    </Link>
  );
  const estimateLines = lineData as EstimateLine[];
  const assignedMember = memberData as Member | null;
  const currentMember = currentMemberData as Member | null;
  const canDeleteJob = currentMember?.role === "owner";
  const changeOrders = changeOrderData as ChangeOrder[];
  // Now load the lines for all of this job's change orders in one go. If there aren't any change orders, we skip it.
  const changeOrderIds = changeOrders.map((changeOrder) => changeOrder.id);
  const { data: changeOrderLineData, error: changeOrderLineError } =
    changeOrderIds.length > 0
      ? await supabase
          .from("change_order_lines")
          .select("id, change_order_id, description, quantity_milli, unit_price_cents")
          .eq("business_id", job.business_id)
          .in("change_order_id", changeOrderIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

  // If that lookup failed, stop and say so.
  if (changeOrderLineError) {
    throw new Error(`Could not load change-order lines: ${changeOrderLineError.message}`);
  }

  // A safety check: each change order's saved total should match the sum of its lines. If it doesn't, we stop instead of showing money that's wrong.
  const changeOrderLines = changeOrderLineData as ChangeOrderLine[];
  for (const changeOrder of changeOrders) {
    const calculatedTotal = totalCents(
      changeOrderLines
        .filter((line) => line.change_order_id === changeOrder.id)
        .map((line) => ({
          quantityMilli: line.quantity_milli,
          unitPriceCents: line.unit_price_cents,
        })),
    );
    if (calculatedTotal !== changeOrder.total_cents) {
      throw new Error(
        `Change order ${changeOrder.id} has a stored total that does not match its lines.`,
      );
    }
  }

  // Now we draw the page.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-3xl">
        {/* A link back to the jobs list. */}
        <Link
          className="text-sm font-medium text-blue-700 hover:underline"
          href="/jobs"
        >
          ← Back to jobs
        </Link>

        {/* The top card: job description, action buttons, status and the job's ID. */}
        <header className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Job
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                {job.description}
              </h1>
            </div>
            {/* The row of buttons, plus the status. */}
            <div className="flex flex-wrap gap-2">
              {/* Opens your price book. */}
              <Link
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href="/pricebook"
              >
                Pricebook
              </Link>
              {/* Starts a new change order for this job. */}
              <Link
                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                href={`/jobs/${job.id}/change`}
              >
                New change order
              </Link>
              {/* Opens the job editor. */}
              <Link
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href={`/jobs/${job.id}/edit`}
              >
                Edit job
              </Link>
              {/* Opens the invoice you can print. */}
              <Link
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href={`/jobs/${job.id}/invoice`}
              >
                Invoice
              </Link>
              {/* Owners get the Delete button. Everyone else gets a note about why not. */}
              {canDeleteJob ? (
                <DeleteJobButton jobId={job.id} />
              ) : (
                <p className="py-2 text-sm text-zinc-500">
                  Only an owner can delete jobs.
                </p>
              )}
              <p className="text-sm capitalize text-zinc-600">
                <span className="text-zinc-500">Status:</span> {job.status}
              </p>
            </div>
          </div>
          {/* The job's ID, handy if you ever need to ask for support. */}
          <p className="mt-4 break-all text-xs text-zinc-500">
            Job ID: <code>{job.id}</code>
          </p>
        </header>

        {/* The customer card: name, address, email and phone. Anything missing gets a quick "Add" link to the edit page. */}
        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Customer</h2>
            <Link
              className="text-sm font-medium text-blue-700 hover:underline"
              href={`/jobs/${job.id}/edit`}
            >
              Edit contact
            </Link>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-zinc-500">Name</dt>
              <dd className="mt-1 font-medium text-zinc-950">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Address</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {/* Tapping the address opens it in the phone's maps app for directions. */}
                {customer.address ? (
                  <a
                    className="text-blue-700 underline underline-offset-2"
                    href={mapsHref(customer.address)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {customer.address}
                  </a>
                ) : (
                  <span className="text-zinc-600">No address on file {addLink}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {/* Tapping the email opens the phone's mail app with the customer already filled in. */}
                {customer.email ? (
                  <a
                    className="break-all text-blue-700 underline underline-offset-2"
                    href={`mailto:${customer.email}`}
                  >
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-zinc-600">No email on file {addLink}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Phone</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {/* Big Call and Text buttons so a thumb can reach the customer in one tap. */}
                {customer.phone && usPhoneDigits(customer.phone) && callHref(customer.phone) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{formatPhone(customer.phone)}</span>
                    <a
                      className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
                      href={callHref(customer.phone) ?? undefined}
                    >
                      Call
                    </a>
                    <a
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                      href={textHref(customer.phone) ?? undefined}
                    >
                      Text
                    </a>
                  </div>
                ) : (
                  <span className="text-zinc-600">
                    {customer.phone ? `${customer.phone} (incomplete) ` : "No phone on file "}
                    {addLink}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* The service visit card: the job's status and who's assigned. */}
        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Service visit</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-zinc-500">Status</dt>
              <dd className="mt-1 font-medium capitalize text-zinc-950">
                {job.status}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Assigned technician</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {assignedMember
                  ? `Technician (${assignedMember.user_id.slice(0, 8)})`
                  : "Not assigned"}
              </dd>
            </div>
          </dl>
        </section>

        {/* The original estimate card. */}
        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Original estimate</h2>
          <div className="mt-4">
            {/* A friendly note if no estimate lines have been added yet. */}
            {estimateLines.length === 0 && (
              <p className="mb-4 text-sm text-zinc-600">
                No estimate lines have been added.
              </p>
            )}
            {/* The table of estimate lines, with a total. */}
            <LineItems
              lines={estimateLines.map((line) => ({
                id: line.id,
                description: line.description,
                quantityMilli: line.quantity_milli,
                unitPriceCents: line.unit_price_cents,
              }))}
              totalLabel="Estimate total"
            />
          </div>
        </section>

        {/* The change orders card, with every change order for this job. */}
        <section
          className="mt-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          aria-labelledby="change-orders-heading"
        >
          {/* The card's title, with a shortcut to create a change order. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              className="text-lg font-semibold text-zinc-950"
              id="change-orders-heading"
            >
              Change orders
            </h2>
            <Link
              className="font-medium text-blue-700 hover:underline"
              href={`/jobs/${job.id}/change`}
            >
              Create change order
            </Link>
          </div>
          {/* No change orders? We say so. Otherwise, a box for each one. */}
          {changeOrders.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              No change orders have been created for this job.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {/* This repeats once per change order. */}
              {changeOrders.map((changeOrder) => {
                // Grab just this change order's lines.
                const lines = changeOrderLines.filter(
                  (line) => line.change_order_id === changeOrder.id,
                );
                // Draw this change order's box.
                return (
                  <article
                    className="rounded-lg border border-zinc-200 p-4"
                    key={changeOrder.id}
                  >
                    {/* The reason, the date it was made, and a colored status badge. */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-zinc-950">
                          {changeOrder.reason}
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Created{" "}
                          {new Date(changeOrder.created_at).toLocaleDateString("en-US")}
                        </p>
                      </div>
                      <StatusBadge status={changeOrderStatus(changeOrder.status)} />
                    </div>
                    {/* This change order's lines and total. */}
                    <div className="mt-4">
                      <LineItems
                        lines={lines.map((line) => ({
                          id: line.id,
                          description: line.description,
                          quantityMilli: line.quantity_milli,
                          unitPriceCents: line.unit_price_cents,
                        }))}
                        totalLabel="Change-order total"
                      />
                    </div>
                    {/* Only drafts get the "Send for customer approval" button, since the others have already gone out. */}
                    {changeOrder.status === "draft" && (
                      <SendApprovalButton changeOrderId={changeOrder.id} />
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
