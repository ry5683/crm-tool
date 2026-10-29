"use client";

// Photos on one change order. On a draft, the tech can take or pick photos (up to 6) and remove them.
// Once the change order is sent, the photos are frozen and just shown.
// Before uploading, each photo is shrunk on the phone to at most 1600 pixels wide, so it uploads
// quickly on a weak cell signal and stays well under the 4 MB limit.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export type PhotoView = { id: string; url: string | null };

const MAX_PHOTOS = 6;
const MAX_EDGE = 1600;

// Redraws the photo smaller and saves it as a JPEG. Also fixes sideways phone photos.
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare photos.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.8),
  );
  if (!blob) throw new Error("This photo could not be prepared.");
  return blob;
}

export default function PhotoManager({
  changeOrderId,
  editable,
  photos,
}: {
  changeOrderId: string;
  editable: boolean;
  photos: PhotoView[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, room);
    setBusy(true);
    setError(files.length > room ? `Only ${MAX_PHOTOS} photos fit; the extras were skipped.` : null);
    try {
      for (const file of chosen) {
        const body = new FormData();
        body.set("changeOrderId", changeOrderId);
        body.set("photo", await shrinkPhoto(file), "photo.jpg");
        const response = await fetch("/api/change-orders/photos", { method: "POST", body });
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          setError(result.error ?? "A photo could not be added.");
          break;
        }
      }
    } catch (uploadError) {
      console.error("Photo upload failed.", uploadError);
      setError("A photo could not be read or sent. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  async function removePhoto(photoId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/change-orders/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error ?? "The photo could not be removed.");
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  if (!editable && photos.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-zinc-800">
        Photos {editable && <span className="font-normal text-zinc-500">({photos.length}/{MAX_PHOTOS})</span>}
      </p>
      {photos.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((photo) => (
            <li className="relative" key={photo.id}>
              {photo.url ? (
                <a href={photo.url} rel="noreferrer" target="_blank">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private links can't go through Next's image optimizer */}
                  <img
                    alt="Change order photo"
                    className="aspect-square w-full rounded-lg border border-zinc-200 object-cover"
                    src={photo.url}
                  />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500">
                  Unavailable
                </div>
              )}
              {editable && (
                <button
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-sm font-bold text-red-700 shadow disabled:opacity-60"
                  disabled={busy}
                  onClick={() => removePhoto(photo.id)}
                  type="button"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && photos.length < MAX_PHOTOS && (
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
          {busy ? "Uploading..." : "Add photos"}
          <input
            accept="image/*"
            className="sr-only"
            disabled={busy}
            multiple
            onChange={(event) => addPhotos(event.target.files)}
            ref={inputRef}
            type="file"
          />
        </label>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
