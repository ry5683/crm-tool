"use client";

// The "Send for customer approval" button on a job page. It lives in your browser and asks our server to email the customer a change order to look over and approve.

// Borrowed tools: a way to remember things on screen, and a way to refresh the page.
import { useState } from "react";
import { useRouter } from "next/navigation";

// The button. It needs to know which change order it's sending.
export default function SendApprovalButton({
  changeOrderId,
}: {
  changeOrderId: string;
}) {
  // The button's little memory: a page-refresher, any error message to show, and whether we're mid-send.
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // This runs when you click the button.
  async function send() {
    // Wipe any old error and mark that we're busy, so a nervous double-click can't send it twice.
    setError(null);
    setIsPending(true);
    try {
      // Tell our server "send this change order out for approval."
      const response = await fetch("/api/change-orders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeOrderId }),
      });
      // Read what the server said back: did it go out, or is there a problem?
      const result = (await response.json()) as {
        sent?: boolean;
        error?: string;
      };
      // Something went wrong. Show the reason and stop here.
      if (!response.ok || !result.sent) {
        setError(result.error ?? "The approval request could not be sent.");
        return;
      }
      // It worked! Reload the page's info so the change order now shows as sent.
      router.refresh();
    // We couldn't even reach the server (spotty connection, maybe). Note it down and tell the person to try again.
    } catch (sendError) {
      console.error("Could not send the approval request.", sendError);
      setError("Could not contact the server. Check your connection and try again.");
    // Whether it worked or not, unlock the button so it can be used again.
    } finally {
      setIsPending(false);
    }
  }

  // What you see: the button, plus an error message if there is one.
  return (
    <div className="mt-4">
      {/* The button, greyed out while it's sending. */}
      <button
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={send}
        type="button"
      >
        {isPending ? "Sending..." : "Send for customer approval"}
      </button>
      {/* If something went wrong, say so in red. */}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
