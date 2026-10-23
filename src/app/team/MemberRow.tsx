"use client";

// One person on the team. Owners get a role drop-down and a Remove button on everyone except themselves.

import { useActionState, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { changeMemberRole, removeMember, type TeamActionState } from "./actions";

const initialState: TeamActionState = { error: null, message: null };

export default function MemberRow({
  userId,
  email,
  role,
  status,
  isYou,
  canManage,
}: {
  userId: string;
  email: string;
  role: "owner" | "tech";
  status: "active" | "invited";
  isYou: boolean;
  canManage: boolean;
}) {
  // Each action has its own memory of the latest result.
  const [roleState, roleAction, rolePending] = useActionState(changeMemberRole, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeMember, initialState);
  const [asking, setAsking] = useState(false);
  const roleForm = useRef<HTMLFormElement>(null);
  const removeForm = useRef<HTMLFormElement>(null);

  const error = roleState.error ?? removeState.error;

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* A round badge with the first letter of the email. */}
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800"
          >
            {email.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="break-all font-medium text-zinc-950">
              {email}
              {isYou && <span className="ml-2 text-sm font-normal text-zinc-500">(you)</span>}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-zinc-600">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  role === "owner" ? "bg-violet-100 text-violet-800" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {role === "owner" ? "Owner" : "Technician"}
              </span>
              {status === "invited" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Invite pending
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Owners can change roles and remove people (but not themselves). */}
        {canManage && !isYou && (
          <div className="flex items-center gap-2">
            <form action={roleAction} ref={roleForm}>
              <input name="userId" type="hidden" value={userId} />
              <label className="sr-only" htmlFor={`role-${userId}`}>
                Role for {email}
              </label>
              <select
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                defaultValue={role}
                disabled={rolePending}
                id={`role-${userId}`}
                name="role"
                onChange={() => roleForm.current?.requestSubmit()}
              >
                <option value="tech">Technician</option>
                <option value="owner">Owner</option>
              </select>
            </form>
            <form action={removeAction} ref={removeForm}>
              <input name="userId" type="hidden" value={userId} />
              <button
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                disabled={removePending}
                onClick={() => setAsking(true)}
                type="button"
              >
                {removePending ? "Removing..." : "Remove"}
              </button>
            </form>
          </div>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Yes, remove them"
        message={`${email} will lose access right away, and any jobs assigned to them become unassigned.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          removeForm.current?.requestSubmit();
        }}
        open={asking}
        title="Remove this person?"
      />

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
