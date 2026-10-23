"use client";

// The form for adding a customer, reused for editing one. It lives in your browser so the phone box can tidy itself as you type.
// When you press Save, the answers go to the save function handed in as `action`.

// Borrowed tools: form-state tracking, links, our phone box, the required/optional tags, and the shape of a save result.
import { useActionState } from "react";
import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import { FieldTag, RequiredNote } from "@/components/FieldTag";
import type { CustomerActionState } from "./actions";

// When editing, these are the customer's current details.
type InitialCustomer = {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
};

// No error to show when the page first loads.
const initialState: CustomerActionState = { error: null };

// Shared look for every text box.
const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2.5";
const labelClass = "mb-2 block text-sm font-medium text-zinc-800";

export default function CustomerForm({
  action,
  initial,
  cancelHref,
}: {
  action: (
    previousState: CustomerActionState,
    formData: FormData,
  ) => Promise<CustomerActionState>;
  initial?: InitialCustomer;
  cancelHref: string;
}) {
  // Tracks the latest result (like an error) and whether a save is in progress.
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <RequiredNote />
      {/* When editing, a hidden box tells the server which customer this is. */}
      {initial && <input name="id" type="hidden" value={initial.id} />}

      <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <label className={labelClass} htmlFor="name">
            Customer name <FieldTag required />
          </label>
          <input
            autoComplete="name"
            className={inputClass}
            defaultValue={initial?.name}
            id="name"
            maxLength={120}
            name="name"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="address">
            Address <FieldTag required />
          </label>
          <input
            autoComplete="street-address"
            className={inputClass}
            defaultValue={initial?.address ?? ""}
            id="address"
            maxLength={250}
            name="address"
            required
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="email">
              Email <FieldTag hint="used to send approvals" required />
            </label>
            <input
              autoComplete="email"
              className={inputClass}
              defaultValue={initial?.email ?? ""}
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone <FieldTag hint="(555) 123-4567" required />
            </label>
            <PhoneInput defaultValue={initial?.phone} id="phone" name="phone" />
          </div>
        </div>
      </section>

      {/* A red message that only appears if the save failed. */}
      {state.error && (
        <p className="animate-rise rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : initial ? "Save changes" : "Add customer"}
        </button>
        <Link
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 font-medium text-zinc-800 hover:bg-zinc-50"
          href={cancelHref}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
