"use client";

import { useEffect, useState } from "react";

/**
 * Recharts marks take a plain color string (SVG `fill`/`stroke` attributes
 * don't resolve CSS custom properties), so chart series colors can't just
 * ride Tailwind's `dark:` classes. This tracks the `prefers-color-scheme`
 * media query so chart components can pick the light/dark step of a hue
 * from the dataviz palette explicitly.
 */
function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return isDark;
}
