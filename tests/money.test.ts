import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCents,
  formatTaxRate,
  invoiceTotals,
  lineTotalCents,
  parseTaxRate,
  taxCents,
  parseDecimalToScaledInteger,
  parseQuantityToMilli,
  totalCents,
} from "../src/lib/money";

describe("money helpers", () => {
  it("calculates one and a half hours of labor in cents", () => {
    assert.equal(lineTotalCents(1_500, 9_500), 14_250);
  });

  it("rounds half cents up and values below half a cent down", () => {
    assert.equal(lineTotalCents(500, 1), 1);
    assert.equal(lineTotalCents(499, 1), 0);
    assert.equal(lineTotalCents(1_500, 1), 2);
  });

  it("handles zero lines and empty totals", () => {
    assert.equal(lineTotalCents(0, 9_500), 0);
    assert.equal(totalCents([]), 0);
    assert.equal(totalCents([{ quantityMilli: 1_000, unitPriceCents: 0 }]), 0);
  });

  it("calculates large allowed values without losing cent precision", () => {
    assert.equal(
      lineTotalCents(2_147_483_647, 2_147_483_647),
      4_611_686_014_132_421,
    );
  });

  it("rejects totals that cannot be represented as safe integers", () => {
    assert.throws(
      () =>
        totalCents([
          { quantityMilli: 2_147_483_647, unitPriceCents: 2_147_483_647 },
          { quantityMilli: 2_147_483_647, unitPriceCents: 2_147_483_647 },
        ]),
      RangeError,
    );
  });

  it("formats cents as dollars", () => {
    assert.equal(formatCents(17_500), "$175.00");
  });

  it("converts decimal form values to integer units", () => {
    assert.equal(parseDecimalToScaledInteger("1.5", 3), 1_500);
    assert.equal(parseDecimalToScaledInteger("95", 2), 9_500);
    assert.equal(parseDecimalToScaledInteger("1.2345", 3), null);
    assert.equal(parseDecimalToScaledInteger("21474836.48", 2), null);
  });

  it("accepts whole-number quantities and rejects decimals", () => {
    assert.equal(parseQuantityToMilli("1"), 1_000);
    assert.equal(parseQuantityToMilli("150"), 150_000);
    assert.equal(parseQuantityToMilli("1.5"), null);
    assert.equal(parseQuantityToMilli("1.001"), null);
    assert.equal(parseQuantityToMilli("0"), null);
    assert.equal(parseQuantityToMilli("2147484"), null);
  });
});

describe("sales tax", () => {
  it("taxes $175.00 at 7.75% as $13.56", () => {
    assert.equal(taxCents(17_500, 7_750), 1_356);
  });

  it("rounds half a cent up", () => {
    // $1.00 at 6.25% = 6.25 cents → 6; $0.08 at 6.25% = 0.5 cents → 1
    assert.equal(taxCents(100, 6_250), 6);
    assert.equal(taxCents(8, 6_250), 1);
  });

  it("charges no tax at a 0% rate or on $0", () => {
    assert.equal(taxCents(17_500, 0), 0);
    assert.equal(taxCents(0, 7_750), 0);
  });

  it("rejects rates above 20% and negative amounts", () => {
    assert.throws(() => taxCents(100, 20_001), RangeError);
    assert.throws(() => taxCents(-1, 7_750), RangeError);
  });

  it("reads and shows typed rates", () => {
    assert.equal(parseTaxRate("7.75"), 7_750);
    assert.equal(parseTaxRate("7.875"), 7_875);
    assert.equal(parseTaxRate("0"), 0);
    assert.equal(parseTaxRate("20.001"), null);
    assert.equal(parseTaxRate("abc"), null);
    assert.equal(parseTaxRate("7.7777"), null);
    assert.equal(formatTaxRate(7_750), "7.75%");
    assert.equal(formatTaxRate(7_875), "7.875%");
    assert.equal(formatTaxRate(8_000), "8%");
  });

  it("taxes parts but not labor on the water-heater example", () => {
    // $600 heater (part) + $145 valve (part) + 0.5 h labor at $60 = $30 (not taxed), at 7.75%
    const totals = invoiceTotals(
      [
        { quantityMilli: 1_000, unitPriceCents: 60_000, taxable: true },
        { quantityMilli: 1_000, unitPriceCents: 14_500, taxable: true },
        { quantityMilli: 500, unitPriceCents: 6_000, taxable: false },
      ],
      7_750,
    );
    assert.deepEqual(totals, {
      subtotalCents: 77_500,
      taxableCents: 74_500,
      taxCents: 5_774, // 74500 × 0.0775 = 5773.75 → 5774
      totalCents: 83_274,
    });
  });
});
