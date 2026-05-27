"use client";

function Tile({ ch, state, col }) {
  const cls = state ? `tile ${state}` : ch ? "tile filled pop" : "tile";
  // --col staggers the flip reveal across the row (see .tile.correct in CSS).
  return (
    <div className={cls} style={{ "--col": col }}>
      {ch}
    </div>
  );
}

function Row({ letters = "", result, wordLength = 5, isCurrent, shake }) {
  const tiles = [];
  for (let i = 0; i < wordLength; i++) {
    const ch = (letters[i] || "").toUpperCase();
    // Scored rows use their result colours; the active typing row and empty
    // rows stay neutral.
    const state = result ? result[i] : null;
    tiles.push(<Tile key={i} ch={ch} state={state} col={i} />);
  }
  // repeat()'s count must be a literal integer (a CSS var there is invalid and
  // collapses the grid), so set the count inline; the track size is --tile.
  return (
    <div
      className={`row ${isCurrent && shake ? "shake" : ""}`}
      style={{ gridTemplateColumns: `repeat(${wordLength}, var(--tile))` }}
    >
      {tiles}
    </div>
  );
}

/**
 * The player's own full-size board.
 * `guesses` is an array of { letters, result }, `current` is the in-progress row.
 */
export default function Board({
  guesses = [],
  current = "",
  maxGuesses = 6,
  wordLength = 5,
  disabled,
  shake,
}) {
  const rows = [];
  for (let i = 0; i < maxGuesses; i++) {
    if (i < guesses.length) {
      rows.push(
        <Row
          key={i}
          letters={guesses[i].letters || ""}
          result={guesses[i].result}
          wordLength={wordLength}
        />
      );
    } else if (i === guesses.length && !disabled) {
      rows.push(<Row key={i} letters={current} wordLength={wordLength} isCurrent shake={shake} />);
    } else {
      rows.push(<Row key={i} letters="" wordLength={wordLength} />);
    }
  }
  return (
    <div
      className="board"
      style={{ gridTemplateRows: `repeat(${maxGuesses}, var(--tile))` }}
    >
      {rows}
    </div>
  );
}
