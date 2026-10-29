import "server-only";

// Private picture storage. Browsers never talk to these folders directly: only this server
// does, using the master key, and only after a database routine has said yes.
// Pictures are shown with signed links that stop working after a few minutes, so a link
// that gets copied or forwarded soon becomes useless.

import { createAdminClient } from "@/lib/supabase/admin";

export const PHOTO_BUCKET = "change-order-photos";
export const SIGNATURE_BUCKET = "approval-signatures";

// How long a picture link works, in seconds.
export const LINK_SECONDS = 10 * 60;

// Turns stored file locations into short-lived links. Returns a map of location → link.
// A file that can't be signed (for example, missing) is simply left out.
export async function signedLinks(
  bucket: string,
  paths: string[],
  seconds: number = LINK_SECONDS,
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (paths.length === 0) return links;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error) {
    console.error("Could not create picture links.", error.message);
    return links;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) links.set(item.path, item.signedUrl);
  }
  return links;
}
