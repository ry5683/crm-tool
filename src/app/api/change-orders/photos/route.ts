// Adds or removes a photo on a draft change order.
// The order of checks matters: who you are → the database agrees (team member, draft, under 6 photos)
// → the file really is a JPEG and not too big → only then is it saved, with the master key, in the
// private photo folder. If saving the file fails, the database spot is given back.

import { z } from "zod";
import { MAX_PHOTO_BYTES, isJpeg } from "@/lib/image-check";
import { PHOTO_BUCKET } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Only accept requests sent by our own pages, so another website can't make your browser do this.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  try {
    return origin !== null && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

// Makes sure someone is signed in. Returns their database connection, or null.
async function signedInClient() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims ? supabase : null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const supabase = await signedInClient();
  if (!supabase) {
    return Response.json({ error: "Sign in to add photos." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send the photo as a form upload." }, { status: 400 });
  }
  const changeOrderId = z.uuid().safeParse(form.get("changeOrderId"));
  const photo = form.get("photo");
  if (!changeOrderId.success || !(photo instanceof File)) {
    return Response.json({ error: "Choose a change order and a photo." }, { status: 400 });
  }
  if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Photos must be smaller than 4 MB." }, { status: 413 });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (!isJpeg(bytes)) {
    return Response.json({ error: "That file isn't a JPEG photo." }, { status: 415 });
  }

  // The database decides whether this is allowed, and picks where the file goes.
  const { data, error } = await supabase.rpc("add_change_order_photo", {
    p_change_order_id: changeOrderId.data,
  });
  const spot = (data as Array<{ photo_id: string; storage_path: string }> | null)?.[0];
  if (error || !spot) {
    return Response.json({ error: error?.message ?? "The photo could not be added." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(spot.storage_path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("Photo upload failed; giving the spot back.", uploadError.message);
    await supabase.rpc("remove_change_order_photo", { p_photo_id: spot.photo_id });
    return Response.json({ error: "The photo could not be saved. Please try again." }, { status: 502 });
  }

  return Response.json({ id: spot.photo_id });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const supabase = await signedInClient();
  if (!supabase) {
    return Response.json({ error: "Sign in to remove photos." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = z.object({ photoId: z.uuid() }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Choose a valid photo." }, { status: 400 });
  }

  // The database checks you're on the team and the change order is still a draft.
  const { data: path, error } = await supabase.rpc("remove_change_order_photo", {
    p_photo_id: parsed.data.photoId,
  });
  if (error || typeof path !== "string") {
    return Response.json({ error: error?.message ?? "The photo could not be removed." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from(PHOTO_BUCKET).remove([path]);
  if (removeError) {
    // The photo is already off the change order; the leftover file is harmless and private.
    console.error("Photo row removed but the file could not be deleted.", removeError.message);
  }
  return Response.json({ removed: true });
}
