"use server";

// This saves a new change order (the extra work you found on a job). It's a "server action": a function that runs on our server when the form is sent.
// The change order form hands its answers over to it.

// Borrowed tools: refresh saved pages, move you to another page, a checker for incoming info (zod), and our login/database connection (Supabase).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// What we report back to the form: an error message, or null (nothing) if it all went fine.
export type CreateChangeOrderState = { error: string | null };

// The rules for a good change order: a reason (500 letters max) and 1 to 50 lines, each pointing to a price book item with a whole-number quantity.
// Quantities are stored in thousandths, so 1 item is 1000.
const changeOrderInputSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  lines: z
    .array(
      z.object({
        pricebookItemId: z.uuid(),
        quantityMilli: z
          .number()
          .int()
          .positive()
          .max(2_147_483_000)
          .refine((quantity) => quantity % 1_000 === 0, "Quantity must be a whole number."),
      }),
    )
    .min(1)
    .max(50),
});

// The actual save. It runs when you submit the change order form.
export async function createChangeOrder(
  _previousState: CreateChangeOrderState,
  formData: FormData,
): Promise<CreateChangeOrderState> {
  // First, grab the raw answers out of the form.
  const jobIdValue = formData.get("jobId");
  const linesValue = formData.get("lines");
  const reasonValue = formData.get("reason");

  // Everything should arrive as plain text. If something's missing, the form wasn't filled in right.
  if (
    typeof jobIdValue !== "string" ||
    typeof linesValue !== "string" ||
    typeof reasonValue !== "string"
  ) {
    return { error: "The form is incomplete. Please check it and try again." };
  }
  // A job ID is a long code of letters and numbers; if this one doesn't look like one, we stop right here.
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobIdValue)) {
    return { error: "The job ID is invalid." };
  }

  // The form packs all the lines into one chunk of text, so we unpack it here. If it's garbled, we just ask you to try again.
  let parsedLines: unknown;
  try {
    parsedLines = JSON.parse(linesValue);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { error: "The change-order lines could not be read. Please try again." };
    }
    throw error;
  }

  // Now check everything against the rules above. The server does this again even though the form already did, because a browser can be tampered with.
  const parsed = changeOrderInputSchema.safeParse({
    reason: reasonValue,
    lines: parsedLines,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the change-order details." };
  }

  // Make sure you're signed in. If not, off to the login page.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Look up the job. If we can't find it, it's either gone or not yours to touch.
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("id, business_id")
    .eq("id", jobIdValue)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Could not check the job: ${jobError.message}`);
  }
  if (!jobData) {
    return { error: "That job is not available to your account." };
  }

  // Save the change order and all its lines together in one go, so it can't end up half saved.
  // Notice we only send item IDs and quantities, never prices from the browser.
  const { data: changeOrderId, error: saveError } = await supabase.rpc(
    "create_change_order_with_lines",
    {
      p_business_id: jobData.business_id,
      p_job_id: jobData.id,
      p_reason: parsed.data.reason,
      p_lines: parsed.data.lines.map((line) => ({
        pricebook_item_id: line.pricebookItemId,
        quantity_milli: line.quantityMilli,
      })),
    },
  );

  // If saving failed, tell the person why.
  if (saveError) {
    return { error: `Could not save the change order: ${saveError.message}` };
  }
  if (typeof changeOrderId !== "string") {
    throw new Error("The change order was saved but the database did not return its ID.");
  }

  // All saved. Refresh the job page so the new change order shows up, and take you there.
  revalidatePath(`/jobs/${jobIdValue}`);
  redirect(`/jobs/${jobIdValue}`);
}
