"use client";

// The red "Delete customer" button, with an "are you sure?" pop-up first. Owners only (the page decides who sees it).

import { useActionState, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deleteCustomer, type CustomerActionState } from "./actions";

const initialState: CustomerActionState = { error: null };

export default function DeleteCustomerButton({ customerId }: { customerId: string }) {
  // The latest result (like "still has jobs"), whether a delete is running, whether the pop-up is open, and the form to send on "yes".
  const [state, formAction, isPending] = useActionState(deleteCustomer, initialState);
  const [asking, setAsking] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={formAction} ref={formRef}>
      <input name="id" type="hidden" value={customerId} />
      <button
        className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        disabled={isPending}
        onClick={() => setAsking(true)}
        type="button"
      >
        {isPending ? "Deleting..." : "Delete customer"}
      </button>
      <ConfirmDialog
        confirmLabel="Yes, delete them"
        message="This removes the customer for good. Customers who still have jobs can't be deleted."
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          formRef.current?.requestSubmit();
        }}
        open={asking}
        title="Delete this customer?"
      />
      {/* If it failed (for example, they still have jobs), say why. */}
      {state.error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
