import { useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light";

/**
 * Custom hook for managing dark/light theme.
 * Persists to localStorage and toggles .light class on <html>.
 */
export function useTheme(storageKey = "dpa-theme"): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return [theme, toggle];
}
