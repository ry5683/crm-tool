// The "Edit customer" page: the same form as adding one, already filled in with the customer's current details.

import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import CustomerForm from "../../CustomerForm";
import { updateCustomer } from "../../actions";

type EditCustomerPageProps = { params: Promise<{ id: string }> };

// Tells Next.js not to nag about loading speed, since this page waits on live data.
export const instant = false;

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  await connection();
  const { id } = await params;
  // A web address that isn't a real ID can't be a customer.
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireSession();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name, address, email, phone")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load the customer: ${error.message}`);
  }
  if (!customer) notFound();

  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-medium text-zinc-950 underline decoration-hivis-400 decoration-2 underline-offset-4 hover:decoration-zinc-950" href={`/customers/${id}`}>
          ← Back to {customer.name}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Edit customer</h1>
        <p className="mt-2 text-zinc-600">Changes apply to all of this customer&apos;s jobs.</p>
        <CustomerForm action={updateCustomer} cancelHref={`/customers/${id}`} initial={customer} />
      </div>
    </main>
  );
}
