"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/app/lib/socket";
import HowToPlay from "@/app/components/HowToPlay";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [soloLen, setSoloLen] = useState(5);
  // null = chooser modal open; "solo" | "coop" | "versus" | "join" = chosen path
  const [playStyle, setPlayStyle] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("playerName");
    if (saved) setName(saved);
  }, []);

  function persistName() {
    const clean = name.trim().slice(0, 20) || "Player";
    sessionStorage.setItem("playerName", clean);
    return clean;
  }

  // Create a room, then navigate. Times out with an error if the backend
  // can't be reached (e.g. wrong host / backend not running), so the button
  // never hangs silently.
  function createAndGo(toUrl) {
    setBusy(true);
    setError("");
    const socket = getSocket();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      setBusy(false);
      setError(
        "Couldn't reach the game server. Make sure the backend is running and reachable from this device."
      );
    }, 7000);
    socket.emit("createRoom", (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (res?.code) router.push(toUrl(res.code));
      else {
        setBusy(false);
        setError("Couldn't create a room. Please try again.");
      }
    });
  }

  function playSolo() {
    // Solo doesn't need a name or a shared code — default to "You".
    const clean = name.trim().slice(0, 20) || "You";
    sessionStorage.setItem("playerName", clean);
    createAndGo((code) => `/room/${code}?solo=${soloLen}`);
  }

  function createRoom(mode) {
    if (!name.trim()) {
      setError("Please enter your name first.");
      return;
    }
    persistName();
    createAndGo((code) => `/room/${code}?mode=${mode}`);
  }

  function joinRoom(e) {
    e?.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name first.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError("Room codes are 4 characters long.");
      return;
    }
    persistName();
    router.push(`/room/${code}`);
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Wordle</h1>
        <div className="topbar-right">
          <ThemeToggle />
          <HowToPlay />
        </div>
      </header>

      <div className="center-wrap">
        <div className="card">
          <div>
            <h2>Wordle</h2>
            <p className="subtitle">
              Play <strong>solo</strong>, <strong>together</strong> on one shared
              board, or <strong>against each other</strong> on the same word.
            </p>
          </div>

          {playStyle && (
            <>
              <div>
                <label htmlFor="name">
                  Your name{playStyle === "solo" ? " (optional)" : ""}
                </label>
                <input
                  id="name"
                  className="field"
                  placeholder="e.g. Alex"
                  value={name}
                  maxLength={20}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                />
              </div>

              {playStyle === "solo" && (
                <div>
                  <label>Word length</label>
                  <div className="length-toggle" style={{ marginBottom: 12 }}>
                    {[4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`length-btn ${soloLen === n ? "active" : ""}`}
                        onClick={() => setSoloLen(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button className="btn" onClick={playSolo} disabled={busy}>
                    {busy ? "Starting…" : `Play solo · ${soloLen} letters`}
                  </button>
                </div>
              )}

              {playStyle === "coop" && (
                <button className="btn" onClick={() => createRoom("coop")} disabled={busy}>
                  {busy ? "Creating…" : "Create co-op room"}
                </button>
              )}

              {playStyle === "versus" && (
                <button className="btn" onClick={() => createRoom("versus")} disabled={busy}>
                  {busy ? "Creating…" : "Create versus room"}
                </button>
              )}

              {playStyle === "join" && (
                <form onSubmit={joinRoom} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label htmlFor="code">Room code</label>
                    <input
                      id="code"
                      className="field code-field"
                      placeholder="ABCD"
                      value={joinCode}
                      maxLength={4}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        setError("");
                      }}
                    />
                  </div>
                  <button type="submit" className="btn">
                    Join room
                  </button>
                </form>
              )}

              <button
                className="btn ghost"
                onClick={() => {
                  setPlayStyle(null);
                  setError("");
                }}
              >
                ← Change play style
              </button>

              <p className="error-text">{error}</p>
            </>
          )}
        </div>
      </div>

      {playStyle === null && (
        <PlayStyleModal onPick={setPlayStyle} />
      )}
    </div>
  );
}

function PlayStyleModal({ onPick }) {
  const options = [
    { key: "solo", title: "🧩 Solo", desc: "Play on your own." },
    { key: "coop", title: "🤝 Together", desc: "Share one board with friends (co-op)." },
    { key: "versus", title: "⚔️ Against each other", desc: "Race friends to the same word (versus)." },
  ];
  return (
    <div className="overlay">
      <div className="card chooser-card">
        <h2>How do you want to play?</h2>
        <div className="chooser-list">
          {options.map((o) => (
            <button key={o.key} className="mode-btn" onClick={() => onPick(o.key)}>
              <span className="mode-title">{o.title}</span>
              <span className="mode-desc">{o.desc}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={() => onPick("join")}>
          Have a code? Join a room
        </button>
      </div>
    </div>
  );
}
