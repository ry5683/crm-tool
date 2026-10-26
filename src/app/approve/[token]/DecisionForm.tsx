
"use client";

// This is the Approve / Decline form at the bottom of the customer's page. It's a "client component," meaning it runs in the customer's own browser
// so it can react the instant they type or tap. (The className text, like "rounded-lg bg-green-700", is Tailwind shorthand for how things look.)

// useState is how the app remembers something on screen, like the typed name, and redraws when it changes.
import { FieldTag } from "@/components/FieldTag";
import {
  DECLINE_NOTE_MAX,
  DECLINE_REASONS,
  declineNoteError,
  isDeclineReasonCode,
  type DeclineReasonCode,
} from "@/lib/decline-reasons";
import { useState } from "react";

// Only two answers are allowed.
type Decision = "approved" | "declined";

// The form gets the secret link code from the page, which is how the server knows which change order is being answered.
export default function DecisionForm({ token }: { token: string }) {
  // What the form keeps track of: the typed name, any error, the final answer once saved, and whether we're mid-send.
  const [approverName, setApproverName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Declining is a two-step flow: tap Decline, pick a reason, add a note, then confirm.
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<DeclineReasonCode | "">("");
  const [note, setNote] = useState("");

  // This runs when a button gets pressed. It sends the answer to the server and then shows what happened.
  async function submit(selectedDecision: Decision) {
    if (selectedDecision === "declined") {
      if (!isDeclineReasonCode(reason)) {
        setError("Please choose a reason for declining.");
        return;
      }
      const noteProblem = declineNoteError(reason, note);
      if (noteProblem) {
        setError(noteProblem);
        return;
      }
    }
    // Wipe any old error, and mark ourselves busy so nobody double-taps.
    setError(null);
    setIsPending(true);
    try {
      // Send the link code, the answer and the name to the server's approvals address.
      const response = await fetch("/api/approvals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decision: selectedDecision,
          approverName,
          ...(selectedDecision === "declined" && { declineReason: reason, declineNote: note.trim() }),
        }),
      });
      const result = (await response.json()) as { status?: string; error?: string };
      // If the server said no (link already used, expired, etc.), show its plain-English reason and stop.
      if (!response.ok || result.status !== "decided") {
        setError(result.error ?? "Your decision could not be recorded.");
        return;
      }
      // It worked. Remember the answer so the thank-you replaces the form.
      setDecision(selectedDecision);
    } catch (submitError) {
      // Something broke on the way (like no signal), so we log it and ask them to check their connection.
      console.error("Could not submit the approval decision.", submitError);
      setError("Could not contact the server. Check your connection and try again.");
    } finally {
      // Win or lose, we're done sending, so the buttons can wake back up.
      setIsPending(false);
    }
  }

  // Once they've answered, show a thank-you instead of the form.
  if (decision) {
    return (
      <p className="rounded-lg bg-green-50 p-4 font-medium text-green-900" role="status">
        Thank you, {approverName.trim()}. Your change order was {decision}.
      </p>
    );
  }

  // The form itself: a name box, an error spot, and the two buttons.
  return (
    <div className="mt-6 space-y-4">
      <div>
        {/* The customer types their name so there's a record of who said yes or no. */}
        <label
          className="block text-sm font-medium text-zinc-800"
          htmlFor="approverName"
        >
          Your name <FieldTag required />
        </label>
        <input
          autoComplete="name"
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
          id="approverName"
          maxLength={120}
          onChange={(event) => setApproverName(event.target.value)}
          required
          value={approverName}
        />
      </div>
      {/* A red message that only appears if something went wrong. */}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {declining ? (
        <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
          <div>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="declineReason">
              Why are you declining? <FieldTag required />
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
              id="declineReason"
              onChange={(event) => {
                setReason(isDeclineReasonCode(event.target.value) ? event.target.value : "");
                setError(null);
              }}
              value={reason}
            >
              <option value="">Select a reason…</option>
              {DECLINE_REASONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {reason && (
            <div>
              <label className="block text-sm font-medium text-zinc-800" htmlFor="declineNote">
                {reason === "other" ? "Please explain" : "Anything else you'd like to add?"}{" "}
                <FieldTag required={reason === "other"} />
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id="declineNote"
                maxLength={DECLINE_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                value={note}
              />
              <p className="mt-1 text-right text-xs text-zinc-500">
                {note.length}/{DECLINE_NOTE_MAX}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="rounded-lg bg-red-700 px-5 py-3 font-medium text-white hover:bg-red-800 disabled:opacity-60"
              disabled={isPending || !reason || !approverName.trim()}
              onClick={() => submit("declined")}
              type="button"
            >
              Confirm decline
            </button>
            <button
              className="rounded-lg border border-zinc-300 px-5 py-3 font-medium text-zinc-800 hover:bg-zinc-50"
              disabled={isPending}
              onClick={() => {
                setDeclining(false);
                setError(null);
              }}
              type="button"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        /* Approve and Decline. Both stay greyed out until there's a name or while a send is in progress. */
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="rounded-lg bg-green-700 px-5 py-3 font-medium text-white hover:bg-green-800 disabled:opacity-60"
            disabled={isPending || !approverName.trim()}
            onClick={() => submit("approved")}
            type="button"
          >
            Approve
          </button>
          <button
            className="rounded-lg border border-red-300 px-5 py-3 font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
            disabled={isPending || !approverName.trim()}
            onClick={() => setDeclining(true)}
            type="button"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
