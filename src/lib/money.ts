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
