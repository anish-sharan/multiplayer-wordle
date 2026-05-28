"use client";

const KEY = "wordle:streak";

function read() {
  if (typeof window === "undefined") return { current: 0, best: 0, wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { current: 0, best: 0, wins: 0, losses: 0 };
    const parsed = JSON.parse(raw);
    return {
      current: Number(parsed.current) || 0,
      best: Number(parsed.best) || 0,
      wins: Number(parsed.wins) || 0,
      losses: Number(parsed.losses) || 0,
    };
  } catch {
    return { current: 0, best: 0, wins: 0, losses: 0 };
  }
}

function write(s) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable / quota exceeded — silently ignore */
  }
}

export function getStreak() {
  return read();
}

export function recordWin() {
  const s = read();
  const current = s.current + 1;
  const next = {
    current,
    best: Math.max(s.best, current),
    wins: s.wins + 1,
    losses: s.losses,
  };
  write(next);
  return next;
}

export function recordLoss() {
  const s = read();
  const next = {
    current: 0,
    best: s.best,
    wins: s.wins,
    losses: s.losses + 1,
  };
  write(next);
  return next;
}

export function resetStreak() {
  const next = { current: 0, best: 0, wins: 0, losses: 0 };
  write(next);
  return next;
}
