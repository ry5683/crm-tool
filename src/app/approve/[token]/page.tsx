// This is the page your customer lands on from the emailed link (/approve/ plus their secret code). No sign-in needed; the secret code is their proof.
// It pulls up the change order, or explains why the link won't work. (className text like "rounded-xl bg-white" is Tailwind shorthand for looks.)

// Borrowing the line-item table, the money math, the link-code helpers, the database connection and the Approve/Decline form.
import Brand from "@/components/Brand";
import LineItems from "@/components/LineItems";
import { totalCents } from "@/lib/money";
import { hashApprovalToken, isValidApprovalToken } from "@/lib/approval-token";
import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import DecisionForm from "./DecisionForm";
import { PHOTO_BUCKET, signedLinks } from "@/lib/storage";

// One line of work as the database hands it over (quantity in thousandths, price in cents).
type ApprovalLine = {
  id: string;
  description: string;
  quantity_milli: number;
  unit_price_cents: number;
};

// What the database tells us about a link: is it usable, and if so the business, job, reason, lines and total.
type PublicApproval = {
  status: "valid" | "invalid" | "expired" | "already_decided" | "outdated";
  business_name?: string;
  job_reference?: string;
  reason?: string;
  total_cents?: number;
  lines?: ApprovalLine[];
  photos?: string[];
  decision?: "approved" | "declined";
  approver_name?: string;
};

// The secret code arrives as part of the web address.
type ApprovalPageProps = { params: Promise<{ token: string }> };

// Next.js setting: build this page fresh for every visit instead of reusing an old copy.
export const instant = false;

// A little yellow notice that explains why a link can't be used.
function ApprovalStatusMessage({ status }: { status: Exclude<PublicApproval["status"], "valid"> }) {
  // The plain-English message for each kind of problem.
  const messages = {
    invalid: "This approval link is invalid or no longer available.",
    expired: "This approval link has expired. Please contact the plumbing company for a new link.",
    already_decided: "A decision has already been recorded for this change order.",
    outdated: "This approval link is for an older version. Please contact the plumbing company for an updated link.",
  };

  // Draw the notice with the right message.
  return (
    <p className="mt-6 rounded-lg bg-amber-50 p-4 text-amber-950" role="status">
      {messages[status]}
    </p>
  );
}

// This is the page itself. It runs on the server (the computer hosting the app) every time a customer opens their link.
export default async function ApprovalPage({ params }: ApprovalPageProps) {
  // Make sure the page is built fresh for this visit.
  await connection();
  // First, grab the secret code out of the address.
  const { token } = await params;
  // If the code isn't even shaped like a real one, show "link unavailable" without bugging the database.
  if (!isValidApprovalToken(token)) {
    // Draw the "link unavailable" card.
    return (
      <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-12">
        <section className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Brand />
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-hivis-800">
            Change-order approval
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Approval link unavailable
          </h1>
          <ApprovalStatusMessage status="invalid" />
        </section>
      </main>
    );
  }

  // Now ask the database about this link. We only send the code's fingerprint (hash), since that's all we ever stored.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_approval", {
    p_token_hash: hashApprovalToken(token),
  });
  // A database failure is a real problem, not a bad link, so we raise it.
  if (error) {
    throw new Error(`Could not load the approval request: ${error.message}`);
  }

  // If the link wasn't found or can't be used (expired, already answered, outdated), show the matching message.
  const approval = data as PublicApproval | null;
  if (!approval || approval.status !== "valid") {
    const status =
      approval && approval.status !== "valid" ? approval.status : "invalid";
    // Draw the "link unavailable" card with the specific reason.
    return (
      <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-12">
        <section className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Brand />
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-hivis-800">
            Change-order approval
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Approval link unavailable
          </h1>
          <ApprovalStatusMessage status={status} />
        </section>
      </main>
    );
  }

  if (
    // Safety check: make sure the database gave us every detail we need to show.
    !approval.business_name ||
    !approval.job_reference ||
    !approval.reason ||
    !approval.lines ||
    !Number.isSafeInteger(approval.total_cents)
  ) {
    throw new Error("The approval service returned incomplete public details.");
  }

  // We add up the lines ourselves and compare to the database's total, so the customer never sees numbers that don't match.
  const calculatedTotal = totalCents(
    approval.lines.map((line) => ({
      quantityMilli: line.quantity_milli,
      unitPriceCents: line.unit_price_cents,
    })),
  );
  // If they don't match, something's wrong, so we stop rather than show bad figures.
  if (calculatedTotal !== approval.total_cents) {
    throw new Error("The approval total does not match its line items.");
  }

  // Everything checks out, so draw the full approval page: business, reason, work and total, then the decision form.
  // Only this page's own server can turn the private photo locations into viewable links.
  const photoPaths = (approval.photos ?? []).filter((path) => typeof path === "string");
  const photoLinks = await signedLinks(PHOTO_BUCKET, photoPaths);
  const photoUrls = photoPaths
    .map((path) => photoLinks.get(path))
    .filter((url): url is string => Boolean(url));

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        {/* A small label across the top. */}
        <Brand />
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-hivis-800">
          Change-order approval
        </p>
        {/* The business name as the big title. */}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          {approval.business_name}
        </h1>
        {/* The job's reference so the customer can match it to their own records. */}
        <p className="mt-2 text-sm text-zinc-600">
          Job reference {approval.job_reference}
        </p>
        {/* Why the extra work is needed, in the reason you wrote. */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950">
            Why the extra work is needed
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-zinc-700">{approval.reason}</p>
        </section>
        {/* The proposed work with prices and the total. */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-950">
            Proposed work
          </h2>
          <LineItems
            lines={approval.lines.map((line) => ({
              id: line.id,
              description: line.description,
              quantityMilli: line.quantity_milli,
              unitPriceCents: line.unit_price_cents,
            }))}
            totalLabel="Change-order total"
          />
          {/* Totals here are before tax, so the customer isn't surprised by the invoice. */}
          <p className="mt-3 text-sm text-zinc-600">
            Prices shown before sales tax. Any tax on taxable items is added on your invoice.
          </p>
        </section>
        {/* Photos the plumber took, shown through links that expire after a few minutes. */}
        {photoUrls.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-zinc-950">Photos</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photoUrls.map((url, index) => (
                <li key={url}>
                  <a href={url} rel="noreferrer" target="_blank">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private links can't go through Next's image optimizer */}
                    <img
                      alt={`Photo ${index + 1} of the work`}
                      className="aspect-square w-full rounded-lg border border-zinc-200 object-cover"
                      src={url}
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* The Approve / Decline form, which gets the secret code passed along. */}
        <DecisionForm token={token} />
      </article>
    </main>
  );
}
