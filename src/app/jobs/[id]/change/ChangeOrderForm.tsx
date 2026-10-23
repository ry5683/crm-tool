"use client";

// The form for adding a change order, which is the extra work you found once you got into the job. You pick price book items and quantities, and it keeps a running total.
// It lives in your browser so it updates as you type. Pressing Save hands it to the server code in actions.ts.

// Borrowed tools: links, form helpers, our money helpers, and the save function.
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  formatCents,
  lineTotalCents,
  parseQuantityToMilli,
  totalCents,
} from "@/lib/money";
import {
  createChangeOrder,
  type CreateChangeOrderState,
} from "./actions";

// One item from your price book: its name, its unit (like "hour" or "each") and its price in cents.
type PricebookItem = {
  id: string;
  name: string;
  unit: string;
  priceCents: number;
};

// One line of extra work while you're still editing: which item, and how many. The "key" is just a tag so the screen can tell lines apart.
type DraftLine = {
  key: number;
  itemId: string;
  quantity: string;
};

// When the form first loads, there's no error to show.
const initialState: CreateChangeOrderState = { error: null };
// The biggest total we can safely store, in cents. That's about $21 million, so you'll probably never hit it.
const MAX_TOTAL_CENTS = 2_147_483_647;

// The form. It needs the job's ID and the price book items you can choose from.
export default function ChangeOrderForm({
  jobId,
  items,
}: {
  jobId: string;
  items: PricebookItem[];
}) {
  // Tracks the save result (like an error) and whether a save is in progress.
  const [state, formAction, isPending] = useActionState(
    createChangeOrder,
    initialState,
  );
  // The form's memory of your lines. It starts with one line using the first item in your price book.
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 0, itemId: items[0]?.id ?? "", quantity: "1" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  // Pack the lines up for the server. We send just the item and the quantity, because the price comes from your price book, not from the browser.
  const serializedLines = lines.map((line) => ({
    pricebookItemId: line.itemId,
    quantityMilli: parseQuantityToMilli(line.quantity),
  }));
  // Look up each line's price in the price book so we can show a total on screen.
  const totalsLines = lines.flatMap((line) => {
    const item = items.find((candidate) => candidate.id === line.itemId);
    const quantityMilli = parseQuantityToMilli(line.quantity);
    return item && quantityMilli !== null
      ? [{ quantityMilli, unitPriceCents: item.priceCents }]
      : [];
  });
  // True only when every line has a real item and a quantity above zero.
  const allLinesValid =
    lines.length > 0 &&
    lines.every(
      (line) =>
        items.some((item) => item.id === line.itemId) &&
        (parseQuantityToMilli(line.quantity) ?? 0) > 0,
    );
  // Add up the draft total. If it's too big to store safely, we show a message instead of a number.
  let draftTotal: number | null = null;
  let totalError: string | null = null;
  if (allLinesValid) {
    try {
      const calculatedTotal = totalCents(totalsLines);
      if (calculatedTotal > MAX_TOTAL_CENTS) {
        totalError = "The draft total exceeds the supported maximum.";
      } else {
        draftTotal = calculatedTotal;
      }
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
      totalError = "The draft total is too large to calculate safely.";
    }
  }

  // Changes one box (item or quantity) on one line.
  function updateLine(key: number, field: keyof Omit<DraftLine, "key">, value: string) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    );
  }

  // Here's what you see: the form.
  return (
    <form action={formAction} className="mt-8 space-y-6">
      {/* Hidden fields you'll never see. They carry the job's ID and the packed-up lines along with the form. */}
      <input name="jobId" type="hidden" value={jobId} />
      <input name="lines" type="hidden" value={JSON.stringify(serializedLines)} />

      {/* The box that holds the reason and the lines. */}
      <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        {/* Why is this extra work needed? Be honest with the customer here. */}
        <div>
          <label
            className="block text-sm font-medium text-zinc-800"
            htmlFor="reason"
          >
            Why is this extra work needed?
          </label>
          <textarea
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
            id="reason"
            maxLength={500}
            name="reason"
            placeholder="Describe what was found and why the work is needed."
            required
            rows={3}
          />
        </div>

        {/* One group of boxes for every extra-work line. */}
        {lines.map((line, index) => {
          // Look up the item picked on this line, and which items other lines already use (so you can't add the same one twice).
          const item = items.find((candidate) => candidate.id === line.itemId);
          const usedByOtherLine = new Set(
            lines
              .filter((other) => other.key !== line.key)
              .map((other) => other.itemId),
          );
          const quantityMilli = parseQuantityToMilli(line.quantity);

          // Draw this one line.
          return (
            <fieldset
              className="space-y-4 rounded-lg border border-zinc-200 p-4"
              key={line.key}
            >
              <legend className="px-1 text-sm font-medium text-zinc-700">
                Extra-work line {index + 1}
              </legend>
              {/* The drop-down for picking a price book item, with each price shown. */}
              <label
                className="block text-sm font-medium text-zinc-800"
                htmlFor={`pricebook-item-${line.key}`}
              >
                Pricebook item
                <select
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                  id={`pricebook-item-${line.key}`}
                  onChange={(event) =>
                    updateLine(line.key, "itemId", event.target.value)
                  }
                  required
                  value={line.itemId}
                >
                  {items.map((candidate) => (
                    <option
                      disabled={usedByOtherLine.has(candidate.id)}
                      key={candidate.id}
                      value={candidate.id}
                    >
                      {candidate.name} — {formatCents(candidate.priceCents)} per{" "}
                      {candidate.unit}
                    </option>
                  ))}
                </select>
              </label>
              {/* The quantity box, this line's total, and a Remove link. */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label
                    className="block text-sm font-medium text-zinc-800"
                    htmlFor={`change-quantity-${line.key}`}
                  >
                    Quantity
                  </label>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                    id={`change-quantity-${line.key}`}
                    inputMode="numeric"
                    min="1"
                    onChange={(event) =>
                      updateLine(line.key, "quantity", event.target.value)
                    }
                    required
                    step="1"
                    title="Enter a positive whole-number quantity."
                    type="number"
                    value={line.quantity}
                  />
                </div>
                {/* This line's total (price times quantity), or a nudge to enter a valid quantity. */}
                <p className="text-sm text-zinc-600">
                  {item && quantityMilli !== null
                    ? `Line total: ${formatCents(lineTotalCents(quantityMilli, item.priceCents))}`
                    : "Enter a valid quantity"}
                </p>
                {/* Remove only shows up if you've got more than one line. */}
                {lines.length > 1 && (
                  <button
                    className="text-sm font-medium text-red-700 underline underline-offset-2"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((candidate) => candidate.key !== line.key),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>
            </fieldset>
          );
        })}

        {/* The Add button only appears while there are still price book items you haven't used. */}
        {items.length > lines.length && (
          <button
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => {
              const unusedItem = items.find(
                (item) => !lines.some((line) => line.itemId === item.id),
              );
              if (!unusedItem) return;
              setLines((current) => [
                ...current,
                { key: nextKey, itemId: unusedItem.id, quantity: "1" },
              ]);
              setNextKey((current) => current + 1);
            }}
            type="button"
          >
            Add pricebook line
          </button>
        )}

        {/* The draft total across all lines. */}
        <div className="flex justify-between border-t border-zinc-200 pt-4 text-lg font-semibold">
          <span>Draft total</span>
          <span>{draftTotal === null ? "—" : formatCents(draftTotal)}</span>
        </div>
        {/* A warning if any quantity isn't a whole number above zero. */}
        {!allLinesValid && (
          <p className="text-sm text-red-700" role="alert">
            Enter a positive whole-number quantity for every
            selected item.
          </p>
        )}
        {/* A warning if the total's too big. */}
        {totalError && (
          <p className="text-sm text-red-700" role="alert">
            {totalError}
          </p>
        )}
      </section>

      {/* If the server turned the save down, here's why, in a red box. */}
      {state.error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}

      {/* The buttons at the bottom: Cancel and Save draft. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {/* Cancel sends you back to the job. */}
        <Link
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-center font-medium text-zinc-800 hover:bg-zinc-50"
          href={`/jobs/${jobId}`}
        >
          Cancel
        </Link>
        {/* Save draft. It's disabled while saving, if the price book is empty, or if the total isn't valid. */}
        <button
          className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || items.length === 0 || draftTotal === null}
          type="submit"
        >
          {isPending ? "Saving..." : "Save draft"}
        </button>
      </div>
    </form>
  );
}
