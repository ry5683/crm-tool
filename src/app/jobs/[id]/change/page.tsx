// The "New change order" page for one job. It looks up the job and your price book, then shows the form.
// The actual saving happens in actions.ts next door.

// Borrowed tools: links, redirect and "not found" helpers, our login/database connection (Supabase) and the form.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ChangeOrderForm from "./ChangeOrderForm";

// The job's ID, which comes from the web address.
type ChangePageProps = {
  params: Promise<{ id: string }>;
};

// A price book item as it's stored: name, unit and price in cents.
type PricebookItem = {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
};

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// The page itself. It's built on the server, before anything gets to your browser.
export default async function ChangeOrderPage({ params }: ChangePageProps) {
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
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, business_id, description")
    .eq("id", id)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Could not load the job: ${jobError.message}`);
  }
  if (!job) {
    notFound();
  }

  // Get this business's price book, A to Z, so there's something to choose from.
  const { data, error } = await supabase
    .from("pricebook_items")
    .select("id, name, unit, price_cents")
    .eq("business_id", job.business_id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load the pricebook: ${error.message}`);
  }

  // Treat the result as a list of price book items.
  const items = data as PricebookItem[];

  // Now we draw the page.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-3xl">
        {/* A link back to the job. */}
        <Link
          className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
          href={`/jobs/${id}`}
        >
          ← Back to job
        </Link>
        {/* The top: the job's name, the page title and a quick explainer. */}
        <header className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-hivis-800">
            {job.description}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            New change order
          </h1>
          <p className="mt-2 text-zinc-600">
            Choose extra-work items from your pricebook. The current price will
            be copied into the saved draft.
          </p>
        </header>
        {/* Empty price book? We explain and point you to it. Otherwise, here's the form. */}
        {items.length === 0 ? (
          <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-amber-950">
              Add at least one pricebook item before creating a change order.
            </p>
            <Link
              className="mt-3 inline-block font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
              href="/pricebook"
            >
              Open pricebook
            </Link>
          </section>
        ) : (
          <ChangeOrderForm
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              unit: item.unit,
              priceCents: item.price_cents,
            }))}
            jobId={job.id}
          />
        )}
      </div>
    </main>
  );
}
