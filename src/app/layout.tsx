// This is the frame around every page in the app: the tab title, the fonts and the basic page structure.
// Every other page gets slotted inside this one.

// Borrowing a couple of type labels, two Google fonts, and the app-wide look from globals.css.
import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Barlow, Barlow_Semi_Condensed, Geist_Mono } from "next/font/google";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import "./globals.css";

// The main font (Barlow) for normal text. It's modeled on highway signs, so it reads well at a glance.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// A slightly narrower cut of the same font for headings.
const barlowCondensed = Barlow_Semi_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
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
  // iPhones ignore parts of the manifest, so this tells them directly: when saved to the home screen,
  // open full screen like an app, and use "Tinkr" as the name under the icon.
  // (The home screen icon itself comes from src/app/apple-icon.png.)
  appleWebApp: {
    capable: true,
    title: "Tinkr",
    statusBarStyle: "default",
  },
};

// How the page fits a phone screen. "cover" lets the page use the full screen on iPhones with a notch,
// and the theme color tints the phone's browser bar to match the app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#18181b",
};

// The frame itself. "children" is whichever page is showing right now.
export default function RootLayout({ children }: { children: ReactNode }) {
  // Draw the skeleton: language set to English, fonts applied, and the current page placed in the body.
  // (className text is Tailwind shorthand for looks.)
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} h-full antialiased`}
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
