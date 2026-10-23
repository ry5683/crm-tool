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

// Pulls the 10 digits of a US phone number out of whatever was typed, ignoring spaces, dashes, brackets and a leading 1.
// Returns null if it isn't exactly 10 digits, so we can tell a complete number from a partial one.
export function usPhoneDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}

// Shows a number the standard American way: (555) 123-4567.
// Anything that isn't a full 10-digit number is handed back untouched, so older entries are never lost.
export function formatPhone(phone: string): string {
  const ten = usPhoneDigits(phone);
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : phone;
}

// Formats a number while someone is still typing it: "5551" becomes "(555) 1", and so on.
// It stops at 10 digits so nobody can type extra ones.
export function formatPhoneAsTyped(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
