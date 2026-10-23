"use server";

// The save and delete moves for customers. They run on the server (the computer hosting the app) when a customer form or button is used.
// Anyone on the team can add or edit a customer; only an owner can delete one.

// Borrowing: a page refresher, a redirect tool, zod (our data checker), and the shared sign-in check.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/session";

// What each action tells the form afterward: an error message, or null if all went well.
export type CustomerActionState = { error: string | null };

// The rules for a customer: name, address, email and phone are all required, and the phone must look exactly like (555) 123-4567.
const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(120),
  address: z.string().trim().min(1, "Customer address is required.").max(250),
  email: z
    .string()
    .trim()
    .min(1, "Customer email is required.")
    .pipe(z.email("Enter a valid email address.")),
  phone: z
    .string()
    .trim()
    .min(1, "Customer phone is required.")
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Phone must be in this format: (555) 123-4567."),
});

// Small helper: reads a form box as text, or gives empty text if it's missing.
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Adding a new customer. When it works, we jump to that customer's page.
export async function createCustomer(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = customerSchema.safeParse({
    name: field(formData, "name"),
    address: field(formData, "address"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the customer details." };
  }

  const { supabase, businessId } = await requireSession();
  const { data, error } = await supabase
    .from("customers")
    .insert({ business_id: businessId, ...parsed.data })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not create the customer.", error);
    return { error: "The customer could not be saved. Please try again." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

// Saving changes to an existing customer.
export async function updateCustomer(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const id = field(formData, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "That customer could not be found." };
  }

  const parsed = customerSchema.safeParse({
    name: field(formData, "name"),
    address: field(formData, "address"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the customer details." };
  }

  // The business filter is a second lock on top of the database's own security, so edits can only land inside your own company.
  const { supabase, businessId } = await requireSession();
  const { data, error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id");
  if (error) {
    console.error("Could not update the customer.", error);
    return { error: "The customer could not be saved. Please try again." };
  }
  if (!data || data.length === 0) {
    return { error: "That customer could not be found." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

// Deleting a customer. Owners only, and only if the customer has no jobs (so we never orphan your job history).
export async function deleteCustomer(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const id = field(formData, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "That customer could not be found." };
  }

  const { supabase, businessId, role } = await requireSession();
  if (role !== "owner") {
    return { error: "Only an owner can delete customers." };
  }

  // Count the jobs first so we can give a friendly reason instead of a database error.
  const { count, error: countError } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .eq("business_id", businessId);
  if (countError) {
    console.error("Could not check the customer's jobs.", countError);
    return { error: "The customer could not be deleted. Please try again." };
  }
  if ((count ?? 0) > 0) {
    return { error: "This customer still has jobs. Delete or reassign those jobs first." };
  }

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) {
    console.error("Could not delete the customer.", error);
    return { error: "The customer could not be deleted. Please try again." };
  }

  revalidatePath("/customers");
  redirect("/customers");
}
