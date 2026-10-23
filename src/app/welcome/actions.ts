"use server";

// Runs when a new teammate picks their password after accepting an invite. They're already signed in by the invite link,
// so this just saves the password they chose and sends them into the app.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/session";

// What the form is told afterward: an error message, or null if all went well.
export type WelcomeState = { error: string | null };

export async function setPassword(
  _previousState: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  // At least 8 characters, and both boxes have to match.
  const parsed = z
    .string("Enter a password.")
    .min(8, "Use at least 8 characters.")
    .max(72, "Use 72 characters or fewer.")
    .safeParse(password);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your password." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  // requireSession sends anyone who isn't signed in (say, a stranger typing /welcome) to the login page.
  const { supabase } = await requireSession();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    console.error("Could not save the password.", error);
    return { error: "Your password could not be saved. Please try again." };
  }

  redirect("/jobs");
}
