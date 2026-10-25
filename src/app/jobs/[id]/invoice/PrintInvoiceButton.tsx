"use client";

// The "Print / Save as PDF" button on the invoice page. It lives in your browser and just opens the browser's normal print window.

// That "no-print" style below keeps the button itself off the printed page.
export default function PrintInvoiceButton() {
  // Clicking it opens the print window, which is also how you save a PDF.
  return (
    <button
      className="no-print rounded-lg bg-hivis-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-hivis-500"
      onClick={() => window.print()}
      type="button"
    >
      Print / Save as PDF
    </button>
  );
}
