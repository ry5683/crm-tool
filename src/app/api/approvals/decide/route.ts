// This is what runs when your customer taps Approve or Decline. It's an API route, meaning an address on the server
// (the computer running the app). No login needed; the secret link is their proof it's really them.

// zod checks the data, then we grab our link-code helpers and the database connection.
import { z } from "zod";
import { decisionResponse } from "@/lib/approval-decision";
import { hashApprovalToken, isValidApprovalToken } from "@/lib/approval-token";
import { createClient } from "@/lib/supabase/server";

// What we need from the customer's browser: the secret code from their link, approve or decline, and the name they typed.
const bodySchema = z.object({
  token: z.string(),
  decision: z.enum(["approved", "declined"]),
  approverName: z.string().trim().min(1).max(120),
});

// POST means "here, take this." Runs every time a customer answers.
export async function POST(request: Request) {
  // First, read what came in. If it's gibberish, bounce it back (400 means "bad request").
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  // Check everything's filled in and the code at least looks like a real one before we bother the database.
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isValidApprovalToken(parsed.data.token)) {
    return Response.json({ error: "Check the approval details and try again." }, { status: 400 });
  }

  // Hand the decision to the database. We send only the link's fingerprint (hash), never the link itself,
  // and the database does the real checking: not used already, not expired, not outdated.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_public_approval", {
    p_token_hash: hashApprovalToken(parsed.data.token),
    p_decision: parsed.data.decision,
    p_approver_name: parsed.data.approverName,
  });

  // If the database itself broke, we keep the details private and just give the customer a gentle "try again."
  if (error) {
    console.error("Could not record the customer approval decision.", error.message);
    return Response.json(
      { error: "The decision could not be recorded. Please try again." },
      { status: 500 },
    );
  }

  // Last step: translate the database's answer (decided, already used, expired...) into a reply the browser understands.
  const result = data as { status?: string } | null;
  const response = decisionResponse(result?.status);
  return Response.json(response.body, { status: response.status });
}
