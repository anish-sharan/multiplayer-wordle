"use client";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export default function Keyboard({ onKey, letterStates = {}, disabled }) {
  function press(key) {
    if (disabled) return;
    onKey(key);
  }

  return (
    <div className="keyboard">
      {ROWS.map((rowKeys, r) => (
        <div className="kb-row" key={r}>
          {r === 2 && (
            <button className="key wide" onClick={() => press("ENTER")}>
              Enter
            </button>
          )}
          {rowKeys.split("").map((k) => (
            <button
              key={k}
              className={`key ${letterStates[k] || ""}`}
              onClick={() => press(k)}
            >
              {k}
            </button>
          ))}
          {r === 2 && (
            <button className="key wide" onClick={() => press("BACKSPACE")}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
