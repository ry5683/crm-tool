// The welcome page for a new teammate. They arrive here, already signed in, from the link in their invite email.

import { connection } from "next/server";
import Brand from "@/components/Brand";
import { requireSession } from "@/lib/session";
import WelcomeForm from "./WelcomeForm";

// Tells Next.js not to nag about loading speed, since this page checks your sign-in live.
export const instant = false;

export default async function WelcomePage() {
  await connection();
  // Anyone who isn't signed in is sent to the login page.
  const { supabase, role } = await requireSession();
  const { data: business } = await supabase.from("businesses").select("name").limit(1).maybeSingle();

  return (
    <main className="animate-rise flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <Brand />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Welcome aboard</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          You&apos;ve joined {business?.name ?? "the team"} as {role === "owner" ? "an owner" : "a technician"}.
          Choose a password to finish setting up your account.
        </p>
        <WelcomeForm />
      </section>
    </main>
  );
}
