"use client";

// The "Invite a teammate" box: type their email, pick a role, and we email them a link to join.

import { useActionState, useEffect, useRef } from "react";
import { FieldTag } from "@/components/FieldTag";
import { inviteMember, type TeamActionState } from "./actions";

const initialState: TeamActionState = { error: null, message: null };

export default function InviteForm() {
  const [state, formAction, isPending] = useActionState(inviteMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // After a successful invite, clear the form so it's ready for the next person.
  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form
      action={formAction}
      className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      ref={formRef}
    >
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-800" htmlFor="invite-email">
          Email <FieldTag required />
        </label>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
          id="invite-email"
          name="email"
          placeholder="alex@example.com"
          required
          type="email"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-800" htmlFor="invite-role">
          Role <FieldTag required />
        </label>
        <select
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
          defaultValue="tech"
          id="invite-role"
          name="role"
          required
        >
          <option value="tech">Technician</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <button
        className="rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sending..." : "Send invite"}
      </button>
      {/* Feedback spans the whole row: red for a problem, green when the invite went out. */}
      {state.error && (
        <p className="animate-rise rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-3" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="animate-rise rounded-lg bg-green-50 p-3 text-sm text-green-800 sm:col-span-3" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
