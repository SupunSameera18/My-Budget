"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — render nothing until client knows the theme
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink-primary"
    >
      {isDark ? (
        <Sun strokeWidth={1.75} className="h-5 w-5 shrink-0" />
      ) : (
        <Moon strokeWidth={1.75} className="h-5 w-5 shrink-0" />
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
