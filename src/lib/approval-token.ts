import "server-only";

// This file makes the secret code that lives inside each customer approval link, and checks codes that come back.
// It's server-only, so it can never leak into a browser.

// Built-in tools for making random codes and scrambling them.
import { createHash, randomBytes } from "node:crypto";

// Makes a brand-new random code that nobody could guess, to go in the customer's link.
export function createApprovalToken(): string {
  return randomBytes(32).toString("base64url");
}

// Scrambles a code one way into a fingerprint (a hash). We store only this, so a stolen database can't hand out working links.
export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Quick look-over: a real code is exactly 43 letters, numbers, dashes or underscores. Anything else is junk and gets tossed early.
export function isValidApprovalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
