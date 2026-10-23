// A small colored pill that shows where a change order stands: draft, sent, approved or declined.
// It's reused anywhere change orders show up. (The colors come from Tailwind class names, which are style shorthand.)

// Which colors go with which status: gray for draft, blue for sent, green for approved, red for declined.
const statusStyles = {
  draft: "bg-zinc-100 text-zinc-800",
  sent: "bg-blue-50 text-blue-800",
  approved: "bg-green-50 text-green-800",
  declined: "bg-red-50 text-red-800",
} as const;

// The allowed statuses, pulled straight from the list above so the two can never disagree.
export type ChangeOrderStatus = keyof typeof statusStyles;

// Draws the pill for whatever status it's handed.
export default function StatusBadge({
  status,
}: {
  status: ChangeOrderStatus;
}) {
  // The pill itself: rounded, colored, and the status word capitalized.
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium capitalize ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}
