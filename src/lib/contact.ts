// Little helpers that turn a customer's phone number or address into links a phone knows how to open.
// Tapping one should start a call, open a text, or open the maps app.

// Turns "(555) 123-4567" into "5551234567" so the phone's dialer understands it.
// A leading "+" (like +1 for the US) is kept. Returns null if there's nothing dialable in there.
export function dialableNumber(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  // Real phone numbers aren't tiny or huge, so anything outside this range is probably a typo.
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

// The link that starts a phone call when tapped.
export function callHref(phone: string): string | null {
  const number = dialableNumber(phone);
  return number ? `tel:${number}` : null;
}

// The link that opens a text message to that number when tapped.
export function textHref(phone: string): string | null {
  const number = dialableNumber(phone);
  return number ? `sms:${number}` : null;
}

// The link that opens the address in a maps app or website.
// encodeURIComponent makes sure odd characters (spaces, #, &) can't break the link.
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
