// The Invoices page: every job's bill in one list, with totals up top and a filter for Paid, Unpaid and Overdue.
// A job's invoice = its estimate + any extra work the customer approved. Owners can mark invoices paid.

import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import AnimatedMoney from "@/components/AnimatedMoney";
import { invoiceStatus, PAYMENT_TERMS_DAYS, type InvoiceStatus } from "@/lib/invoices";
import { formatCents, totalCents } from "@/lib/money";
import { requireSession } from "@/lib/session";
import PaidButton from "./PaidButton";

type JobRow = {
  id: string;
  description: string;
  created_at: string;
  paid_at: string | null;
  customers: { name: string } | null;
};
type Line = { job_id: string; quantity_milli: number; unit_price_cents: number };
type ChangeLine = { change_order_id: string; quantity_milli: number; unit_price_cents: number };

type InvoicesPageProps = { searchParams: Promise<{ status?: string }> };

export const instant = false;

// Pill colors and labels for each status.
const pill: Record<InvoiceStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  unpaid: { label: "Unpaid", className: "bg-amber-100 text-amber-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
};

const filters = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
] as const;

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  await connection();
  const { status: statusParam = "all" } = await searchParams;
  const { supabase, role } = await requireSession();

  // Jobs (with the customer's name), all estimate lines, and the approved change orders.
  const [jobResult, estimateResult, changeOrderResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, description, created_at, paid_at, customers(name)")
      .order("created_at", { ascending: false }),
    supabase.from("estimate_lines").select("job_id, quantity_milli, unit_price_cents"),
    supabase.from("change_orders").select("id, job_id").eq("status", "approved"),
  ]);
  if (jobResult.error) {
    // The most likely cause: migration 009 hasn't been applied yet.
    throw new Error(
      `Could not load invoices (has migration 009_invoice_payments.sql been applied?): ${jobResult.error.message}`,
    );
  }
  if (estimateResult.error) throw new Error(`Could not load estimates: ${estimateResult.error.message}`);
  if (changeOrderResult.error) throw new Error(`Could not load approved changes: ${changeOrderResult.error.message}`);

  const changeOrders = changeOrderResult.data as Array<{ id: string; job_id: string }>;
  const changeLineResult =
    changeOrders.length > 0
      ? await supabase
          .from("change_order_lines")
          .select("change_order_id, quantity_milli, unit_price_cents")
          .in("change_order_id", changeOrders.map((changeOrder) => changeOrder.id))
      : { data: [] as ChangeLine[], error: null };
  if (changeLineResult.error) {
    throw new Error(`Could not load approved change lines: ${changeLineResult.error.message}`);
  }

  // Gather every billable line under its job.
  const jobByChangeOrder = new Map(changeOrders.map((changeOrder) => [changeOrder.id, changeOrder.job_id]));
  const linesByJob = new Map<string, Array<{ quantityMilli: number; unitPriceCents: number }>>();
  const addLine = (jobId: string, line: { quantity_milli: number; unit_price_cents: number }) => {
    const list = linesByJob.get(jobId) ?? [];
    list.push({ quantityMilli: line.quantity_milli, unitPriceCents: line.unit_price_cents });
    linesByJob.set(jobId, list);
  };
  for (const line of estimateResult.data as Line[]) addLine(line.job_id, line);
  for (const line of changeLineResult.data as ChangeLine[]) {
    const jobId = jobByChangeOrder.get(line.change_order_id);
    if (jobId) addLine(jobId, line);
  }

  const now = new Date();
  const invoices = (jobResult.data as unknown as JobRow[])
    .map((job) => ({
      job,
      total: totalCents(linesByJob.get(job.id) ?? []),
      status: invoiceStatus(job.paid_at, job.created_at, now),
    }))
    // A job with nothing on it has nothing to bill.
    .filter((invoice) => invoice.total > 0);

  const sum = (wanted: InvoiceStatus[]) =>
    invoices.filter((i) => wanted.includes(i.status)).reduce((total, i) => total + i.total, 0);
  const outstanding = sum(["unpaid", "overdue"]);
  const overdue = sum(["overdue"]);
  const paid = sum(["paid"]);

  const active = filters.some((f) => f.key === statusParam) ? statusParam : "all";
  const shown = active === "all" ? invoices : invoices.filter((i) => i.status === active);

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Invoices are due {PAYMENT_TERMS_DAYS} days after the job is created.
          </p>
        </header>

        {/* Three big numbers: what you're owed, what's late, and what you've collected. */}
        <section aria-label="Totals" className="stagger mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Outstanding", cents: outstanding, color: "text-amber-700" },
            { label: "Overdue", cents: overdue, color: "text-red-700" },
            { label: "Paid", cents: paid, color: "text-emerald-700" },
          ].map((card, index) => (
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              key={card.label}
              style={{ "--i": index } as CSSProperties}
            >
              <p className="text-sm text-zinc-600">{card.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${card.color}`}>
                <AnimatedMoney cents={card.cents} />
              </p>
            </div>
          ))}
        </section>

        {/* Filter chips. They're plain links that reload the page with ?status=... */}
        <nav aria-label="Filter invoices" className="mt-6 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              aria-current={filter.key === active ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                filter.key === active
                  ? "bg-blue-700 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
              href={filter.key === "all" ? "/invoices" : `/invoices?status=${filter.key}`}
              key={filter.key}
            >
              {filter.label}
            </Link>
          ))}
        </nav>

        <section aria-label="Invoices" className="stagger mt-4 space-y-3">
          {shown.length === 0 ? (
            <div className="animate-rise rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
              <p aria-hidden="true" className="text-4xl">
                🧾
              </p>
              <p className="mt-3 font-semibold text-zinc-900">
                {invoices.length === 0 ? "No invoices yet" : "Nothing here"}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {invoices.length === 0
                  ? "Invoices show up once a job has an estimate."
                  : "No invoices match this filter."}
              </p>
            </div>
          ) : (
            shown.map(({ job, total, status }, index) => (
              <article
                className="lift rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                key={job.id}
                style={{ "--i": index } as CSSProperties}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link className="min-w-0 flex-1" href={`/jobs/${job.id}/invoice`}>
                    <p className="truncate font-semibold text-zinc-950">{job.customers?.name ?? "Customer"}</p>
                    <p className="truncate text-sm text-zinc-600">{job.description}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {job.paid_at
                        ? `Paid ${new Date(job.paid_at).toLocaleDateString("en-US")}`
                        : `Created ${new Date(job.created_at).toLocaleDateString("en-US")}`}
                    </p>
                  </Link>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-zinc-950">{formatCents(total)}</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${pill[status].className}`}>
                      {pill[status].label}
                    </span>
                  </div>
                </div>
                {role === "owner" && (
                  <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
                    <PaidButton jobId={job.id} paid={status === "paid"} />
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
