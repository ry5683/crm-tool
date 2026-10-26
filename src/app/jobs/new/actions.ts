"use server";

// This saves a brand-new job, along with its customer and original estimate. It's a "server action": a function that runs on our server when the New Job form is sent.

// Borrowed tools: our login/database connection (Supabase), a way to move you to another page, and zod, a checker that makes sure incoming info looks right.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { encryptField } from "@/lib/field-crypto";

// What we report back to the form: an error message, or null (nothing) if all went well.
export type CreateJobState = {
  error: string | null;
};

// The rules for a new customer: a name is a must, while email, phone and address are all required, and the phone must look like (555) 123-4567.
const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  // Email, phone and address are all required so every customer can be reached and found.
  email: z
    .string()
    .trim()
    .min(1, "Customer email is required.")
    .pipe(z.email("Enter a valid email address.")),
  // The phone must be exactly (xxx) xxx-xxxx, with nothing else accepted.
  phone: z
    .string()
    .trim()
    .min(1, "Customer phone is required.")
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Phone must be in this format: (555) 123-4567."),
  address: z.string().trim().min(1, "Customer address is required."),
});

// The rules for the job: a description, and at least one estimate line with a description, a whole-number quantity and a price in cents.
// Quantities are stored in thousandths, so 1 item is 1000.
const jobInputSchema = z.object({
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

// The actual save. It runs when you submit the New Job form.
export async function createJob(
  _previousState: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  // Start by grabbing the raw answers from the form.
  const customerId = formData.get("customerId");
  const assignedTechId = formData.get("assignedTechId");
  const description = formData.get("description");
  const linesValue = formData.get("estimateLines");

  // These should all be plain text. If one's missing, the form wasn't filled in properly.
  if (
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

  // Check the job details against the rules. The server re-checks even though the form already did, because a browser can be tampered with.
  const jobResult = jobInputSchema.safeParse({ description, estimateLines });
  if (!jobResult.success) {
    return { error: jobResult.error.issues[0]?.message ?? "Check the job details." };
  }

  // Is this a brand-new customer you typed in, or one picked from the list? New ones get their details checked; picked ones just need a real-looking ID.
  const isNewCustomer = customerId === "__new__";
  let newCustomer:
    | { name: string; email?: string; phone?: string; address?: string }
    | null = null;

  if (isNewCustomer) {
    const customerResult = customerInputSchema.safeParse({
      name: formData.get("customerName"),
      email: formData.get("customerEmail") ?? "",
      phone: formData.get("customerPhone") ?? "",
      address: formData.get("customerAddress") ?? "",
    });

    if (!customerResult.success) {
      return {
        error:
          customerResult.error.issues[0]?.message ?? "Check the customer details.",
      };
    }

    newCustomer = customerResult.data;
  } else if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(customerId)) {
    return { error: "Choose a customer from the list or add a new one." };
  }

  // Assigning a technician is optional. Blank means nobody yet, and if you did pick someone, their ID has to look real.
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

  // Grab your user ID from the sign-in info.
  const userId = claims.claims.sub;
  if (typeof userId !== "string") {
    throw new Error("Your sign-in token did not contain a user ID.");
  }

  // Find out which plumbing business you work for, since the job has to be filed under one.
  const { data: memberships, error: membershipError } = await supabase
    .from("members")
    .select("business_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError) {
    throw new Error(`Could not find your business membership: ${membershipError.message}`);
  }

  // Use the first business we find. If there isn't one, we tell you to ask an owner for help.
  const membershipRows = memberships as Array<{ business_id: string }>;
  const businessId = membershipRows[0]?.business_id;
  if (!businessId) {
    return {
      error: "Your account is not linked to a plumbing business. Ask an owner for help.",
    };
  }

  // Save the customer (if new), the job and its estimate lines all in one go, so nothing ends up half saved.
  const { data: jobId, error: saveError } = await supabase.rpc(
    "create_job_with_estimate",
    {
      p_business_id: businessId,
      p_customer_id: isNewCustomer ? null : customerId,
      p_new_customer_name: newCustomer?.name ?? null,
      p_new_customer_email: encryptField(newCustomer?.email || null, "customer.email"),
      p_new_customer_phone: encryptField(newCustomer?.phone || null, "customer.phone"),
      p_new_customer_address: encryptField(newCustomer?.address || null, "customer.address"),
      p_job_description: jobResult.data.description,
      p_assigned_tech_id: normalizedTechId,
      p_estimate_lines: jobResult.data.estimateLines.map((line) => ({
        description: line.description,
        quantity_milli: line.quantityMilli,
        unit_price_cents: line.unitPriceCents,
      })),
    },
  );

  // If the save didn't work, tell the person why.
  if (saveError) {
    return { error: `Could not save the job: ${saveError.message}` };
  }

  // A quick sanity check: the database should hand back the new job's ID.
  if (typeof jobId !== "string") {
    throw new Error("The database saved the job but did not return its ID.");
  }

  // All done! Take you to the new job's page.
  redirect(`/jobs/${jobId}`);
}
