"use server";

// The team moves: invite someone by email, change a teammate's role, or remove them. These run on the server (the computer hosting the app).
// Every one first checks that you're a signed-in business owner.

// Borrowing: page refresher, a way to read the request's headers, zod (our data checker), email, the admin connection and the sign-in check.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { sendTeamInviteEmail } from "@/lib/email";
import { requireSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// What each action tells the form afterward: an error, a success note, or neither.
export type TeamActionState = { error: string | null; message: string | null };

// Small helper: reads a form box as text, or gives empty text if it's missing.
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Works out this site's own web address (like http://localhost:3000) from the request, so invite links point back here.
// It only trusts an address whose host matches the host the request actually came to.
async function siteOrigin(): Promise<string | null> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host) return null;
  try {
    const url = new URL(origin);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && url.host === host ? url.origin : null;
  } catch {
    return null;
  }
}

// Inviting a new teammate: we create their login, put them on your team, and email them a one-time link to choose a password.
export async function inviteMember(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
      role: z.enum(["owner", "tech"], "Choose a role."),
    })
    .safeParse({ email: field(formData, "email"), role: field(formData, "role") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the invite details.", message: null };
  }

  // Only owners may invite people.
  const { supabase, businessId, role: callerRole } = await requireSession();
  if (callerRole !== "owner") {
    return { error: "Only an owner can invite team members.", message: null };
  }

  const origin = await siteOrigin();
  if (!origin) {
    return { error: "The request could not be verified. Please reload and try again.", message: null };
  }

  // The business name goes in the email.
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();
  if (businessError || !business) {
    console.error("Could not load the business.", businessError);
    return { error: "Your business could not be loaded. Please try again.", message: null };
  }

  // Step 1: make the login and get a one-time invite code (nothing is emailed by Supabase itself).
  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
  });
  if (linkError || !link?.user || !link.properties?.hashed_token) {
    if (linkError?.code === "email_exists") {
      return { error: "That email already has an account.", message: null };
    }
    console.error("Could not create the invite.", linkError);
    return { error: "The invite could not be created. Please try again.", message: null };
  }

  // Step 2: put them on your team.
  const { error: memberError } = await admin.from("members").insert({
    business_id: businessId,
    user_id: link.user.id,
    role: parsed.data.role,
  });
  if (memberError) {
    console.error("Could not add the team member.", memberError);
    await admin.auth.admin.deleteUser(link.user.id);
    return { error: "The invite could not be saved. Please try again.", message: null };
  }

  // Step 3: email them. If that fails we undo steps 1 and 2, so nobody is left half-invited.
  const inviteUrl = new URL("/auth/confirm", origin);
  inviteUrl.searchParams.set("token_hash", link.properties.hashed_token);
  inviteUrl.searchParams.set("type", "invite");
  try {
    await sendTeamInviteEmail({
      to: parsed.data.email,
      businessName: business.name,
      role: parsed.data.role,
      inviteUrl: inviteUrl.toString(),
    });
  } catch (sendError) {
    console.error("Could not send the invite email.", sendError);
    await admin.from("members").delete().eq("business_id", businessId).eq("user_id", link.user.id);
    await admin.auth.admin.deleteUser(link.user.id);
    return {
      error: "The invite email could not be sent, so nothing was changed. Check the email settings and try again.",
      message: null,
    };
  }

  revalidatePath("/team");
  return { error: null, message: `Invite sent to ${parsed.data.email}.` };
}

// Changing someone's role. The database function re-checks that you're an owner and that a business always keeps one.
export async function changeMemberRole(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({ userId: z.uuid(), role: z.enum(["owner", "tech"]) })
    .safeParse({ userId: field(formData, "userId"), role: field(formData, "role") });
  if (!parsed.success) {
    return { error: "Choose a valid person and role.", message: null };
  }

  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("set_member_role", {
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) {
    return { error: error.message, message: null };
  }

  revalidatePath("/team");
  return { error: null, message: "Role updated." };
}

// Removing someone from the team. Their jobs become "not assigned", and their login is deleted so the email can be invited again later.
export async function removeMember(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z.object({ userId: z.uuid() }).safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) {
    return { error: "Choose a valid person.", message: null };
  }

  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("remove_team_member", { p_user_id: parsed.data.userId });
  if (error) {
    return { error: error.message, message: null };
  }

  // The database already removed them from the team. Now delete their login too, unless they're on another team.
  const admin = createAdminClient();
  const { count } = await admin
    .from("members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", parsed.data.userId);
  if ((count ?? 0) === 0) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(parsed.data.userId);
    if (deleteError) {
      console.error("Removed from the team, but the login could not be deleted.", deleteError);
    }
  }

  revalidatePath("/team");
  return { error: null, message: "Removed from the team." };
}
