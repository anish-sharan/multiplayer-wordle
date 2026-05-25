"use client";

import { useMemo } from "react";

const COLORS = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#38bdf8", "#ec4899"];

// Lightweight, dependency-free confetti burst. Render it briefly on a win.
export default function Confetti({ count = 90 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.8 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 160,
        bg: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
      })),
    [count]
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.w}px`,
            height: `${p.h}px`,
            background: p.bg,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
