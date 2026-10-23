// The Team page: everyone who works for your business, their role, and (for owners) a way to invite, change roles and remove people.

import type { CSSProperties } from "react";
import { connection } from "next/server";
import { requireSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import InviteForm from "./InviteForm";
import MemberRow from "./MemberRow";

// Tells Next.js not to nag about loading speed, since this page waits on live data.
export const instant = false;

export default async function TeamPage() {
  await connection();
  const { supabase, userId, role } = await requireSession();

  // The roster. The database's own locks make sure this is only your own company's people.
  const { data: members, error } = await supabase
    .from("members")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Could not load the team: ${error.message}`);
  }

  // Emails live in the login system, so we look each person up there (server-side only). A person who has never signed in is still "invited".
  const admin = createAdminClient();
  const people = await Promise.all(
    (members as Array<{ user_id: string; role: "owner" | "tech" }>).map(async (member) => {
      const { data } = await admin.auth.admin.getUserById(member.user_id);
      return {
        userId: member.user_id,
        role: member.role,
        email: data.user?.email ?? "Unknown email",
        status: data.user?.last_sign_in_at ? ("active" as const) : ("invited" as const),
      };
    }),
  );

  const canManage = role === "owner";

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Team</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {people.length} {people.length === 1 ? "person" : "people"} on your team.
          </p>
        </header>

        {/* Only owners see the invite box. Techs just see who's on the team. */}
        {canManage ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Invite a teammate</h2>
            <p className="mt-1 text-sm text-zinc-600">
              We&apos;ll email them a link to set a password. Technicians can create and edit jobs and customers;
              owners can also manage the pricebook, delete things and manage the team.
            </p>
            <InviteForm />
          </section>
        ) : (
          <p className="mt-6 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">
            Only an owner can invite or remove people.
          </p>
        )}

        <ul className="stagger mt-6 space-y-3">
          {people.map((person, index) => (
            <div key={person.userId} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
              <MemberRow
                canManage={canManage}
                email={person.email}
                isYou={person.userId === userId}
                role={person.role}
                status={person.status}
                userId={person.userId}
              />
            </div>
          ))}
        </ul>
      </div>
    </main>
  );
}
