"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Small coloured example tile used inside the modal. `state` maps to the
// active theme's colours; `bg` forces a fixed colour (for the colour-blind
// preview, which should look the same regardless of the current theme).
function Tile({ letter, state, bg }) {
  if (bg) {
    // Slate fill (absent) needs white text; the light orange/blue fills need dark text.
    const isSlate = bg === "#2c3140";
    return (
      <span
        className="htp-tile"
        style={{ background: bg, borderColor: bg, color: isSlate ? "#fff" : "#0e0f1a" }}
      >
        {letter}
      </span>
    );
  }
  return <span className={`htp-tile ${state || ""}`}>{letter}</span>;
}

export default function HowToPlay({ className = "" }) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const modal = (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div
        className="card htp-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
      >
        {/* Fixed header — the ✕ close stays visible while the body scrolls. */}
        <div className="htp-head">
          <h2>How to play</h2>
          <button
            type="button"
            className="htp-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="htp-body">
          <p className="subtitle">
            Guess the secret word in <strong>6 tries</strong>. The host picks the
            length (<strong>4, 5, or 6 letters</strong>) in the lobby. After each
            guess, the tile colours tell you how close you were.
          </p>

          <div className="htp-section">
            <div className="htp-example">
              <Tile letter="C" state="correct" />
              <Tile letter="R" />
              <Tile letter="A" />
              <Tile letter="N" />
              <Tile letter="E" />
            </div>
            <p className="htp-text">
              <strong>C</strong> is in the word and in the right spot.
            </p>
          </div>

          <div className="htp-section">
            <div className="htp-example">
              <Tile letter="P" />
              <Tile letter="I" state="present" />
              <Tile letter="L" />
              <Tile letter="O" />
              <Tile letter="T" />
            </div>
            <p className="htp-text">
              <strong>I</strong> is in the word but in the wrong spot.
            </p>
          </div>

          <div className="htp-section">
            <div className="htp-example">
              <Tile letter="V" />
              <Tile letter="A" />
              <Tile letter="U" state="absent" />
              <Tile letter="L" />
              <Tile letter="T" />
            </div>
            <p className="htp-text">
              <strong>U</strong> is not in the word in any spot.
            </p>
          </div>

          <div className="htp-divider" />

          <h3 className="htp-subhead">👁️ Color-blind friendly mode</h3>
          <p className="htp-text">
            Pick <strong>Color-blind</strong> from the theme menu (top-right) to
            swap the green/yellow tiles for <strong>orange &amp; blue</strong> —
            hues that stay distinct with red-green colour blindness:
          </p>
          <div className="htp-section">
            <div className="htp-legend-row">
              <Tile letter="C" bg="#f97316" />
              <span className="htp-text">
                <strong>Orange</strong> = right spot (replaces green).
              </span>
            </div>
            <div className="htp-legend-row">
              <Tile letter="I" bg="#38bdf8" />
              <span className="htp-text">
                <strong>Blue</strong> = wrong spot (replaces amber).
              </span>
            </div>
            <div className="htp-legend-row">
              <Tile letter="U" bg="#2c3140" />
              <span className="htp-text">
                <strong>Slate</strong> = not in the word (unchanged).
              </span>
            </div>
          </div>

          <div className="htp-divider" />

          <h3 className="htp-subhead">Game modes</h3>
          <ul className="htp-list">
            <li>
              <strong>🤝 Co-op</strong> — the whole room shares{" "}
              <strong>one board</strong>. Anyone can type into the shared row and
              submit; you have 6 guesses to crack one word together.
            </li>
            <li>
              <strong>⚔️ Versus</strong> — everyone gets their own board with the{" "}
              <strong>same word</strong> and races to solve it first. Opponents'
              tile colours stream in live (letters hidden).
            </li>
          </ul>

          <h3 className="htp-subhead">Winning</h3>
          <ul className="htp-list">
            <li>
              <strong>Versus:</strong> whoever solves <strong>fastest</strong>{" "}
              wins the round. 🏆
            </li>
            <li>
              <strong>Co-op:</strong> whoever puts the <strong>most letters</strong>{" "}
              into the team's guesses wins the round. 🏆
            </li>
          </ul>
          <p className="htp-text">
            Wins add up across rounds, so the results screen shows the running
            tally for everyone in the room.
          </p>
        </div>

        {/* Pinned footer — always-reachable close button. */}
        <div className="htp-footer">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`btn ghost htp-trigger ${className}`}
        onClick={() => setOpen(true)}
        aria-label="How to play"
      >
        How to play
      </button>

      {/* Portal to <body> so the fixed overlay isn't trapped by the topbar's
          backdrop-filter (which would otherwise become its containing block). */}
      {open && typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
