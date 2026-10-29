// All the money and quantity math lives here. Dollars are kept as whole cents and quantities as thousandths (1.5 is 1500),
// so there are never tiny rounding mistakes. Estimates, change orders, emails and tests all lean on it.

// Price of one line: quantity times unit price, rounded to the nearest cent. Quantity is in thousandths, hence dividing by 1000.
export function lineTotalCents(
  quantityMilli: number,
  unitPriceCents: number,
): number {
  // BigInt is just an extra-roomy kind of number, so big multiplications can't overflow before we get to check.
  const quantity = BigInt(quantityMilli);
  const unitPrice = BigInt(unitPriceCents);
  const total = (quantity * unitPrice + BigInt(500)) / BigInt(1000);

  // If the answer is absurdly big, we'd rather stop than show a wrong number.
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Line total exceeds the safe integer range.");
  }

  return Number(total);
}

// Shows cents as dollars, like 17500 becoming "$175.00".
export function formatCents(cents: number): string {
  // Sanity check: the amount has to be a clean whole number of cents.
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Currency amount must be a safe integer number of cents.");
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Adds up every line to get the grand total.
export function totalCents(
  lines: ReadonlyArray<{ quantityMilli: number; unitPriceCents: number }>,
): number {
  return lines.reduce((total, line) => {
    // Add this line to the running total, and make sure it's still a sane size.
    const nextTotal =
      total + lineTotalCents(line.quantityMilli, line.unitPriceCents);

    if (!Number.isSafeInteger(nextTotal)) {
      throw new RangeError("Estimate total exceeds the safe integer range.");
    }

    return nextTotal;
  }, 0);
}

// Turns typed text like "2.5" into a whole number scaled up by the decimal places (2.5 with 2 places becomes 250).
// If it isn't a valid number, or it's too big, you get null (nothing).
export function parseDecimalToScaledInteger(
  value: string,
  decimalPlaces: number,
): number | null {
  // A guard for us developers: only 0 to 6 decimal places are supported.
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new RangeError("Decimal places must be an integer between 0 and 6.");
  }

  // Only digits are allowed, optionally with a dot and up to the allowed number of decimals.
  const pattern =
    decimalPlaces === 0
      ? /^\d+$/
      : new RegExp(`^\\d+(?:\\.\\d{1,${decimalPlaces}})?$`);
  if (!pattern.test(value)) {
    return null;
  }

  // Split at the dot, pad the decimals with zeros if needed, then glue it back into one whole number.
  const [whole, fraction = ""] = value.split(".");
  const scaled =
    Number(whole) * 10 ** decimalPlaces +
    Number(fraction.padEnd(decimalPlaces, "0"));

  // Throw out numbers bigger than the database can store.
  return Number.isSafeInteger(scaled) && scaled <= 2_147_483_647
    ? scaled
    : null;
}

// Turns a whole-number quantity typed as text (like "3") into thousandths (3000). Anything invalid, zero, or too big gives null.
export function parseQuantityToMilli(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const quantity = Number(value);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > Math.floor(2_147_483_647 / 1_000)
  ) {
    return null;
  }
  return quantity * 1_000;
}

// ---------------------------------------------------------------------------
// Sales tax
// ---------------------------------------------------------------------------

// Tax rates are stored in thousandths of a percent, the same whole-number idea as cents:
// 7.75% is 7750, 7.875% is 7875. The highest rate we allow is 20% (20000).
export const MAX_TAX_RATE_MILLIPERCENT = 20_000;

// Tax on a taxable amount, rounded to the nearest cent (half a cent rounds up).
// Example: $175.00 at 7.75% → 17500 × 7750 / 100000 = 1356.25 → 1356 cents ($13.56).
export function taxCents(taxableSubtotalCents: number, rateMilliPercent: number): number {
  if (!Number.isSafeInteger(taxableSubtotalCents) || taxableSubtotalCents < 0) {
    throw new RangeError("Taxable amount must be a whole, non-negative number of cents.");
  }
  if (
    !Number.isInteger(rateMilliPercent) ||
    rateMilliPercent < 0 ||
    rateMilliPercent > MAX_TAX_RATE_MILLIPERCENT
  ) {
    throw new RangeError("Tax rate must be between 0% and 20%.");
  }
  const tax =
    (BigInt(taxableSubtotalCents) * BigInt(rateMilliPercent) + BigInt(50_000)) /
    BigInt(100_000);
  return Number(tax);
}

// Turns a typed rate like "7.75" (percent) into 7750. Returns null if it isn't a valid rate.
export function parseTaxRate(value: string): number | null {
  const scaled = parseDecimalToScaledInteger(value.trim(), 3);
  return scaled !== null && scaled <= MAX_TAX_RATE_MILLIPERCENT ? scaled : null;
}

// Shows a stored rate as a percent without trailing zeros: 7750 → "7.75%", 8000 → "8%".
export function formatTaxRate(rateMilliPercent: number): string {
  const whole = Math.floor(rateMilliPercent / 1_000);
  const fraction = String(rateMilliPercent % 1_000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

// Everything an invoice needs from its lines: subtotal, the part that's taxable, the tax, and the total.
export function invoiceTotals(
  lines: ReadonlyArray<{ quantityMilli: number; unitPriceCents: number; taxable: boolean }>,
  rateMilliPercent: number,
): { subtotalCents: number; taxableCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = totalCents(lines);
  const taxableCents = totalCents(lines.filter((line) => line.taxable));
  const tax = taxCents(taxableCents, rateMilliPercent);
  return { subtotalCents, taxableCents, taxCents: tax, totalCents: subtotalCents + tax };
}
