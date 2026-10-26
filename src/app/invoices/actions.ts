"use server";

// Marking an invoice paid (or taking it back). Only owners can do this, since it's about money.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";

// What the button hears back: an error message, or null if all went well.
export type InvoiceActionState = { error: string | null };

export async function setInvoicePaid(
  _previousState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const jobId = formData.get("jobId");
  const paid = formData.get("paid") === "true";
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) return { error: "Missing job." };

  const { supabase, role } = await requireSession();
  if (role !== "owner") return { error: "Only an owner can change payment status." };

  // The database double-checks that you're an owner (migration 011), so this can't be done around the app.
  const { error } = await supabase.rpc("set_job_paid", { p_job_id: jobId, p_paid: paid });
  if (error) {
    console.error("Could not update payment status.", error);
    return { error: "Couldn't update that invoice. Please try again." };
  }

  revalidatePath("/invoices");
  return { error: null };
}
