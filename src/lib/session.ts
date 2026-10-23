// A shared "who is this person?" check for pages and actions that belong to a signed-in team member.
// It sends strangers to the login page, and otherwise hands back the database connection, who they are, which business they're on, and their role.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Everything we learn about the visitor.
export type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  businessId: string;
  role: "owner" | "tech";
};

// Checks the sign-in and looks up the person's business. Not signed in means off to /login.
export async function requireSession(): Promise<Session> {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  // No sign-in? Go to the login page (unless something truly broke, in which case we say so).
  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  const userId = claims.claims.sub;
  if (typeof userId !== "string") {
    throw new Error("Your sign-in token did not contain a user ID.");
  }

  // Which business are they on, and are they an owner or a tech?
  const { data: memberships, error } = await supabase
    .from("members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`Could not check your business: ${error.message}`);
  }

  const membership = memberships[0] as { business_id: string; role: string } | undefined;
  if (!membership) {
    throw new Error("Your account is not linked to a business.");
  }

  return {
    supabase,
    userId,
    businessId: membership.business_id,
    role: membership.role === "owner" ? "owner" : "tech",
  };
}
