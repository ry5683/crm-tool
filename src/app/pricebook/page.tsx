// This is the Pricebook page (/pricebook), the list of parts and labor rates for the signed-in person's plumbing business.
// It loads the data on the server (the computer hosting the app) and hands it to PricebookManager to show. (className text is Tailwind shorthand for looks.)

// Borrowing a link, a redirect, a freshness helper, the database connection and the pricebook display.
import Brand from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import PricebookManager from "./PricebookManager";

// A person's tie to a business, plus their role (like owner).
type Membership = { business_id: string; role: string };
// One price book entry: ID, name, unit and price in cents.
type PricebookItem = {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
};

// Next.js setting: build this page fresh each visit.
export const instant = false;

// The page itself.
export default async function PricebookPage() {
  // Make sure the page is built fresh for this visit.
  await connection();
  // First, make sure they're signed in. If not, off to the login page.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Grab the signed-in person's ID.
  const userId = claims.claims.sub;
  if (typeof userId !== "string") {
    throw new Error("Your sign-in token did not contain a user ID.");
  }

  // Next, find which business they belong to and what their role is.
  const { data: membershipData, error: membershipError } = await supabase
    .from("members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Could not load your business membership: ${membershipError.message}`);
  }
  if (!membershipData) {
    throw new Error("Your account is not linked to a plumbing business.");
  }

  // Now load that business's items, sorted by name.
  const membership = membershipData as Membership;
  const { data, error } = await supabase
    .from("pricebook_items")
    .select("id, name, unit, price_cents")
    .eq("business_id", membership.business_id)
    .order("name", { ascending: true });

  // If loading failed, stop with a clear message.
  if (error) {
    throw new Error(`Could not load the pricebook: ${error.message}`);
  }

  // Draw the page: a back link, the heading, then the pricebook.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* A link back to the jobs list. */}
        <Link
          className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950"
          href="/jobs"
        >
          ← Back to jobs
        </Link>
        {/* The page heading. The sentence under it depends on whether you're an owner. */}
        <header className="mt-4">
          <div className="md:hidden">
              <Brand />
            </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Pricebook
          </h1>
          <p className="mt-2 text-zinc-600">
            {membership.role === "owner"
              ? "Manage the parts and labor rates your team can use."
              : "View the parts and labor rates available to your team."}
          </p>
        </header>
        {/* The list and forms. Only owners can edit. */}
        <PricebookManager
          canEdit={membership.role === "owner"}
          items={data as PricebookItem[]}
        />
      </div>
    </main>
  );
}
