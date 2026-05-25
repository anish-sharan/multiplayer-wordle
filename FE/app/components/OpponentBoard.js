"use client";

// Compact, letter-free view of another player's progress.
export default function OpponentBoard({ player, maxGuesses = 6, wordLength = 5, isWinner }) {
  const rows = [];
  for (let i = 0; i < maxGuesses; i++) {
    const g = player.guesses[i];
    const tiles = [];
    for (let j = 0; j < wordLength; j++) {
      const state = g ? g.result[j] : "";
      tiles.push(<div key={j} className={`mini-tile ${state}`} />);
    }
    rows.push(
      <div
        className="mini-row"
        key={i}
        style={{ gridTemplateColumns: `repeat(${wordLength}, 1fr)` }}
      >
        {tiles}
      </div>
    );
  }

  let badge = null;
  if (isWinner) badge = <span className="badge win">Winner</span>;
  else if (player.solved) badge = <span className="badge solved">Solved</span>;
  else if (player.finished) badge = <span className="badge out">Out</span>;
  else if (player.isHost) badge = <span className="badge host">Host</span>;

  return (
    <div className="opp">
      <div className="opp-head">
        <div className="opp-name">
          <span className={`dot ${player.connected ? "online" : ""}`} />
          {player.name}
        </div>
        {badge}
      </div>
      <div className="mini-board">{rows}</div>
    </div>
  );
}
