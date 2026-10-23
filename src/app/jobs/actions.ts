"use server";

// This is the sign-out button's brain for the jobs screens.
// It's a "server action", which just means a little function that runs on our server instead of in your browser when you press a button.

// Two things we borrow: a way to talk to our login and database service (Supabase), and a way to bounce you to another page.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Pressing "Sign out" lands here. We end your session, then send you back to the login page.
export async function signOut() {
  // First, hook up to the login service.
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  // If signing out somehow didn't work, we'd rather yell about it than let you think you're logged out when you're not.
  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }

  // All good, so off to the login page you go.
  redirect("/login");
}
