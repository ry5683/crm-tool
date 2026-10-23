// This is the frame around every page in the app: the tab title, the fonts and the basic page structure.
// Every other page gets slotted inside this one.

// Borrowing a couple of type labels, two Google fonts, and the app-wide look from globals.css.
import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import "./globals.css";

// The main font (Geist) for normal text.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// A typewriter-style font (Geist Mono) for anything code-like.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// What shows on the browser tab and in search results.
export const metadata: Metadata = {
  title: { default: "Tinkr", template: "%s · Tinkr" },
  description: "Tinkr: change orders, approvals and invoices for the trades",
};

// How the page fits a phone screen. "cover" lets the page use the full screen on iPhones with a notch,
// and the theme color tints the phone's browser bar to match the app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d4ed8",
};

// The frame itself. "children" is whichever page is showing right now.
export default function RootLayout({ children }: { children: ReactNode }) {
  // Draw the skeleton: language set to English, fonts applied, and the current page placed in the body.
  // (className text is Tailwind shorthand for looks.)
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The top menu for laptops. It hides itself on phones, the sign-in page and customer pages. */}
        <Suspense fallback={null}>
          <DesktopNav />
        </Suspense>
        {children}
        {/* The phone menu bar sits after the page. It hides itself on the sign-in and customer pages. */}
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      </body>
    </html>
  );
}
