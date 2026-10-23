"use client";

// A friendly "are you sure?" pop-up that fades in over the page. It replaces the plain, ugly browser alert box.
// Press Escape or tap the dark background to back out.

// Borrowed tools: a hook that runs code when the pop-up appears or goes away.
import { useEffect } from "react";

// What the pop-up needs: whether it's showing, its words, and what to do on "yes" or "no".
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // While it's open: Escape closes it, and the page behind can't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onCancel]);

  // Closed? Draw nothing.
  if (!open) return null;

  return (
    // The dark see-through backdrop. Tapping it counts as "cancel".
    <div
      className="animate-fade no-print fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      {/* The white card itself. Clicks inside it shouldn't close it. */}
      <div
        aria-modal="true"
        className="animate-pop w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            autoFocus
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={onCancel}
            type="button"
          >
            Keep it
          </button>
          <button
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
