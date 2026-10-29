import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePngDataUrl, isJpeg, isPng } from "../src/lib/image-check";

// The smallest valid PNG (1×1 pixel), as base64.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("image checks", () => {
  it("recognises a JPEG by its first bytes", () => {
    assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
    assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00])), false);
  });

  it("rejects a text file renamed to .jpg", () => {
    assert.equal(isJpeg(new TextEncoder().encode("<script>alert(1)</script>")), false);
  });

  it("accepts a real PNG signature and nothing else", () => {
    assert.equal(decodePngDataUrl(`data:image/png;base64,${TINY_PNG}`) !== null, true);
    assert.equal(isPng(new TextEncoder().encode("not a png at all")), false);
  });

  it("rejects the wrong type label, bad characters and oversized drawings", () => {
    assert.equal(decodePngDataUrl(`data:image/svg+xml;base64,${TINY_PNG}`), null);
    assert.equal(decodePngDataUrl("data:image/png;base64,<svg onload=x>"), null);
    assert.equal(decodePngDataUrl(`data:image/png;base64,${"A".repeat(400_000)}`), null);
  });
});
