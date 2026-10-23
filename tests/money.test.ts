import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCents,
  lineTotalCents,
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
