// The "New job" page. It looks up your business's customers and technicians, then shows the form for making a job.
// The actual saving happens in actions.ts next door.

// Borrowed tools: our login/database connection (Supabase), page redirects, links, the save function and the form itself.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { createJob } from "./actions";
import JobForm from "./JobForm";

// A customer is an ID and a name.
type Customer = {
  id: string;
  name: string;
};

// A team member, identified by their user ID.
type Member = {
  user_id: string;
};

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// The page itself. It's built on the server, before anything gets to your browser.
// The web address can end in ?customer=ID, which pre-picks that customer (used by the "+ New job" button on a customer's page).
export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  // Wait until someone's actually visiting, so we show fresh info.
  await connection();
  const { customer: preselectedCustomerId } = await searchParams;
  // Are you signed in? If not, we send you to the login page, because we don't want strangers poking around.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Grab your user ID from the sign-in info.
  const userId = claims.claims.sub;
  if (typeof userId !== "string") {
    throw new Error("Your sign-in token did not contain a user ID.");
  }

  // Find which plumbing business you belong to.
  const { data: memberships, error: membershipError } = await supabase
    .from("members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError) {
    throw new Error(`Could not find your business membership: ${membershipError.message}`);
  }

  // Use the first one we find. If you don't belong to any, we stop with an error.
  const membershipRows = memberships as Array<{ business_id: string; role: string }>;
  const businessId = membershipRows[0]?.business_id;
  const isOwner = membershipRows[0]?.role === "owner";
  if (!businessId) {
    throw new Error("Your account is not linked to a plumbing business.");
  }

  // Get your business's customers (A to Z) and its technicians at the same time, so the form has people to pick from.
  const [{ data: customerData, error: customerError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("user_id")
        .eq("business_id", businessId)
        .eq("role", "tech"),
    ]);

  // If either lookup failed, stop and say so.
  if (customerError) {
    throw new Error(`Could not load customers: ${customerError.message}`);
  }
  if (memberError) {
    throw new Error(`Could not load technicians: ${memberError.message}`);
  }

  // Now we draw the page.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-3xl">
        {/* The top: a back link, the title and a one-line explainer. */}
        <header>
          <Link
            className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
            href="/jobs"
          >
            ← Back to jobs
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
            New job
          </h1>
          <p className="mt-2 text-zinc-600">
            Add the customer, service work, and original estimate.
          </p>
        </header>
        {/* The form itself. We hand it the save function, the customers and the technicians to choose from. */}
        <JobForm
          action={createJob}
          canAssign={isOwner}
          customers={customerData as Customer[]}
          defaultCustomerId={
            (customerData as Customer[]).some((c) => c.id === preselectedCustomerId)
              ? preselectedCustomerId
              : undefined
          }
          technicians={(memberData as Member[]).map((member) => ({
            userId: member.user_id,
          }))}
        />
      </div>
    </main>
  );
}
