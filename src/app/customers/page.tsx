// The Customers page: everyone you do work for, in one searchable list. Tap a customer to see their details and job history.

// Borrowed tools: links, the page-freshness helper, our logo, phone-format and call helpers, and the shared sign-in check.
import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { callHref, formatPhone } from "@/lib/contact";
import { requireSession } from "@/lib/session";

// A customer as stored in the database.
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

// The web address can end in ?q=something to search.
type CustomersPageProps = { searchParams: Promise<{ q?: string }> };

// Tells Next.js not to nag about loading speed, since this page waits on live data.
export const instant = false;

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await connection();
  const { q = "" } = await searchParams;
  const { supabase } = await requireSession();

  // Fetch the customers (A to Z) and a light list of jobs, so we can show how many jobs each customer has.
  const [customerResult, jobResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address")
      .order("name", { ascending: true }),
    supabase.from("jobs").select("customer_id"),
  ]);
  if (customerResult.error) {
    throw new Error(`Could not load customers: ${customerResult.error.message}`);
  }
  if (jobResult.error) {
    throw new Error(`Could not load jobs: ${jobResult.error.message}`);
  }

  // Count jobs per customer.
  const jobCounts = new Map<string, number>();
  for (const job of jobResult.data as Array<{ customer_id: string }>) {
    jobCounts.set(job.customer_id, (jobCounts.get(job.customer_id) ?? 0) + 1);
  }

  // Search: match the name, email, address or phone digits. Done here in plain code, so odd characters can't upset the database.
  const query = q.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, "");
  const allCustomers = customerResult.data as Customer[];
  const customers = query
    ? allCustomers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(query) ||
          (customer.email ?? "").toLowerCase().includes(query) ||
          (customer.address ?? "").toLowerCase().includes(query) ||
          (queryDigits.length > 0 &&
            (customer.phone ?? "").replace(/\D/g, "").includes(queryDigits)),
      )
    : allCustomers;

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Title on the left, Add button on the right. */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Customers</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {allCustomers.length} {allCustomers.length === 1 ? "customer" : "customers"}
            </p>
          </div>
          <Link
            className="rounded-lg bg-hivis-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm hover:bg-hivis-500"
            href="/customers/new"
          >
            + Add customer
          </Link>
        </header>

        {/* The search box. It's a plain form that reloads the page with ?q=what-you-typed. */}
        <form action="/customers" className="mt-6" role="search">
          <label className="sr-only" htmlFor="q">
            Search customers
          </label>
          <input
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 shadow-sm"
            defaultValue={q}
            id="q"
            name="q"
            placeholder="Search by name, phone, email or address"
            type="search"
          />
        </form>

        <section aria-label="Your customers" className="stagger mt-6 space-y-3">
          {customers.length === 0 ? (
            // Nothing to show: either no customers yet, or the search found nothing.
            <div className="animate-rise rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
              <p aria-hidden="true" className="text-4xl">
                👋
              </p>
              <p className="mt-3 font-semibold text-zinc-900">
                {query ? "No matches" : "No customers yet"}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {query
                  ? "Try a different name, number or address."
                  : "Add your first customer to get started."}
              </p>
              {!query && (
                <Link
                  className="mt-5 inline-block rounded-lg bg-hivis-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-hivis-500"
                  href="/customers/new"
                >
                  Add your first customer
                </Link>
              )}
            </div>
          ) : (
            customers.map((customer, index) => {
              const jobs = jobCounts.get(customer.id) ?? 0;
              return (
                <article
                  className="lift rounded-xl border border-zinc-200 bg-white shadow-sm"
                  key={customer.id}
                  style={{ "--i": Math.min(index, 10) } as CSSProperties}
                >
                  {/* The big tappable part opens the customer's page. */}
                  <Link className="block rounded-t-xl p-5 hover:bg-hivis-50" href={`/customers/${customer.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {/* A round badge with the customer's first initial. */}
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-hivis-100 font-semibold text-hivis-900"
                        >
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <h2 className="font-semibold text-zinc-950">{customer.name}</h2>
                          <p className="text-sm text-zinc-600">{customer.address ?? "No address"}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                        {jobs} {jobs === 1 ? "job" : "jobs"}
                      </span>
                    </div>
                  </Link>
                  {/* A quick contact strip: tap the number to call, or the email to write. */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-zinc-100 px-5 py-3 text-sm">
                    {customer.phone && callHref(customer.phone) ? (
                      <a className="font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950" href={callHref(customer.phone) ?? undefined}>
                        {formatPhone(customer.phone)}
                      </a>
                    ) : (
                      <span className="text-zinc-500">No phone</span>
                    )}
                    {customer.email ? (
                      <a className="break-all text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950" href={`mailto:${customer.email}`}>
                        {customer.email}
                      </a>
                    ) : (
                      <span className="text-zinc-500">No email</span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
