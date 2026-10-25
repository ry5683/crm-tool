// One customer's page: their contact details with tap-to-call, text, email and directions, plus every job you've done for them.

import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { callHref, formatPhone, mapsHref, textHref, usPhoneDigits } from "@/lib/contact";
import { formatCents, totalCents } from "@/lib/money";
import { requireSession } from "@/lib/session";
import DeleteCustomerButton from "../DeleteCustomerButton";

type CustomerPageProps = { params: Promise<{ id: string }> };

// Tells Next.js not to nag about loading speed, since this page waits on live data.
export const instant = false;

// A job for this customer, and one estimate line (used to add up what each job is worth).
type Job = { id: string; business_id: string; description: string; status: string; created_at: string };
type EstimateLine = { job_id: string; quantity_milli: number; unit_price_cents: number };

export default async function CustomerPage({ params }: CustomerPageProps) {
  await connection();
  const { id } = await params;
  // A web address that isn't a real ID can't be a customer.
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, role } = await requireSession();

  // Look up the customer and their jobs at the same time.
  const [customerResult, jobResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, business_id, description, status, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (customerResult.error) {
    throw new Error(`Could not load the customer: ${customerResult.error.message}`);
  }
  if (jobResult.error) {
    throw new Error(`Could not load jobs: ${jobResult.error.message}`);
  }
  const customer = customerResult.data;
  if (!customer) notFound();
  const jobs = jobResult.data as Job[];

  // Add up each job's estimate so we can show what it's worth, and a grand total for this customer.
  const jobIds = jobs.map((job) => job.id);
  const { data: lineData, error: lineError } =
    jobIds.length > 0
      ? await supabase
          .from("estimate_lines")
          .select("job_id, quantity_milli, unit_price_cents")
          .in("job_id", jobIds)
      : { data: [], error: null };
  if (lineError) {
    throw new Error(`Could not load estimates: ${lineError.message}`);
  }
  const lines = lineData as EstimateLine[];
  const jobTotals = new Map<string, number>(
    jobs.map((job) => [
      job.id,
      totalCents(
        lines
          .filter((line) => line.job_id === job.id)
          .map((line) => ({
            quantityMilli: line.quantity_milli,
            unitPriceCents: line.unit_price_cents,
          })),
      ),
    ]),
  );
  const lifetimeCents = [...jobTotals.values()].reduce((sum, value) => sum + value, 0);

  // Only a full 10-digit phone gets Call and Text buttons.
  const dialable = customer.phone && usPhoneDigits(customer.phone) ? customer.phone : null;

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950" href="/customers">
          ← Back to customers
        </Link>

        {/* The header: avatar, name, and the main actions. */}
        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-hivis-100 text-xl font-semibold text-hivis-900"
            >
              {customer.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{customer.name}</h1>
              <p className="text-sm text-zinc-600">
                Customer since{" "}
                {new Date(customer.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              className="rounded-lg bg-hivis-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-hivis-500"
              href={`/jobs/new?customer=${customer.id}`}
            >
              + New job
            </Link>
            <Link
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              href={`/customers/${customer.id}/edit`}
            >
              Edit
            </Link>
            {role === "owner" && <DeleteCustomerButton customerId={customer.id} />}
          </div>
        </header>

        {/* Two quick numbers: how many jobs, and what they're worth in estimates. */}
        <section className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Jobs</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-950">{jobs.length}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Estimated work</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-950">{formatCents(lifetimeCents)}</p>
          </div>
        </section>

        {/* Contact details, each one tappable. */}
        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Contact</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-zinc-500">Phone</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium text-zinc-950">
                {dialable ? (
                  <>
                    <span className="tabular-nums">{formatPhone(dialable)}</span>
                    <a className="inline-flex min-h-11 items-center rounded-lg bg-hivis-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-hivis-500" href={callHref(dialable) ?? undefined}>
                      Call
                    </a>
                    <a className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50" href={textHref(dialable) ?? undefined}>
                      Text
                    </a>
                  </>
                ) : (
                  <span className="text-zinc-600">{customer.phone ? `${customer.phone} (incomplete)` : "No phone on file"}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {customer.email ? (
                  <a className="break-all text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950" href={`mailto:${customer.email}`}>
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-zinc-600">No email on file</span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-zinc-500">Address</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {customer.address ? (
                  <a
                    className="text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
                    href={mapsHref(customer.address)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {customer.address}
                  </a>
                ) : (
                  <span className="text-zinc-600">No address on file</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Their job history. */}
        <section className="mt-5">
          <h2 className="text-lg font-semibold text-zinc-950">Jobs</h2>
          {jobs.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
              <p className="font-semibold text-zinc-900">No jobs yet</p>
              <p className="mt-1 text-sm text-zinc-600">Start one for {customer.name} and it will show up here.</p>
              <Link
                className="mt-4 inline-block rounded-lg bg-hivis-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-hivis-500"
                href={`/jobs/new?customer=${customer.id}`}
              >
                Create a job
              </Link>
            </div>
          ) : (
            <ul className="stagger mt-3 space-y-3">
              {jobs.map((job, index) => (
                <li key={job.id} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
                  <Link
                    className="lift flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                    href={`/jobs/${job.id}`}
                  >
                    <div>
                      <p className="font-medium text-zinc-950">{job.description}</p>
                      <p className="mt-1 text-sm capitalize text-zinc-600">
                        {job.status} ·{" "}
                        {new Date(job.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums text-zinc-950">
                      {formatCents(jobTotals.get(job.id) ?? 0)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
