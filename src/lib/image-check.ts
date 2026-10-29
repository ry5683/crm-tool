// Checks that uploaded bytes really are the kind of picture they claim to be.
// A file's name and type label can be faked; the first few bytes of a real JPEG or PNG can't
// be anything else. So the server looks at those bytes before saving anything.

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB (phones shrink photos well below this)
export const MAX_SIGNATURE_BYTES = 256 * 1024; // 256 KB (a signature is usually 10–40 KB)

// Every JPEG starts with FF D8 FF.
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Every PNG starts with these 8 bytes: 89 50 4E 47 0D 0A 1A 0A.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

// The signature pad sends its drawing as text: "data:image/png;base64,<letters>".
// This turns it back into bytes, or returns null if it isn't a real, reasonably small PNG.
export function decodePngDataUrl(dataUrl: string): Uint8Array | null {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return null;
  const base64 = dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  if ((base64.length * 3) / 4 > MAX_SIGNATURE_BYTES) return null;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  return isPng(bytes) ? bytes : null;
}
