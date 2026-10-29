// This is what runs when your customer taps Approve or Decline. It's an API route, meaning an address on the server
// (the computer running the app). No login needed; the secret link is their proof it's really them.

// zod checks the data, then we grab our link-code helpers and the database connection.
import { z } from "zod";
import { decisionResponse } from "@/lib/approval-decision";
import { hashApprovalToken, isValidApprovalToken } from "@/lib/approval-token";
import { DECLINE_REASONS, DECLINE_NOTE_MAX } from "@/lib/decline-reasons";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodePngDataUrl } from "@/lib/image-check";
import { SIGNATURE_BUCKET } from "@/lib/storage";
import { randomUUID } from "node:crypto";

// What we need from the customer's browser: the secret code from their link, approve or decline, and the name they typed.
const bodySchema = z.object({
  token: z.string(),
  decision: z.enum(["approved", "declined"]),
  approverName: z.string().trim().min(1).max(120),
  declineReason: z.enum(DECLINE_REASONS.map((reason) => reason.code) as [string, ...string[]]).optional(),
  declineNote: z.string().trim().max(DECLINE_NOTE_MAX).optional(),
  // The drawn signature, as "data:image/png;base64,...". Required to approve.
  signature: z.string().max(400_000).optional(),
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

  // A decline needs a reason (and a note when the reason is "other"); an approval carries neither.
  const { decision, declineReason, declineNote } = parsed.data;
  if (decision === "declined" && (!declineReason || (declineReason === "other" && !declineNote))) {
    return Response.json({ error: "Please choose a reason for declining." }, { status: 400 });
  }
  if (decision === "approved" && (declineReason || declineNote)) {
    return Response.json({ error: "Check the approval details and try again." }, { status: 400 });
  }
  if (decision === "declined" && parsed.data.signature) {
    return Response.json({ error: "Check the approval details and try again." }, { status: 400 });
  }
  // Approving needs a real signature picture. We check its bytes, not just its label.
  const signatureBytes =
    decision === "approved" && parsed.data.signature
      ? decodePngDataUrl(parsed.data.signature)
      : null;
  if (decision === "approved" && !signatureBytes) {
    return Response.json({ error: "Please sign in the box to approve." }, { status: 400 });
  }

  // Hand the decision to the database. We send only the link's fingerprint (hash), never the link itself,
  // and the database does the real checking: not used already, not expired, not outdated.
  const supabase = await createClient();
  const tokenHash = hashApprovalToken(parsed.data.token);

  // Before saving any file, make sure this link is still good, so a bad or used link
  // can't be used to fill our storage with junk.
  let signaturePath: string | null = null;
  if (signatureBytes) {
    const { data: current, error: currentError } = await supabase.rpc("get_public_approval", {
      p_token_hash: tokenHash,
    });
    const currentStatus = (current as { status?: string } | null)?.status;
    if (currentError || currentStatus !== "valid") {
      const response = decisionResponse(currentStatus);
      return Response.json(response.body, { status: response.status });
    }

    signaturePath = `${randomUUID()}.png`;
    const { error: uploadError } = await createAdminClient()
      .storage.from(SIGNATURE_BUCKET)
      .upload(signaturePath, signatureBytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      console.error("Could not save the signature.", uploadError.message);
      return Response.json(
        { error: "Your signature could not be saved. Please try again." },
        { status: 502 },
      );
    }
  }

  // If the decision isn't recorded, the saved signature picture is thrown away.
  const discardSignature = async () => {
    if (!signaturePath) return;
    const { error: removeError } = await createAdminClient()
      .storage.from(SIGNATURE_BUCKET)
      .remove([signaturePath]);
    if (removeError) console.error("Could not remove an unused signature.", removeError.message);
  };

  const { data, error } = await supabase.rpc("decide_public_approval", {
    p_token_hash: tokenHash,
    p_decision: parsed.data.decision,
    p_approver_name: parsed.data.approverName,
    p_decline_reason: decision === "declined" ? declineReason : null,
    p_decline_note: decision === "declined" ? declineNote || null : null,
    p_signature_path: signaturePath,
  });

  // If the database itself broke, we keep the details private and just give the customer a gentle "try again."
  if (error || (data as { status?: string } | null)?.status !== "decided") {
    await discardSignature();
  }
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
