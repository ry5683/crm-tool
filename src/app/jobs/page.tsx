// This is the main Jobs list, the first screen you land on after signing in. Think of it as a job board: one card per job with the customer, status and estimate total.
// From here you can open a job, edit it, delete it (owners only), start a new one, or sign out.

// Borrowed tools: our login/database connection (Supabase), money helpers, page redirects, links, plus our own sign-out and delete pieces.
import { createClient } from "@/lib/supabase/server";
import { formatCents, totalCents } from "@/lib/money";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "./actions";
import Link from "next/link";
import DeleteJobButton from "./[id]/DeleteJobButton";

// Quick descriptions of the info we pull in. A Job is its ID, which business it belongs to, its customer, description, status and when it was created.
type Job = {
  id: string;
  business_id: string;
  customer_id: string;
  description: string;
  status: string;
  created_at: string;
};

// A customer is just an ID and a name here.
type Customer = {
  id: string;
  name: string;
};

// One line on an estimate, like "2 faucets". It remembers which job it's for, the quantity (in thousandths, so 1 = 1000) and the price per item in cents.
type EstimateLine = {
  business_id: string;
  job_id: string;
  quantity_milli: number;
  unit_price_cents: number;
};

// The web address can end in ?id=something to show only one job.
type JobsPageProps = {
  searchParams: Promise<{ id?: string }>;
};

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// The page itself. It's built on the server, before anything gets to your browser.
export default async function JobsPage({ searchParams }: JobsPageProps) {
  // Hold on until someone's actually visiting, so we always show fresh info and never an old saved copy.
  await connection();
  const { id: requestedJobId } = await searchParams;
  // First things first: are you signed in? If not, we send you to the login page, because we don't want strangers poking around.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Ask the database (our online filing cabinet) for the jobs, newest first. If the address named one job, we only ask for that one.
  let jobsQuery = supabase
    .from("jobs")
    .select("id, business_id, customer_id, description, status, created_at")
    .order("created_at", { ascending: false });

  if (requestedJobId) {
    jobsQuery = jobsQuery.eq("id", requestedJobId);
  }

  // Run the request, and complain loudly if it fails.
  const { data: jobs, error: jobsError } = await jobsQuery;

  if (jobsError) {
    throw new Error(`Could not load jobs: ${jobsError.message}`);
  }

  // Work out which businesses you own. Only owners get a Delete button.
  const userId = claims.claims.sub;
  const { data: ownerRows, error: ownerError } = await supabase
    .from("members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("role", "owner");
  if (ownerError) {
    throw new Error(`Could not check your role: ${ownerError.message}`);
  }
  const ownedBusinessIds = new Set(
    (ownerRows as Array<{ business_id: string }>).map((row) => row.business_id),
  );

  // Make a list of the job IDs and of each customer we need to look up (no repeats).
  const jobRows = jobs as Job[];
  const jobIds = jobRows.map((job) => job.id);
  const customerIds = [...new Set(jobRows.map((job) => job.customer_id))];

  // Fetch the customers and the estimate lines for these jobs at the same time, which is quicker than one after another. If there are no jobs, we skip the trip.
  const [customerResult, lineResult] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? supabase
          .from("estimate_lines")
          .select("business_id, job_id, quantity_milli, unit_price_cents")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // If either lookup failed, stop and say so.
  if (customerResult.error) {
    throw new Error(`Could not load customers: ${customerResult.error.message}`);
  }
  if (lineResult.error) {
    throw new Error(`Could not load estimate totals: ${lineResult.error.message}`);
  }

  // Set up some handy lookups: customer ID to name, and a spot to hold each job's estimate total.
  const customers = customerResult.data as Customer[];
  const estimateLines = lineResult.data as EstimateLine[];
  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );
  const estimateTotals = new Map<string, number>();

  // Add up each job's estimate from its own lines. We only count lines from the same business as the job.
  for (const job of jobRows) {
    estimateTotals.set(
      job.id,
      totalCents(
        estimateLines
          .filter((line) => line.job_id === job.id && line.business_id === job.business_id)
          .map((line) => ({
            quantityMilli: line.quantity_milli,
            unitPriceCents: line.unit_price_cents,
          })),
      ),
    );
  }

  // Now we draw the page.
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-3xl">
        {/* The top of the page: title on the left, buttons on the right. */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Change Orders
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              Jobs
            </h1>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {/* Button to your price book. */}
            <Link
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
              href="/pricebook"
            >
              Pricebook
            </Link>
            {/* Button to make a new job. */}
            <Link
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              href="/jobs/new"
            >
              New job
            </Link>
            {/* The Sign out button. Pressing it runs that sign-out function from the top. */}
            <form action={signOut}>
              <button
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Here's the list of jobs. */}
        <section className="mt-8 space-y-3" aria-label="Your jobs">
          {/* No jobs? We show a friendly message. Otherwise, one card per job. */}
          {jobRows.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-600">
              {requestedJobId
                ? "No job with that ID is available to this account."
                : "No jobs are available for this account yet."}
            </p>
          ) : (
            // This repeats once for every job, making a card each.
            jobRows.map((job) => (
              <article
                className="rounded-xl border border-zinc-200 bg-white shadow-sm"
                key={job.id}
              >
                {/* The big clickable part of the card. Tap it to open the job. */}
                <Link
                  className="block rounded-t-xl p-5 transition-colors hover:bg-blue-50/40"
                  href={`/jobs/${job.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-950">
                        {job.description}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        Customer: {customerNames.get(job.customer_id) ?? "Unknown"}
                      </p>
                    </div>
                    <p className="text-sm capitalize text-zinc-600">
                      <span className="text-zinc-500">Status:</span> {job.status}
                    </p>
                  </div>
                  <p className="mt-4 font-semibold text-zinc-950">
                    Estimate: {formatCents(estimateTotals.get(job.id) ?? 0)}
                  </p>
                </Link>
                {/* The bottom strip of the card, with Edit and Delete. */}
                <div className="flex flex-wrap items-start gap-2 border-t border-zinc-100 px-5 py-3">
                  <Link
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                    href={`/jobs/${job.id}/edit`}
                  >
                    Edit
                  </Link>
                  {/* Owners get the Delete button. Everyone else just sees a note saying why they can't. */}
                  {ownedBusinessIds.has(job.business_id) ? (
                    <DeleteJobButton jobId={job.id} />
                  ) : (
                    <p className="py-2 text-sm text-zinc-500">
                      Only an owner can delete jobs.
                    </p>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
