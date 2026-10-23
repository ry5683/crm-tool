"use client";

// The red "Delete job" button. It lives in your browser and asks "are you sure?" before anything gets deleted.
// You'll see it on the jobs list and on each job's page.

// Borrowed tools: a helper that tracks a form while it's being sent, and the delete function from the file next door.
import { useActionState, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deleteJob, type DeleteJobState } from "./actions";

// When the page first loads, there's no error to show.
const initialState: DeleteJobState = { error: null };

// The button itself. It just needs to know which job it's for.
export default function DeleteJobButton({ jobId }: { jobId: string }) {
  // Keeps tabs on the latest result (like an error) and on whether a delete is in progress right now.
  const [state, formAction, isPending] = useActionState(deleteJob, initialState);
  // Whether the "are you sure?" pop-up is showing, and a handle on the form so we can send it after you say yes.
  const [asking, setAsking] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // What you see: a little form wrapped around the button, because that's how the delete request gets sent.
  return (
    <form action={formAction} ref={formRef}>
      {/* A hidden box that carries the job's ID along with the form. You never see it, but the server needs to know which job. */}
      <input name="jobId" type="hidden" value={jobId} />
      {/* The button. It greys out while deleting, and opens a nice "are you sure?" pop-up first. The delete only goes through once you confirm there. */}
      <button
        className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={() => setAsking(true)}
        type="button"
      >
        {isPending ? "Deleting..." : "Delete job"}
      </button>
      {/* The pop-up. Saying yes closes it and sends the delete; saying no just closes it. */}
      <ConfirmDialog
        confirmLabel="Yes, delete it"
        message="Draft change orders on this job will be deleted too. This can't be undone."
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          formRef.current?.requestSubmit();
        }}
        open={asking}
        title="Delete this job?"
      />
      {/* If the delete failed, show why in red right under the button. */}
      {state.error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
