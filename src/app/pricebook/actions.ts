"use server";

// These are the save, edit and delete moves for the Pricebook, your list of parts and labor with prices. They're "server actions,"
// functions that run on the server (the computer hosting the app) when a pricebook form is submitted.
// Every one checks that you're signed in and a business owner first.

// Borrowing: a way to refresh saved pages, a redirect tool, zod (our data checker) and the database connection.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseTaxRate } from "@/lib/money";

// What each action tells the form afterward: an error message, or null if all went well.
export type PricebookActionState = { error: string | null };

// The rules for an item: a name (up to 120 characters), a unit like "each" (up to 24), and a price above zero.
const pricebookItemInputSchema = z.object({
  name: z.string().trim().min(1, "Item name is required.").max(120),
  unit: z.string().trim().min(1, "Unit is required.").max(24),
  // Prices are typed in dollars (like 85.50) and converted to whole cents (8550) so we avoid rounding trouble.
  priceCents: z.preprocess(
    (value) => {
      if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
        return value;
      }
      const [dollars, cents = ""] = value.trim().split(".");
      return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
    },
    z.number().int().positive().max(2_147_483_647),
  ),
  // Whether sales tax applies to this item. Parts usually yes, labor usually no.
  taxable: z.boolean(),
});

// Same rules, plus the ID of the item being edited.
const pricebookItemUpdateInputSchema = pricebookItemInputSchema.extend({
  id: z.uuid(),
});

// The result of the "who is this?" check: either an error message, or the database connection plus the business they own.
type OwnerContext =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      businessId: string;
    };

// Checks that the visitor is signed in, belongs to a business, and is its owner.
async function getOwnerContext(): Promise<OwnerContext> {
  // First, are they signed in? If not, off to the login page.
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

  // Next, look up which business they belong to and what their role is.
  const { data: memberships, error } = await supabase
    .from("members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Could not check your business role: ${error.message}`);
  }

  // No business, or not the owner? Then they can't change prices, so we stop here.
  const membership = memberships[0] as
    | { business_id: string; role: string }
    | undefined;
  if (!membership) {
    return { error: "Your account is not linked to a plumbing business." };
  }
  if (membership.role !== "owner") {
    return { error: "Only a business owner can change the pricebook." };
  }

  // They passed, so hand back the connection and the business ID.
  return { supabase, businessId: membership.business_id };
}

// Small helper: reads a form box as text, or gives empty text if it's missing.
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Adding a new item.
export async function createPricebookItem(
  _previousState: PricebookActionState,
  formData: FormData,
): Promise<PricebookActionState> {
  // Check what was typed. If something's off, show the first problem.
  const parsed = pricebookItemInputSchema.safeParse({
    name: field(formData, "name"),
    unit: field(formData, "unit"),
    priceCents: field(formData, "price"),
    taxable: formData.get("taxable") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the item details." };
  }

  // Make sure they're a signed-in owner.
  const context = await getOwnerContext();
  if ("error" in context) {
    return context;
  }

  // Save the new item under their business.
  const { error } = await context.supabase.from("pricebook_items").insert({
    business_id: context.businessId,
    name: parsed.data.name,
    unit: parsed.data.unit,
    price_cents: parsed.data.priceCents,
    taxable: parsed.data.taxable,
  });
  if (error) {
    return { error: `Could not add the item: ${error.message}` };
  }

  // Refresh the pricebook page so the new item shows up.
  revalidatePath("/pricebook");
  return { error: null };
}

// Editing an existing item.
export async function updatePricebookItem(
  _previousState: PricebookActionState,
  formData: FormData,
): Promise<PricebookActionState> {
  // Check the typed details and the item's ID.
  const parsed = pricebookItemUpdateInputSchema.safeParse({
    id: field(formData, "id"),
    name: field(formData, "name"),
    unit: field(formData, "unit"),
    priceCents: field(formData, "price"),
    taxable: formData.get("taxable") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the item details." };
  }

  // Make sure they're a signed-in owner.
  const context = await getOwnerContext();
  if ("error" in context) {
    return context;
  }

  // Save the changes, but only to an item in their own business.
  const { id, ...item } = parsed.data;
  const { data, error } = await context.supabase
    .from("pricebook_items")
    .update({
      name: item.name,
      unit: item.unit,
      price_cents: item.priceCents,
      taxable: item.taxable,
    })
    .eq("business_id", context.businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    return { error: `Could not update the item: ${error.message}` };
  }
  // If nothing changed, the item must have been removed in the meantime.
  if (!data.length) {
    return { error: "That pricebook item is no longer available." };
  }

  // Refresh the pricebook and the job pages, since jobs show these prices too.
  revalidatePath("/pricebook");
  revalidatePath("/jobs", "layout");
  return { error: null };
}

// Removing an item.
export async function deletePricebookItem(
  _previousState: PricebookActionState,
  formData: FormData,
): Promise<PricebookActionState> {
  // Make sure the item ID looks genuine.
  const id = field(formData, "id");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return { error: "Choose a valid pricebook item." };
  }

  // Make sure they're a signed-in owner.
  const context = await getOwnerContext();
  if ("error" in context) {
    return context;
  }

  // Delete it, but only if it belongs to their own business.
  const { data, error } = await context.supabase
    .from("pricebook_items")
    .delete()
    .eq("business_id", context.businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    return { error: `Could not remove the item: ${error.message}` };
  }
  // Nothing was deleted, so it was already gone.
  if (!data.length) {
    return { error: "That pricebook item is no longer available." };
  }

  // Refresh the pricebook page.
  revalidatePath("/pricebook");
  return { error: null };
}

// Owners set the business's sales tax rate here, typed as a percent like 7.75.
// The database routine (migration 012) checks again that you're an owner, so this can't be done around the app.
export async function setTaxRate(
  _previousState: PricebookActionState,
  formData: FormData,
): Promise<PricebookActionState> {
  const rate = parseTaxRate(field(formData, "taxRate"));
  if (rate === null) {
    return { error: "Enter a tax rate between 0 and 20, like 7.75 (up to three decimal places)." };
  }

  const context = await getOwnerContext();
  if ("error" in context) {
    return context;
  }

  const { error } = await context.supabase.rpc("set_business_tax_rate", {
    p_tax_rate_millipercent: rate,
  });
  if (error) {
    return { error: `Could not save the tax rate: ${error.message}` };
  }

  revalidatePath("/pricebook");
  revalidatePath("/invoices");
  revalidatePath("/jobs", "layout");
  return { error: null };
}
