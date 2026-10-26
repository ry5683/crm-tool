import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  decryptContact,
  decryptField,
  encryptContact,
  encryptField,
  isEncrypted,
} from "../src/lib/field-crypto";

process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");

describe("field encryption", () => {
  it("round-trips and hides the plain text", () => {
    const sealed = encryptField("(555) 123-4567", "customer.phone");
    assert.ok(isEncrypted(sealed));
    assert.ok(!sealed.includes("555"));
    assert.equal(decryptField(sealed, "customer.phone"), "(555) 123-4567");
  });

  it("uses a fresh IV each time", () => {
    assert.notEqual(
      encryptField("a@b.com", "customer.email"),
      encryptField("a@b.com", "customer.email"),
    );
  });

  it("refuses a value moved to another field or tampered with", () => {
    const sealed = encryptField("1 Main St", "customer.address");
    assert.throws(() => decryptField(sealed, "customer.email"));
    assert.throws(() => decryptField(sealed.slice(0, -2) + "AA", "customer.address"));
  });

  it("passes through empty and legacy plain-text values", () => {
    assert.equal(encryptField(null, "customer.email"), null);
    assert.equal(encryptField("", "customer.email"), "");
    assert.equal(decryptField("old@plain.com", "customer.email"), "old@plain.com");
  });

  it("only touches contact fields present on a row", () => {
    const row = encryptContact({ name: "Ann", email: "a@b.com", phone: null });
    assert.equal(row.name, "Ann");
    assert.ok(isEncrypted(row.email as string));
    assert.deepEqual(decryptContact(row), { name: "Ann", email: "a@b.com", phone: null });
  });
});
