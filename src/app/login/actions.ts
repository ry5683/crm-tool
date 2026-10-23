"use server";

// This runs when someone presses "Sign in." It's a "server action," a function that runs on the server (the computer hosting the app)
// instead of in the visitor's browser, so the password check stays out of sight.

// Borrowing our database/login connection and Next.js's page-redirect tool.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Runs when the sign-in form is submitted.
export async function signIn(formData: FormData) {
  // Pull the typed email and password out of the form.
  const email = formData.get("email");
  const password = formData.get("password");

  // If either one's missing or odd, back to the login page with a "wrong credentials" notice.
  if (typeof email !== "string" || typeof password !== "string") {
    redirect("/login?error=credentials");
  }

  // Ask the login service (Supabase) whether this email and password are good.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Now, what if it didn't work?
  if (error) {
    // A 400 or 401 just means wrong email or password, so we send them back with a friendly notice.
    if (error.status === 400 || error.status === 401) {
      redirect("/login?error=credentials");
    }

    // Anything else is a real fault (say, the service is down), so we raise it instead of blaming their password.
    throw new Error(`Could not sign in: ${error.message}`);
  }

  // They're in! Off to the jobs list.
  redirect("/jobs");
}
