// This is the app's "ID card" for phones. When someone taps "Add to Home Screen" (or "Install app"),
// the phone reads this to know the app's name, icon, colors, and which page to open first.
// Next.js turns this file into /manifest.webmanifest and links it on every page automatically.

// Borrowing Next.js's type label so the editor warns us if we misspell a setting.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // The full name (install screens) and the short one (under the home screen icon, where space is tight).
    name: "Tinkr",
    short_name: "Tinkr",
    description: "Change orders, approvals and invoices for the trades",
    // Open straight to the jobs list, the page techs use most.
    start_url: "/jobs",
    // "standalone" hides the browser's address bar and buttons, so it looks and feels like a real app.
    display: "standalone",
    // Background shows for a moment while the app opens; theme color tints the phone's top bar.
    background_color: "#ffffff",
    theme_color: "#18181b",
    // Home screen icons. "maskable" tells Android it may crop the square into its own shape (circle, squircle).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
