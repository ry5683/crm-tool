// The "Add customer" page: a blank customer form. Saving happens in actions.ts one folder up.

import Link from "next/link";
import { connection } from "next/server";
import { requireSession } from "@/lib/session";
import CustomerForm from "../CustomerForm";
import { createCustomer } from "../actions";

// Tells Next.js not to nag about loading speed, since this page checks your sign-in live.
export const instant = false;

export default async function NewCustomerPage() {
  await connection();
  // Make sure you're signed in before showing the form.
  await requireSession();

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-medium text-blue-700 hover:underline" href="/customers">
          ← Back to customers
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Add customer</h1>
        <p className="mt-2 text-zinc-600">Everything here is needed so you can reach them and send approvals.</p>
        <CustomerForm action={createCustomer} cancelHref="/customers" />
      </div>
    </main>
  );
}
