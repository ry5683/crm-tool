"use client";

// The top menu bar for laptops and tablets. It sticks to the top as you scroll, and a little blue underline
// glides from tab to tab when you move around. (Phones get the bottom bar instead.)

// Borrowed tools: links, which page we're on, a way to measure the tabs, and the sign-out routine.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/jobs/actions";
import Brand from "@/components/Brand";

// The tabs, and the rule for when each one counts as "current".
const tabs = [
  {
    href: "/jobs",
    label: "Jobs",
    match: (path: string) => path === "/jobs" || (path.startsWith("/jobs/") && path !== "/jobs/new"),
  },
  { href: "/customers", label: "Customers", match: (path: string) => path.startsWith("/customers") },
  { href: "/jobs/new", label: "New job", match: (path: string) => path === "/jobs/new" },
  { href: "/pricebook", label: "Pricebook", match: (path: string) => path.startsWith("/pricebook") },
];

export default function DesktopNav() {
  const pathname = usePathname();
  // The tab elements, so we can measure where the blue underline should sit.
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  // Which tab is current (or -1 if none).
  const activeIndex = tabs.findIndex((tab) => tab.match(pathname));

  // Whenever the page changes, measure the current tab and slide the underline under it.
  useEffect(() => {
    const el = refs.current[activeIndex];
    setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [activeIndex, pathname]);

  // The sign-in page, the home redirect and customer pages get no menu.
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/approve")) {
    return null;
  }

  return (
    <header className="no-print sticky top-0 z-30 hidden border-b border-zinc-200 bg-white/80 backdrop-blur md:block">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 lg:px-8">
        <Link href="/jobs">
          <Brand />
        </Link>
        <nav aria-label="Main menu" className="relative flex items-center gap-1 py-3">
          {tabs.map((tab, index) => (
            <Link
              aria-current={index === activeIndex ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                index === activeIndex ? "text-blue-700" : "text-zinc-600 hover:text-zinc-950"
              }`}
              href={tab.href}
              key={tab.href}
              ref={(el) => {
                refs.current[index] = el;
              }}
            >
              {tab.label}
            </Link>
          ))}
          {/* The gliding underline. It moves by changing its position and width, with a smooth transition. */}
          <span
            aria-hidden="true"
            className="absolute -bottom-px h-0.5 rounded-full bg-blue-600 transition-all duration-300 ease-out"
            style={{
              left: bar?.left ?? 0,
              width: bar?.width ?? 0,
              opacity: bar ? 1 : 0,
            }}
          />
          <form action={signOut} className="ml-3">
            <button
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
