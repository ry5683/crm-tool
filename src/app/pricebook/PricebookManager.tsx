"use client";

// This is the hands-on part of the Pricebook page: the "Add an item" form and the list of items you can edit or remove.
// It's a "client component," so it runs in the visitor's browser and forms respond instantly. (className text is Tailwind shorthand for looks.)

// Borrowing a React helper that tracks how a form turned out, plus the add, edit and remove actions from actions.ts.
import { FieldTag } from "@/components/FieldTag";
import { useActionState } from "react";
import {
  createPricebookItem,
  deletePricebookItem,
  setTaxRate,
  updatePricebookItem,
  type PricebookActionState,
} from "./actions";
import { formatCents, formatTaxRate } from "@/lib/money";

// One price book entry: its ID, name, unit (like "each") and price in cents.
type PricebookItem = {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
  taxable: boolean;
};

// Where every form starts: no error yet.
const initialState: PricebookActionState = { error: null };

// Shows a small red message under a form if something went wrong, and nothing at all otherwise.
function ActionError({ error }: { error: string | null }) {
  return error ? (
    <p className="mt-2 text-sm text-red-700" role="alert">
      {error}
    </p>
  ) : null;
}

// One editable card for an existing item, where you can save changes or remove it.
function ItemEditor({ item }: { item: PricebookItem }) {
  // Each form remembers its latest result and whether it's busy, so buttons can say "Saving..." and can't be double-clicked.
  const [updateState, updateAction, isUpdating] = useActionState(
    updatePricebookItem,
    initialState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePricebookItem,
    initialState,
  );

  // Draw the card.
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      {/* The edit form: name, unit and price boxes, plus a Save button. */}
      <form action={updateAction} className="grid gap-4 sm:grid-cols-[1fr_9rem_9rem_auto_auto]">
        {/* A hidden box carrying the item's ID so the server knows which one you're editing. */}
        <input name="id" type="hidden" value={item.id} />
        {/* The item name, already filled in. */}
        <label className="text-sm font-medium text-zinc-700">
          Item name <FieldTag required />
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            defaultValue={item.name}
            maxLength={120}
            name="name"
            required
          />
        </label>
        {/* The unit, already filled in. */}
        <label className="text-sm font-medium text-zinc-700">
          Unit <FieldTag required />
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            defaultValue={item.unit}
            maxLength={24}
            name="unit"
            required
          />
        </label>
        {/* The price in dollars. Only digits with up to two decimals get through. */}
        <label className="text-sm font-medium text-zinc-700">
          Price <FieldTag required />
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            defaultValue={(item.price_cents / 100).toFixed(2)}
            inputMode="decimal"
            name="price"
            pattern="[0-9]+([.][0-9]{1,2})?"
            required
            title="Enter a price with up to two decimal places."
            type="text"
          />
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            Current: {formatCents(item.price_cents)}
          </span>
        </label>
        <TaxableCheckbox defaultChecked={item.taxable} />
        {/* The Save button. */}
        <button
          className="self-end rounded-lg bg-hivis-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-hivis-500 disabled:opacity-60"
          disabled={isUpdating}
          type="submit"
        >
          {isUpdating ? "Saving..." : "Save"}
        </button>
      </form>
      {/* If saving fails, the reason shows up here. */}
      <ActionError error={updateState.error} />
      {/* A separate little form for removing the item. */}
      <form action={deleteAction} className="mt-3">
        <input name="id" type="hidden" value={item.id} />
        <button
          className="text-sm font-medium text-red-700 underline underline-offset-2 disabled:opacity-60"
          disabled={isDeleting}
          type="submit"
        >
          {isDeleting ? "Removing..." : "Remove item"}
        </button>
      </form>
      {/* If removing fails, the reason shows up here. */}
      <ActionError error={deleteState.error} />
    </article>
  );
}

// The whole pricebook area. "canEdit" is only true for business owners; everyone else just gets a read-only list.
// The "Taxable" checkbox, used on both the add and edit forms.
// Checked = sales tax is added on the invoice. Parts are usually taxable; labor usually isn't.
function TaxableCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 self-end py-2 text-sm font-medium text-zinc-700">
      <input
        className="h-5 w-5 accent-zinc-900"
        defaultChecked={defaultChecked}
        name="taxable"
        type="checkbox"
      />
      Taxable
      <span className="font-normal text-zinc-500">(parts yes, labor no)</span>
    </label>
  );
}

