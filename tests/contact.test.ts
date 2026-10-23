import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callHref, dialableNumber, mapsHref, textHref } from "../src/lib/contact";

describe("contact links", () => {
  it("turns a formatted phone number into something a dialer understands", () => {
    assert.equal(dialableNumber("(555) 123-4567"), "5551234567");
    assert.equal(callHref("555-123-4567"), "tel:5551234567");
    assert.equal(textHref("555.123.4567"), "sms:5551234567");
  });

  it("keeps a leading plus for international numbers", () => {
    assert.equal(dialableNumber("+1 (555) 123-4567"), "+15551234567");
  });

  it("refuses numbers that are too short or too long to be real", () => {
    assert.equal(dialableNumber("12345"), null);
    assert.equal(callHref("not a number"), null);
    assert.equal(textHref("1234567890123456"), null);
  });

  it("builds a safe maps link even with odd characters in the address", () => {
    assert.equal(
      mapsHref(" 12 Main St #4 & Co "),
      "https://www.google.com/maps/search/?api=1&query=12%20Main%20St%20%234%20%26%20Co",
    );
  });
});
