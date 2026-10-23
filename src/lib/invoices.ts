// Small rules about invoices, kept apart from the pages so they're easy to test.

// How many days a customer has to pay before an invoice counts as overdue.
export const PAYMENT_TERMS_DAYS = 30;

export type InvoiceStatus = "paid" | "unpaid" | "overdue";

// Paid if there's a paid date. Otherwise overdue once the job is older than the payment terms, else just unpaid.
export function invoiceStatus(
  paidAt: string | null,
  createdAt: string,
  now: Date = new Date(),
): InvoiceStatus {
  if (paidAt) return "paid";
  const dueMs = new Date(createdAt).getTime() + PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() > dueMs ? "overdue" : "unpaid";
}
