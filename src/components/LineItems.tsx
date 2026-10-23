// Shows a list of work and parts (description, quantity, price, line total) with a grand total underneath.
// It's used on the customer approval page and elsewhere. Phones get a stacked list; bigger screens get a table.

// Money helpers: show cents as dollars, price one line, and add up all the lines.
import { formatCents, lineTotalCents, totalCents } from "@/lib/money";

// One line: what it is, how many (in thousandths), and the price per unit in cents. The ID is optional.
export type LineItem = {
  id?: string;
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
};

// Give it the lines, and optionally a label for the total (it says "Total" if you don't).
export default function LineItems({
  lines,
  totalLabel = "Total",
}: {
  lines: LineItem[];
  totalLabel?: string;
}) {
  // Add up every line for the grand total.
  const total = totalCents(lines);

  // We draw both layouts, and the screen size decides which one you actually see.
  return (
    <div>
      {/* The phone layout: each line stacked, with the description on top, then quantity times price and the line total. */}
      <ul className="divide-y divide-zinc-200 sm:hidden">
        {/* One entry for each line. */}
        {lines.map((line, index) => (
          <li className="py-4 first:pt-0 last:pb-0" key={line.id ?? index}>
            <p className="font-medium text-zinc-950">{line.description}</p>
            <div className="mt-1 flex justify-between gap-3 text-sm text-zinc-600">
              <span>
                {(line.quantityMilli / 1_000).toLocaleString("en-US")} ×{" "}
                {formatCents(line.unitPriceCents)}
              </span>
              <span className="font-medium text-zinc-950">
                {formatCents(
                  lineTotalCents(line.quantityMilli, line.unitPriceCents),
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* The bigger-screen layout: a table with columns for description, quantity, unit price and line total. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          {/* The column headings. */}
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-3 pr-4 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="py-3 pl-4 text-right font-medium">Line total</th>
            </tr>
          </thead>
          {/* One table row for each line. */}
          <tbody className="divide-y divide-zinc-200">
            {lines.map((line, index) => (
              <tr key={line.id ?? index}>
                <td className="py-3 pr-4 font-medium text-zinc-950">
                  {line.description}
                </td>
                <td className="px-4 py-3 text-right text-zinc-700">
                  {(line.quantityMilli / 1_000).toLocaleString("en-US")}
                </td>
                <td className="px-4 py-3 text-right text-zinc-700">
                  {formatCents(line.unitPriceCents)}
                </td>
                <td className="py-3 pl-4 text-right font-medium text-zinc-950">
                  {formatCents(
                    lineTotalCents(line.quantityMilli, line.unitPriceCents),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The grand total row at the bottom. */}
      <div className="mt-5 flex justify-between border-t border-zinc-200 pt-4 text-lg font-semibold">
        <span>{totalLabel}</span>
        <span>{formatCents(total)}</span>
      </div>
    </div>
  );
}
