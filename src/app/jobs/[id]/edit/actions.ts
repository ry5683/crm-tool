"use server";

// This saves your changes to an existing job: customer details, description, technician and estimate lines. It's a "server action": a function that runs on our server when the Edit form is sent.

// Borrowed tools: refresh saved pages, move you to another page, zod (checks incoming info), our login/database connection, and a shared result type.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CreateJobState } from "../../new/actions";

// The rules for the customer's details: a name is a must, while email, phone and address are optional. Blanks count as "not given", and an email has to look like one.
const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined,
    z.email().optional(),
  ),
  phone: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined,
    z.string().optional(),
  ),
  address: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined,
    z.string().optional(),
  ),
});

// The rules for the job: real job and customer IDs, a description, and at least one estimate line with a whole-number quantity and a price in cents.
// Quantities are stored in thousandths, so 1 item is 1000.
const updateJobInputSchema = z.object({
  jobId: z.uuid(),
  customerId: z.uuid(),
  description: z.string().trim().min(1, "Job description is required."),
  estimateLines: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Line description is required."),
        quantityMilli: z
          .number()
          .int()
          .positive()
          .max(2_147_483_000)
          .refine((quantity) => quantity % 1_000 === 0, "Quantity must be a whole number."),
        unitPriceCents: z.number().int().positive().max(2_147_483_647),
      }),
    )
    .min(1, "Add at least one estimate line."),
});

// The actual save. It runs when you submit the Edit form.
export async function updateJob(
  _previousState: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  // Start by grabbing the raw answers from the form.
  const jobId = formData.get("jobId");
  const customerId = formData.get("customerId");
  const assignedTechId = formData.get("assignedTechId");
  const description = formData.get("description");
  const linesValue = formData.get("estimateLines");

  // These should all be plain text. If one's missing, the form wasn't filled in properly.
  if (
    typeof jobId !== "string" ||
    typeof customerId !== "string" ||
    typeof assignedTechId !== "string" ||
    typeof description !== "string" ||
    typeof linesValue !== "string"
  ) {
    return { error: "The form is incomplete. Please check it and try again." };
  }

  // The form packs the estimate lines into one chunk of text, so we unpack it here. If it's garbled, we ask you to try again.
  let estimateLines: unknown;
  try {
    estimateLines = JSON.parse(linesValue);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { error: "The estimate lines could not be read. Please try again." };
    }
    throw error;
  }

  // Check the customer's details against the rules.
  const customerResult = customerInputSchema.safeParse({
    name: formData.get("customerName"),
    email: formData.get("customerEmail"),
    phone: formData.get("customerPhone"),
    address: formData.get("customerAddress"),
  });
  if (!customerResult.success) {
    return { error: customerResult.error.issues[0]?.message ?? "Check the customer details." };
  }

  // Now check the job itself. The server re-checks everything even though the form already did, because a browser can be tampered with.
  const parsed = updateJobInputSchema.safeParse({
    jobId,
    customerId,
    description,
    estimateLines,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the job details." };
  }

  // Assigning a technician is optional. Blank means nobody, and if you did pick someone, their ID has to look real.
  const normalizedTechId = assignedTechId === "" ? null : assignedTechId;
  if (
    normalizedTechId !== null &&
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(normalizedTechId)
  ) {
    return { error: "Choose a technician from the list." };
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

  // Save the customer, job and estimate lines together in one go, so nothing ends up half saved. If you're not allowed to edit this job, the database says no and we pass that along.
  const { error } = await supabase.rpc("update_job_with_estimate", {
    p_job_id: parsed.data.jobId,
    p_customer_id: parsed.data.customerId,
    p_customer_name: customerResult.data.name,
    p_customer_email: customerResult.data.email ?? null,
    p_customer_phone: customerResult.data.phone ?? null,
    p_customer_address: customerResult.data.address ?? null,
    p_job_description: parsed.data.description,
    p_assigned_tech_id: normalizedTechId,
    p_estimate_lines: parsed.data.estimateLines.map((line) => ({
      description: line.description,
      quantity_milli: line.quantityMilli,
      unit_price_cents: line.unitPriceCents,
    })),
  });

  // If saving failed, tell the person why.
  if (error) {
    return { error: `Could not save the job: ${error.message}` };
  }

  // Saved! Refresh the list and the job page so they show the new details, then take you to the job.
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  redirect(`/jobs/${parsed.data.jobId}`);
}
