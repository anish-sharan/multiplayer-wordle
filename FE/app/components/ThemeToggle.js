"use client";

import { useEffect, useState } from "react";

// Switches the palette by setting the `data-theme` attribute on <html>. The
// choice is persisted to localStorage and applied before paint by the inline
// script in app/layout.js (so there's no flash of the wrong theme).
const THEMES = [
  { value: "dark", label: "🌙 Dark" },
  { value: "light", label: "☀️ Light" },
  { value: "colorblind", label: "👁️ Color-blind" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  // Sync to whatever the pre-hydration script already applied.
  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") ||
      localStorage.getItem("theme") ||
      "dark";
    setTheme(current);
  }, []);

  function change(e) {
    const next = e.target.value;
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore storage errors (e.g. private mode) */
    }
  }

  return (
    <select
      className="theme-select"
      value={theme}
      onChange={change}
      aria-label="Colour theme"
      title="Colour theme"
    >
      {THEMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
