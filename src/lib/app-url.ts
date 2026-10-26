import "server-only";

// The app's own web address, used to build links that go out in emails (approval links, team invites).
// Why a fixed setting: if links were built from details in the incoming request, a tampered request
// could make an email point somewhere else. In production we only trust APP_URL.
// While developing on your computer, it falls back to the address you're using (like your
// network address on your phone), so local testing keeps working without extra setup.
export function appOrigin(requestOrigin: string | null): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("APP_URL is not a valid web address. Example: https://app.yourdomain.com");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("APP_URL must start with https://");
    }
    return url.origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Set APP_URL on the server (for example https://app.yourdomain.com) before sending emails.");
  }
  if (!requestOrigin) {
    throw new Error("Could not work out the app's address. Set APP_URL in .env.local.");
  }
  return requestOrigin;
}
