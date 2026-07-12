"use client";

import { useEffect, useState } from "react";

/**
 * Recharts marks take a plain color string (SVG `fill`/`stroke` attributes
 * don't resolve CSS custom properties), so chart series colors can't just
 * ride Tailwind's `dark:` classes. This tracks the `prefers-color-scheme`
 * media query so chart components can pick the light/dark step of a hue
 * from the dataviz palette explicitly.
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mql.matches);
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return isDark;
}
