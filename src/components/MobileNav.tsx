"use client";

// This is the menu bar that sticks to the bottom of the screen on a phone, like in a regular phone app.
// On bigger screens (laptops, tablets) it hides itself, because the page already has buttons up top.

// Borrowed tools: a link component, a way to know which page we're on, and our sign-out routine.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/jobs/actions";

// The tabs, in order. "match" decides when a tab should light up as the current one.
const tabs = [
  {
    href: "/jobs",
    label: "Jobs",
    match: (path: string) => path === "/jobs" || (path.startsWith("/jobs/") && path !== "/jobs/new"),
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    href: "/customers",
    label: "Customers",
    match: (path: string) => path.startsWith("/customers"),
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  },
  {
    href: "/jobs/new",
    label: "New job",
    match: (path: string) => path === "/jobs/new",
    icon: "M12 5v14M5 12h14",
  },
  {
    href: "/pricebook",
    label: "Pricebook",
    match: (path: string) => path.startsWith("/pricebook"),
    icon: "M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.5 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5",
  },
  {
    href: "/invoices",
    label: "Invoices",
    match: (path: string) => path.startsWith("/invoices"),
    icon: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8",
  },
  {
    href: "/team",
    label: "Team",
    match: (path: string) => path.startsWith("/team"),
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9",
  },
];

// Pages where the menu shouldn't show: the sign-in page, and the page customers see from their email link.
// (Customers aren't staff, so they don't get our app menu.)
function shouldHideNav(path: string): boolean {
  return path === "/" || path.startsWith("/login") || path.startsWith("/approve") || path.startsWith("/welcome");
}

// A small helper that draws one simple line icon from a path of drawing instructions.
function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d={d} />
    </svg>
  );
}

export default function MobileNav() {
  // Which page are we on right now? This is how we know which tab to highlight.
  const pathname = usePathname();

  // On the sign-in page and customer pages, show nothing at all.
  if (shouldHideNav(pathname)) {
    return null;
  }

  return (
    <>
      {/* An invisible spacer the same height as the bar, so the bar never covers the bottom of a page. */}
      <div aria-hidden="true" className="no-print h-24 md:hidden" />

      {/* The bar itself. Pinned to the bottom, phone-only, and padded so it clears the iPhone's home-indicator strip. */}
      <nav
        aria-label="Main menu"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="relative mx-auto grid max-w-md grid-cols-7">
          {/* A little blue bar that slides over to whichever tab you're on. Each tab is a seventh of the width. */}
          <li
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-0.5 w-1/7 transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(${Math.max(tabs.findIndex((tab) => tab.match(pathname)), 0) * 100}%)`,
              opacity: tabs.some((tab) => tab.match(pathname)) ? 1 : 0,
            }}
          >
            <span className="mx-auto block h-full w-8 rounded-full bg-blue-600" />
          </li>
          {tabs.map((tab) => {
            const isActive = tab.match(pathname);
            return (
              <li key={tab.href}>
                {/* Each tab is a big tap target (at least 56px tall) so it's easy to hit with a thumb. */}
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
                    isActive ? "text-blue-700" : "text-zinc-500 active:text-zinc-900"
                  }`}
                  href={tab.href}
                >
                  <span className={`transition-transform duration-200 ${isActive ? "-translate-y-0.5 scale-110" : ""}`}>
                    <Icon d={tab.icon} />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}

          {/* Sign out is a form button instead of a link, because it has to run our sign-out routine. */}
          <li>
            <form action={signOut}>
              <button
                className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium text-zinc-500 active:text-zinc-900"
                type="submit"
              >
                <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </>
  );
}
