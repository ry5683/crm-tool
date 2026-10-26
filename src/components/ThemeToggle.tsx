"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const themeChangeEvent = "tinkr-theme-change";

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(themeChangeEvent, onChange);
  return () => window.removeEventListener(themeChangeEvent, onChange);
}

function getThemeSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

function getServerThemeSnapshot() {
  return false;
}

export default function ThemeToggle({
  className,
  label,
  standaloneOnly = false,
}: {
  className: string;
  label?: string;
  standaloneOnly?: boolean;
}) {
  const pathname = usePathname();
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const isStandaloneRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/approve") ||
    pathname.startsWith("/welcome");

  if (standaloneOnly && !isStandaloneRoute) {
    return null;
  }

  function toggleTheme() {
    const theme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event(themeChangeEvent));
    localStorage.setItem("tinkr-theme", theme);
  }

  return (
    <button
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      className={className}
      onClick={toggleTheme}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      type="button"
    >
      <span
        aria-hidden="true"
        className="theme-toggle-icon"
        data-dark={isDark}
      >
        <svg
          className="theme-toggle-sun"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
        <svg
          className="theme-toggle-moon"
          fill="none"
          stroke="currentColor"
          style={{ color: isDark ? "#71717a" : undefined }}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
        </svg>
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}
