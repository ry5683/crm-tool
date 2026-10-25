"use client";

// The "choose your password" form shown to a new teammate right after they accept an invite.

import { useActionState } from "react";
import { FieldTag } from "@/components/FieldTag";
import { setPassword, type WelcomeState } from "./actions";

const initialState: WelcomeState = { error: null };
const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2.5";

export default function WelcomeForm() {
  const [state, formAction, isPending] = useActionState(setPassword, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-800" htmlFor="password">
          Password <FieldTag hint="at least 8 characters" required />
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-800" htmlFor="confirm">
          Confirm password <FieldTag required />
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="confirm"
          minLength={8}
          name="confirm"
          required
          type="password"
        />
      </div>
      {state.error && (
        <p className="animate-rise rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-hivis-400 px-4 py-3 font-semibold text-zinc-950 hover:bg-hivis-500 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save password and continue"}
      </button>
    </form>
  );
}
