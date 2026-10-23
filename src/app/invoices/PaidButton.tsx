"use client";

// The "Mark paid" button on an invoice row (or "Undo" if it's already paid).

import { useActionState } from "react";
import { setInvoicePaid, type InvoiceActionState } from "./actions";

const initialState: InvoiceActionState = { error: null };

export default function PaidButton({ jobId, paid }: { jobId: string; paid: boolean }) {
  const [state, formAction, isPending] = useActionState(setInvoicePaid, initialState);

  return (
    <form action={formAction}>
      <input name="jobId" type="hidden" value={jobId} />
      {/* Sending the opposite of what it is now. */}
      <input name="paid" type="hidden" value={paid ? "false" : "true"} />
      <button
        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
          paid
            ? "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : paid ? "Undo" : "Mark paid"}
      </button>
      {state.error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
