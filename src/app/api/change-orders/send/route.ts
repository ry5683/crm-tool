// This is the "Send for approval" button's back office. An API route is just an address on the server
// (the computer running the app) that the browser can call. This one emails your customer their private approval link.

// zod is our bouncer for incoming data. The rest are our own helpers for making the secret link, sending mail, and reaching the database.
import { z } from "zod";
import { createApprovalToken, hashApprovalToken } from "@/lib/approval-token";
import { sendApprovalRequestEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/field-crypto";
import { appOrigin } from "@/lib/app-url";

// All the browser has to tell us is which change order to send. A uuid is just a long one-of-a-kind ID.
const bodySchema = z.object({ changeOrderId: z.uuid() });

// POST means "here, take this." This runs once every time someone hits Send.
export async function POST(request: Request) {
  // First, make sure the request came from our own website. Otherwise some other site could trick a signed-in person into sending emails.
  const origin = request.headers.get("origin");
  let originIsValid = false;
  try {
    originIsValid =
      origin !== null && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    originIsValid = false;
  }
  // Request came from somewhere else? Shut the door (403 means "not allowed").
  if (!originIsValid || !origin) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  // Now read what the browser sent. If it's garbled, say so (400 means "that request makes no sense").
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  // Make sure that change order ID is actually a proper ID before we go any further.
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Choose a valid change order." }, { status: 400 });
  }

  // Next, check who's asking. Supabase is the online service that holds our database and logins.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    return Response.json({ error: "Sign in to send this change order." }, { status: 401 });
  }

  // Here's the clever bit: we make a one-time secret code for the link, but only save a scrambled fingerprint of it (a hash).
  // That way, if the database ever got stolen, nobody could rebuild a working link from it.
  const token = createApprovalToken();
  const tokenHash = hashApprovalToken(token);
  const { data, error } = await supabase.rpc("send_change_order_for_approval", {
    p_change_order_id: parsed.data.changeOrderId,
    p_token_hash: tokenHash,
  });

  // If the database says no (maybe the change order isn't ready to send), pass the reason along.
  if (error) {
    return Response.json(
      { error: `Could not prepare the approval request: ${error.message}` },
      { status: 400 },
    );
  }

  // The database hands back the customer's email and job details so we can write the email.
  const requestDetails = data?.[0] as
    | {
        approval_id: string;
        customer_email: string;
        business_name: string;
        job_description: string;
        reason: string;
        total_cents: number;
      }
    | undefined;
  // Belt and suspenders: the database said OK but gave us nothing, so something's off.
  if (!requestDetails) {
    throw new Error("The database prepared an approval request without returning its details.");
  }

  // Build the customer's link. The real secret goes in the link itself; we only keep the fingerprint.
  const approvalUrl = new URL(`/approve/${token}`, appOrigin(origin)).toString();
  try {
    // Now actually email the customer the link, what the work is, and the total.
    await sendApprovalRequestEmail({
      to: decryptField(requestDetails.customer_email, "customer.email"),
      businessName: requestDetails.business_name,
      description: `${requestDetails.job_description}: ${requestDetails.reason}`,
      totalCents: requestDetails.total_cents,
      approvalUrl,
    });
  } catch (emailError) {
    // If the email didn't go out, we flip the change order back to a draft. Otherwise it'd look sent when the customer never got anything.
    const { data: rolledBack, error: rollbackError } = await supabase.rpc(
      "rollback_unsent_approval",
      { p_approval_id: requestDetails.approval_id },
    );

    if (rollbackError || rolledBack !== true) {
      throw new Error(
        "Email delivery failed and the approval request could not be returned to draft. Check the change order in Supabase.",
        { cause: rollbackError ?? new Error("The rollback function reported no change.") },
      );
    }

    // We log the real reason for ourselves and tell the user the email failed (502 means a service we rely on let us down).
    const message =
      emailError instanceof Error ? emailError.message : "Unknown email delivery error.";
    console.error("Approval email delivery failed; the request was rolled back.", message);
    return Response.json(
      { error: "Email could not be sent. Check the sender configuration and try again." },
      { status: 502 },
    );
  }

  // All good, so tell the browser the email is on its way.
  return Response.json({ sent: true });
}