// The business's sales tax rate. Owners can change it; techs just see it.
function TaxRateSection({
  canEdit,
  taxRateMilliPercent,
}: {
  canEdit: boolean;
  taxRateMilliPercent: number;
}) {
  const [state, action, isSaving] = useActionState(setTaxRate, initialState);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Sales tax</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Added on invoices to taxable items only. Current rate:{" "}
        <strong className="text-zinc-950">{formatTaxRate(taxRateMilliPercent)}</strong>
        {taxRateMilliPercent === 0 && canEdit ? " — set your rate so invoices include tax." : ""}
      </p>
      {canEdit && (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-zinc-700">
            Tax rate (%) <FieldTag required />
            <input
              className="mt-1 block w-32 rounded-lg border border-zinc-300 px-3 py-2"
              defaultValue={(taxRateMilliPercent / 1000).toString()}
              inputMode="decimal"
              name="taxRate"
              pattern="[0-9]+([.][0-9]{1,3})?"
              required
              title="Enter a percent with up to three decimal places, like 7.75."
              type="text"
            />
          </label>
          <button
            className="rounded-lg bg-hivis-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-hivis-500 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : "Save rate"}
          </button>
        </form>
      )}
      <ActionError error={state.error} />
    </section>
  );
}

export default function PricebookManager({
  items,
  canEdit,
  taxRateMilliPercent,
}: {
  items: PricebookItem[];
  canEdit: boolean;
  taxRateMilliPercent: number;
}) {
  // Remembers how the "Add" form turned out.
  const [createState, createAction, isCreating] = useActionState(
    createPricebookItem,
    initialState,
  );

  // Draw the page body.
  return (
    <div className="mt-8 space-y-8">
      <TaxRateSection canEdit={canEdit} taxRateMilliPercent={taxRateMilliPercent} />
      {/* The "Add an item" form. Only owners see it. */}
      {canEdit && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Add an item</h2>
          <form action={createAction} className="mt-4 grid gap-4 sm:grid-cols-3">
            {/* The name box. */}
            <label className="text-sm font-medium text-zinc-700">
              Name <FieldTag required />
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                maxLength={120}
                name="name"
                placeholder="Brass shutoff valve"
                required
              />
            </label>
            {/* The unit box. */}
            <label className="text-sm font-medium text-zinc-700">
              Unit <FieldTag required />
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                maxLength={24}
                name="unit"
                placeholder="each or hour"
                required
              />
            </label>
            {/* The price box, in dollars. */}
            <label className="text-sm font-medium text-zinc-700">
              Unit price (dollars) <FieldTag required />
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                inputMode="decimal"
                name="price"
                pattern="[0-9]+([.][0-9]{1,2})?"
                placeholder="85.00"
                required
                title="Enter a price with up to two decimal places."
                type="text"
              />
            </label>
            <div className="sm:col-span-3">
              <TaxableCheckbox defaultChecked />
            </div>
            <div className="sm:col-span-3">
              {/* The Add button. */}
              <button
                className="rounded-lg bg-hivis-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-hivis-500 disabled:opacity-60"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? "Adding..." : "Add pricebook item"}
              </button>
              <ActionError error={createState.error} />
            </div>
          </form>
        </section>
      )}

      {/* The list of items. */}
      <section className="space-y-3" aria-label="Pricebook items">
        <h2 className="text-lg font-semibold text-zinc-950">
          {canEdit ? "Your items" : "Available items"}
        </h2>
        {/* Either an "nothing here yet" note, or one card per item. */}
        {items.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-5 text-zinc-600">
            No pricebook items have been added yet.
          </p>
        ) : (
          items.map((item) =>
            // Owners get a card they can edit; everyone else gets a plain read-only card.
            canEdit ? (
              <ItemEditor item={item} key={item.id} />
            ) : (
              <article
                className="flex flex-wrap justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5"
                key={item.id}
              >
                <div>
                  <h3 className="font-medium text-zinc-950">{item.name}</h3>
                  <p className="text-sm text-zinc-600">
                    Per {item.unit} · {item.taxable ? "Taxable" : "Not taxed"}
                  </p>
                </div>
                <p className="font-semibold text-zinc-950">
                  {formatCents(item.price_cents)}
                </p>
              </article>
            ),
          )
        )}
      </section>
    </div>
  );
}
