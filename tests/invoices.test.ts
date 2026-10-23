import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invoiceStatus } from "../src/lib/invoices";

describe("invoice status", () => {
  const now = new Date("2026-06-30T12:00:00Z");

  it("is paid whenever there is a paid date", () => {
    assert.equal(invoiceStatus("2026-06-01T00:00:00Z", "2025-01-01T00:00:00Z", now), "paid");
  });

  it("is unpaid inside the payment window", () => {
    assert.equal(invoiceStatus(null, "2026-06-10T00:00:00Z", now), "unpaid");
  });

  it("is overdue once the payment window has passed", () => {
    assert.equal(invoiceStatus(null, "2026-05-01T00:00:00Z", now), "overdue");
  });
});
