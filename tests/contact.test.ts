import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callHref,
  dialableNumber,
  formatPhone,
  formatPhoneAsTyped,
  mapsHref,
  textHref,
  usPhoneDigits,
} from "../src/lib/contact";

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

describe("US phone formatting", () => {
  it("formats complete numbers as (xxx) xxx-xxxx", () => {
    assert.equal(formatPhone("5551234567"), "(555) 123-4567");
    assert.equal(formatPhone("555-123-4567"), "(555) 123-4567");
    assert.equal(formatPhone("+1 555 123 4567"), "(555) 123-4567");
  });

  it("leaves incomplete numbers alone and flags them", () => {
    assert.equal(formatPhone("123-4567"), "123-4567");
    assert.equal(usPhoneDigits("123-4567"), null);
    assert.equal(usPhoneDigits("(555) 123-4567"), "5551234567");
  });

  it("formats progressively while typing and caps at 10 digits", () => {
    assert.equal(formatPhoneAsTyped(""), "");
    assert.equal(formatPhoneAsTyped("55"), "(55");
    assert.equal(formatPhoneAsTyped("5551"), "(555) 1");
    assert.equal(formatPhoneAsTyped("5551234"), "(555) 123-4");
    assert.equal(formatPhoneAsTyped("555123456789"), "(555) 123-4567");
  });
});
