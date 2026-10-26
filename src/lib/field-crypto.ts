// Field-level encryption for sensitive customer contact details (email, phone, address).
// Values are sealed with AES-256-GCM on the server before they reach the database, so anyone who can read the
// database (or a backup) sees only ciphertext. The key lives in FIELD_ENCRYPTION_KEY and never leaves the server.
// Stored format: "enc:v1:<iv>:<ciphertext>:<tag>" (base64url). The field name is bound in as authenticated data,
// so a sealed phone number can't be swapped into the email column.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

export type CustomerContactField = "customer.email" | "customer.phone" | "customer.address";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) {
    throw new Error(
      "Set FIELD_ENCRYPTION_KEY in .env.local to a base64 string of 32 random bytes (see README).",
    );
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Seals a value. Empty or missing values stay empty; already-sealed values are left alone.
export function encryptField<T extends string | null | undefined>(
  value: T,
  field: CustomerContactField,
): T | string {
  if (value == null || value === "" || isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(Buffer.from(field));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const parts = [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url"));
  return `${PREFIX}${parts.join(":")}`;
}

// Opens a sealed value. Older plain-text values pass through unchanged until they're migrated.
export function decryptField<T extends string | null | undefined>(
  value: T,
  field: CustomerContactField,
): T | string {
  if (value == null || value === "" || !isEncrypted(value)) return value;
  const [iv, ciphertext, tag] = value
    .slice(PREFIX.length)
    .split(":")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !ciphertext || !tag) {
    throw new Error("A stored contact field is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(Buffer.from(field));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

type ContactRow = { email?: string | null; phone?: string | null; address?: string | null };

export function encryptContact<T extends ContactRow>(row: T): T {
  const out = { ...row };
  if ("email" in out) out.email = encryptField(out.email, "customer.email");
  if ("phone" in out) out.phone = encryptField(out.phone, "customer.phone");
  if ("address" in out) out.address = encryptField(out.address, "customer.address");
  return out;
}

export function decryptContact<T extends ContactRow>(row: T): T {
  const out = { ...row };
  if ("email" in out) out.email = decryptField(out.email, "customer.email");
  if ("phone" in out) out.phone = decryptField(out.phone, "customer.phone");
  if ("address" in out) out.address = decryptField(out.address, "customer.address");
  return out;
}
