"use client";

// The form for making a job. We reuse it for editing one, too.
// It lives in your browser, so it can react as you type (like updating the estimate total). When you hit Save, it passes your answers to a "server action", a function that runs on our server, handed in as `action`.

// Borrowed tools: form helpers, links, and our money helpers, which turn dollars and quantities into exact whole numbers and back.
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  formatCents,
  lineTotalCents,
  parseQuantityToMilli,
  parseDecimalToScaledInteger,
  totalCents,
} from "@/lib/money";
import type { CreateJobState } from "./actions";

// A customer you can pick in the drop-down.
type CustomerOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

// When you're editing, this is the job's current info that we pre-fill into the form.
type InitialJob = {
  jobId: string;
  customerId: string;
  description: string;
  assignedTechId: string | null;
  lines: { description: string; quantity: string; unitPrice: string }[];
};

// A technician you can assign to the job.
type TechnicianOption = {
  userId: string;
};

// One estimate line while you're still typing it. Everything's kept as text until it's saved. The "key" is just a tag so the screen can tell lines apart.
type DraftLine = {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
};

// When the form first loads, there's no error to show.
const initialState: CreateJobState = { error: null };

// The form. It's told what to do on save, who the customers and technicians are, and, if editing, what the job looks like now.
export default function JobForm({
  action,
  customers,
  technicians,
  initial,
}: {
  action: (
    previousState: CreateJobState,
    formData: FormData,
  ) => Promise<CreateJobState>;
  customers: CustomerOption[];
  technicians: TechnicianOption[];
  initial?: InitialJob;
}) {
  // Are we editing an existing job or making a new one? We also track the save result and whether a save is in progress.
  const isEditing = initial !== undefined;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [customerId, setCustomerId] = useState(
    initial?.customerId ?? customers[0]?.id ?? "__new__",
  );
  // The form's memory of your estimate lines. A new job starts with one blank line; editing starts with the saved ones.
  const [lines, setLines] = useState<DraftLine[]>(
    initial && initial.lines.length > 0
      ? initial.lines.map((line, index) => ({ key: index, ...line }))
      : [{ key: 0, description: "", quantity: "1", unitPrice: "" }],
  );
  const [nextLineKey, setNextLineKey] = useState(initial?.lines.length || 1);
  // Figure out whether to show the "new customer" boxes, and which existing customer is picked.
  const isNewCustomer = !isEditing && customerId === "__new__";
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  // Pack your lines into a simple list the server can read. Quantity and price become exact whole numbers (thousandths and cents).
  const serializedLines = lines.map((line) => ({
    description: line.description,
    quantityMilli: parseQuantityToMilli(line.quantity),
    unitPriceCents: parseDecimalToScaledInteger(line.unitPrice, 2),
  }));

  // Keep just the lines that have a usable quantity and price, so a half-typed line doesn't mess up the total.
  const totalLines = lines.flatMap((line) => {
    const quantityMilli = parseQuantityToMilli(line.quantity);
    const unitPriceCents = parseDecimalToScaledInteger(line.unitPrice, 2);
    return quantityMilli !== null && unitPriceCents !== null
      ? [{ quantityMilli, unitPriceCents }]
      : [];
  });
  // Add up the estimate total. If it's absurdly huge, we flag it rather than show a wrong number.
  let runningTotal = 0;
  let totalOverflow = false;
  try {
    runningTotal = totalCents(totalLines);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    totalOverflow = true;
  }

  // Changes one box (description, quantity or price) on one line as you type.
  function updateLine(key: number, field: keyof Omit<DraftLine, "key">, value: string) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }

  // Here's what you see: the form.
  return (
    <form action={formAction} className="mt-8 space-y-8">
      {/* Hidden fields you'll never see. They carry the packed-up estimate lines, and the job's ID when editing, along with the form. */}
      <input
        name="estimateLines"
        type="hidden"
        value={JSON.stringify(serializedLines)}
      />
      {initial && <input name="jobId" type="hidden" value={initial.jobId} />}

      {/* Box one: the customer and job details. */}
      <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Customer and job</h2>

        {/* The customer drop-down. When creating a job it also offers "Add a new customer". */}
        <div>
          <label
            className="mb-2 block text-sm font-medium text-zinc-800"
            htmlFor="customerId"
          >
            Customer
          </label>
          <select
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
            id="customerId"
            name="customerId"
            onChange={(event) => setCustomerId(event.target.value)}
            value={customerId}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
            {!isEditing && <option value="__new__">Add a new customer</option>}
          </select>
        </div>

        {/* When editing, you can fix up this customer's name, address, email and phone right here. */}
        {isEditing && selectedCustomer && (
          <div className="grid gap-4 sm:grid-cols-2" key={selectedCustomer.id}>
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerName"
              >
                Customer name
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                defaultValue={selectedCustomer.name}
                id="customerName"
                name="customerName"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerAddress"
              >
                Address <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                defaultValue={selectedCustomer.address ?? ""}
                id="customerAddress"
                name="customerAddress"
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerEmail"
              >
                Email <span className="font-normal text-zinc-500">(needed to send approvals)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                defaultValue={selectedCustomer.email ?? ""}
                id="customerEmail"
                name="customerEmail"
                type="email"
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerPhone"
              >
                Phone <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                defaultValue={selectedCustomer.phone ?? ""}
                id="customerPhone"
                name="customerPhone"
                type="tel"
              />
            </div>
          </div>
        )}

        {/* When adding a new customer, these are the blank boxes for their name, address, email and phone. */}
        {isNewCustomer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerName"
              >
                Customer name
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id="customerName"
                name="customerName"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerAddress"
              >
                Address <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id="customerAddress"
                name="customerAddress"
              />
            </div>
            {/* Email. */}
            <div>
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerEmail"
              >
                Email <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id="customerEmail"
                name="customerEmail"
                type="email"
              />
            </div>
            {/* Phone. */}
            <div>
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor="customerPhone"
              >
                Phone <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id="customerPhone"
                name="customerPhone"
                type="tel"
              />
            </div>
          </div>
        )}

        {/* What work is being done on this job? */}
        <div>
          <label
            className="mb-2 block text-sm font-medium text-zinc-800"
            htmlFor="description"
          >
            Job description
          </label>
          <textarea
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
            id="description"
            defaultValue={initial?.description}
            name="description"
            required
            rows={3}
          />
        </div>

        {/* Optionally pick a technician to take the job. */}
        <div>
          <label
            className="mb-2 block text-sm font-medium text-zinc-800"
            htmlFor="assignedTechId"
          >
            Assign a technician{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <select
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
            defaultValue={initial?.assignedTechId ?? ""}
            id="assignedTechId"
            name="assignedTechId"
          >
            <option value="">Not assigned</option>
            {technicians.map((technician, index) => (
              <option key={technician.userId} value={technician.userId}>
                Technician {index + 1} ({technician.userId.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Box two: the original estimate, built from lines. */}
      <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Original estimate</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Enter a whole-number quantity and price in dollars.
          </p>
        </div>

        {/* One group of boxes for every estimate line: what it is, how many, the price, its total, and a Remove link when there's more than one. */}
        {lines.map((line, index) => (
          <fieldset
            className="space-y-4 rounded-lg border border-zinc-200 p-4"
            key={line.key}
          >
            <legend className="px-1 text-sm font-medium text-zinc-700">
              Estimate line {index + 1}
            </legend>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-zinc-800"
                htmlFor={`line-description-${line.key}`}
              >
                Description
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                id={`line-description-${line.key}`}
                onChange={(event) =>
                  updateLine(line.key, "description", event.target.value)
                }
                required
                value={line.description}
              />
            </div>
            {/* Quantity and price sit side by side. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-zinc-800"
                  htmlFor={`line-quantity-${line.key}`}
                >
                  Quantity
                </label>
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                  id={`line-quantity-${line.key}`}
                  inputMode="numeric"
                  min="1"
                  onChange={(event) =>
                    updateLine(line.key, "quantity", event.target.value)
                  }
                  placeholder="1"
                  required
                  step="1"
                  title="Enter a positive whole-number quantity."
                  type="number"
                  value={line.quantity}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-zinc-800"
                  htmlFor={`line-price-${line.key}`}
                >
                  Unit price (dollars)
                </label>
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                  id={`line-price-${line.key}`}
                  inputMode="decimal"
                  onChange={(event) =>
                    updateLine(line.key, "unitPrice", event.target.value)
                  }
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  placeholder="95.00"
                  required
                  title="Enter a price with up to two decimal places."
                  type="text"
                  value={line.unitPrice}
                />
              </div>
            </div>
            {/* This line's total (quantity times price) on one side, Remove on the other. */}
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-zinc-600">
                Line total:{" "}
                <span className="font-semibold text-zinc-950">
                  {formatCents(
                    lineTotalCents(
                      parseQuantityToMilli(line.quantity) ?? 0,
                      parseDecimalToScaledInteger(line.unitPrice, 2) ?? 0,
                    ),
                  )}
                </span>
              </p>
              {/* Only show Remove when there's more than one line, because a job needs at least one. */}
              {lines.length > 1 && (
                // The Remove link: drops just this line.
                <button
                  className="text-red-700 underline underline-offset-2"
                  onClick={() =>
                    setLines((currentLines) =>
                      currentLines.filter((candidate) => candidate.key !== line.key),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          </fieldset>
        ))}

        {/* Adds another blank estimate line. */}
        <button
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={() => {
            setLines((currentLines) => [
              ...currentLines,
              { key: nextLineKey, description: "", quantity: "1", unitPrice: "" },
            ]);
            setNextLineKey((key) => key + 1);
          }}
          type="button"
        >
          Add estimate line
        </button>

        {/* The estimate total, adding up every line. */}
        <div className="flex justify-between border-t border-zinc-200 pt-4 text-lg font-semibold">
          <span>Estimate total</span>
          <span>{totalOverflow ? "Over supported limit" : formatCents(runningTotal)}</span>
        </div>
        {/* A warning if the total's too big to calculate safely. */}
        {totalOverflow && (
          <p className="text-sm text-red-700" role="alert">
            Reduce one or more line amounts. The total is too large to calculate safely.
          </p>
        )}
      </section>

      {/* If the server turned the save down, here's why, in a red box. */}
      {state.error && (
        <p
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      {/* The buttons at the bottom: Cancel and Save. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {/* Cancel takes you back to the job (if editing) or the jobs list. */}
        <Link
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-center font-medium text-zinc-800 hover:bg-zinc-50"
          href={initial ? `/jobs/${initial.jobId}` : "/jobs"}
        >
          Cancel
        </Link>
        {/* Save. It's disabled while saving, or if the total's too big. */}
        <button
          className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || totalOverflow}
          type="submit"
        >
          {isPending ? "Saving..." : isEditing ? "Save changes" : "Save job"}
        </button>
      </div>
    </form>
  );
}
