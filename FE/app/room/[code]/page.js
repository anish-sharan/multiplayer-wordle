"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/app/lib/socket";
import Board from "@/app/components/Board";
import Keyboard from "@/app/components/Keyboard";
import OpponentBoard from "@/app/components/OpponentBoard";
import WordMeaning from "@/app/components/WordMeaning";
import HowToPlay from "@/app/components/HowToPlay";
import ThemeToggle from "@/app/components/ThemeToggle";
import Confetti from "@/app/components/Confetti";

function aggregateLetterStates(guesses) {
  const states = {};
  const priority = { absent: 0, present: 1, correct: 2 };
  for (const g of guesses || []) {
    if (!g.letters) continue;
    for (let i = 0; i < g.letters.length; i++) {
      const ch = g.letters[i];
      const next = g.result[i];
      if (!states[ch] || priority[next] > priority[states[ch]]) {
        states[ch] = next;
      }
    }
  }
  return states;
}

export default function Room() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code || "").toString().toUpperCase();

  const [state, setState] = useState(null);
  const [joinError, setJoinError] = useState("");
  const [needName, setNeedName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [current, setCurrent] = useState(""); // local draft (versus mode only)
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState([]); // in-room chat
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);
  const [hints, setHints] = useState({}); // { position: letter } revealed this round
  const [hintsLeft, setHintsLeft] = useState(2);
  const [cooldown, setCooldown] = useState(0); // versus hint penalty (seconds)
  const prevStatusRef = useRef(null);

  const currentRef = useRef("");
  const toastTimer = useRef(null);
  const soloStartedRef = useRef(false);
  const modeSetRef = useRef(false);
  const [soloIntent, setSoloIntent] = useState(null); // word length from ?solo=
  const [modeIntent, setModeIntent] = useState(null); // "coop" | "versus" from ?mode=

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Read the play-style flags the home page put on the URL:
  //   ?solo=<len>          → auto-start a solo game
  //   ?mode=coop|versus    → pre-select the lobby mode for a new room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const solo = params.get("solo");
    if (solo) setSoloIntent(solo);
    const mode = params.get("mode");
    if (mode) setModeIntent(mode);
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  // --- Join the room on mount / reconnect ---
  useEffect(() => {
    const socket = getSocket();

    const onState = (s) => {
      setState(s);
      setJoinError("");
    };
    socket.on("roomState", onState);

    const onChatHistory = (h) => setMessages(Array.isArray(h) ? h : []);
    const onChatMessage = (m) => setMessages((prev) => [...prev, m]);
    socket.on("chatHistory", onChatHistory);
    socket.on("chatMessage", onChatMessage);

    // Co-op hints are broadcast to the whole team.
    const onHint = (h) => {
      if (h?.index == null) return;
      setHints((prev) => ({ ...prev, [h.index]: h.letter }));
      if (typeof h.hintsLeft === "number") setHintsLeft(h.hintsLeft);
    };
    socket.on("hint", onHint);

    function attemptJoin(name) {
      socket.emit("joinRoom", { code, name }, (res) => {
        if (!res?.ok) setJoinError(res?.error || "Could not join room.");
      });
    }

    const storedName = sessionStorage.getItem("playerName");
    if (storedName) attemptJoin(storedName);
    else setNeedName(true);

    const onConnect = () => {
      const n = sessionStorage.getItem("playerName");
      if (n) attemptJoin(n);
    };
    socket.on("connect", onConnect);

    return () => {
      socket.off("roomState", onState);
      socket.off("connect", onConnect);
      socket.off("chatHistory", onChatHistory);
      socket.off("chatMessage", onChatMessage);
      socket.off("hint", onHint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const sendChat = useCallback((text) => {
    getSocket().emit("chatMessage", { text });
  }, []);

  const mode = state?.mode || "coop";
  const wordLength = state?.wordLength || 5;
  const me = state?.players.find((p) => p.isSelf) || null;
  const isHost = state && me && state.hostId === me.id;
  const isPlaying = state?.status === "playing";
  const isCoop = mode === "coop";
  const isSolo = !!state?.solo;

  const canAct = isPlaying && (isCoop || (me && !me.finished));
  const canType = canAct && cooldown === 0;

  // Once joined as host of a fresh solo room, auto-start (skips the lobby).
  useEffect(() => {
    if (!soloIntent || soloStartedRef.current || !state) return;
    if (state.status !== "lobby") return;
    const self = state.players.find((p) => p.isSelf);
    if (!self || state.hostId !== self.id) return;
    soloStartedRef.current = true;
    const len = parseInt(soloIntent, 10);
    getSocket().emit("startSolo", { length: Number.isFinite(len) ? len : 5 });
  }, [soloIntent, state]);

  // For a freshly-created multiplayer room, pre-select the host's chosen mode.
  useEffect(() => {
    if (!modeIntent || modeSetRef.current || !state) return;
    if (state.status !== "lobby") return;
    const self = state.players.find((p) => p.isSelf);
    if (!self || state.hostId !== self.id) return;
    if (modeIntent !== "coop" && modeIntent !== "versus") return;
    modeSetRef.current = true;
    if (state.mode !== modeIntent) getSocket().emit("setMode", { mode: modeIntent });
  }, [modeIntent, state]);

  const submitGuess = useCallback(() => {
    const socket = getSocket();
    if (isCoop) {
      socket.emit("submitGuess", {}, (res) => {
        if (!res?.ok) {
          showToast(res?.error || "Invalid guess");
          triggerShake();
        } else if (res.solved) {
          showToast("Solved! 🎉");
        }
      });
    } else {
      const guess = currentRef.current;
      if (guess.length !== wordLength) {
        showToast("Not enough letters");
        triggerShake();
        return;
      }
      socket.emit("submitGuess", { guess }, (res) => {
        if (!res?.ok) {
          showToast(res?.error || "Invalid guess");
          triggerShake();
        } else {
          setCurrent("");
          if (res.solved) showToast("Splendid! 🎉");
        }
      });
    }
  }, [isCoop, wordLength]);

  const handleKey = useCallback(
    (key) => {
      if (!canType) return;
      const socket = getSocket();
      if (isCoop) {
        // Shared draft lives on the server; send each edit as an operation.
        if (key === "ENTER") submitGuess();
        else if (key === "BACKSPACE") socket.emit("type", { op: "BACKSPACE" });
        else if (/^[A-Z]$/.test(key)) socket.emit("type", { op: key });
      } else {
        if (key === "ENTER") submitGuess();
        else if (key === "BACKSPACE") setCurrent((c) => c.slice(0, -1));
        else if (/^[A-Z]$/.test(key))
          setCurrent((c) => (c.length < wordLength ? c + key : c));
      }
    },
    [canType, isCoop, submitGuess, wordLength]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't hijack keystrokes while typing in the chat box or any field.
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
        return;
      }
      const k = e.key;
      if (k === "Enter") handleKey("ENTER");
      else if (k === "Backspace") handleKey("BACKSPACE");
      else if (/^[a-zA-Z]$/.test(k)) handleKey(k.toUpperCase());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  // Reset the local versus draft on round changes.
  useEffect(() => {
    if (!isCoop && (state?.status === "lobby" || state?.status === "playing")) {
      if (me && me.guesses && me.guesses.length === 0) setCurrent("");
    }
  }, [state?.status, me?.guesses?.length, isCoop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Celebrate once when the local player wins the round.
  useEffect(() => {
    if (state?.status !== "finished") {
      confettiFiredRef.current = false;
      return;
    }
    if (confettiFiredRef.current) return;
    const self = state.players.find((p) => p.isSelf);
    const won = state.solo
      ? !!self?.solved
      : state.mode === "coop"
      ? state.outcome === "won"
      : state.winnerId === self?.id;
    if (!won) return;
    confettiFiredRef.current = true;
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 3500);
    return () => clearTimeout(t);
  }, [state]);

  // Reset hints at the start of each new round.
  useEffect(() => {
    const s = state?.status;
    if (s === "playing" && prevStatusRef.current !== "playing") {
      setHints({});
      setHintsLeft(state?.maxHints ?? 2);
      setCooldown(0);
    }
    prevStatusRef.current = s;
  }, [state?.status, state?.maxHints]);

  // Tick down the versus hint-penalty cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestHint = useCallback(() => {
    getSocket().emit("hint", {}, (res) => {
      if (!res?.ok) {
        showToast(res?.error || "No hint available");
        return;
      }
      if (res.index != null) {
        // versus / solo (private reveal); co-op arrives via the "hint" event
        setHints((prev) => ({ ...prev, [res.index]: res.letter }));
        if (typeof res.hintsLeft === "number") setHintsLeft(res.hintsLeft);
        showToast(`💡 Letter ${res.index + 1} is ${res.letter}`);
        if (res.cooldownMs) setCooldown(Math.round(res.cooldownMs / 1000));
      }
    });
  }, []);

  function copyInvite() {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function submitName() {
    const clean = nameInput.trim().slice(0, 20) || "Player";
    sessionStorage.setItem("playerName", clean);
    setNeedName(false);
    getSocket().emit("joinRoom", { code, name: clean }, (res) => {
      if (!res?.ok) setJoinError(res?.error || "Could not join room.");
    });
  }

  // --- Name prompt ---
  if (needName) {
    return (
      <Shell>
        <div className="card">
          <h2>Joining room {code}</h2>
          <div>
            <label htmlFor="n">Your name</label>
            <input
              id="n"
              className="field"
              autoFocus
              placeholder="e.g. Alex"
              value={nameInput}
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitName()}
            />
          </div>
          <button className="btn" onClick={submitName}>
            Enter room
          </button>
        </div>
      </Shell>
    );
  }

  if (joinError) {
    return (
      <Shell>
        <div className="card">
          <h2>Oops</h2>
          <p className="subtitle">{joinError}</p>
          <button className="btn" onClick={() => router.push("/")}>
            Back to home
          </button>
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="card">
          <h2>Connecting…</h2>
          <p className="subtitle">Joining room {code}.</p>
        </div>
      </Shell>
    );
  }

  // --- Solo: skip the lobby entirely while the round is being set up ---
  if (state.status === "lobby" && (isSolo || soloIntent)) {
    return (
      <Shell>
        <div className="card">
          <h2>Starting…</h2>
          <p className="subtitle">Setting up your solo game.</p>
        </div>
      </Shell>
    );
  }

  // --- Lobby ---
  if (state.status === "lobby") {
    return (
      <div className="page">
        <Header onLeave={() => router.push("/")} />
        <div className="center-wrap">
          <div className="card">
            <h2>Waiting room</h2>
            <p className="subtitle">Share this code so friends can join:</p>
            <div className="code-display">{code}</div>
            <button className="btn ghost" onClick={copyInvite}>
              {copied ? "Link copied!" : "Copy invite link"}
            </button>

            <div>
              <label>Game mode</label>
              <div className="mode-toggle">
                {[
                  { key: "coop", title: "Co-op", desc: "One shared board — solve together" },
                  { key: "versus", title: "Versus", desc: "Own boards — race to solve first" },
                ].map((m) => (
                  <button
                    key={m.key}
                    className={`mode-btn ${mode === m.key ? "active" : ""}`}
                    disabled={!isHost}
                    onClick={() => isHost && getSocket().emit("setMode", { mode: m.key })}
                  >
                    <span className="mode-title">{m.title}</span>
                    <span className="mode-desc">{m.desc}</span>
                  </button>
                ))}
              </div>
              {!isHost && <p className="help-text">Only the host can change the mode.</p>}
            </div>

            <div>
              <label>Word length</label>
              <div className="length-toggle">
                {[4, 5, 6].map((n) => (
                  <button
                    key={n}
                    className={`length-btn ${wordLength === n ? "active" : ""}`}
                    disabled={!isHost}
                    onClick={() => isHost && getSocket().emit("setWordLength", { length: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="help-text">
                {wordLength} letters · {state.maxGuesses} guesses
              </p>
            </div>

            <div>
              <label>Players ({state.players.length})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {state.players.map((p) => (
                  <div className="player-row" key={p.id}>
                    <span className={`dot ${p.connected ? "online" : ""}`} />
                    <span className="name">
                      {p.name}
                      {p.isSelf ? " (you)" : ""}
                    </span>
                    {p.isHost && <span className="badge host">Host</span>}
                  </div>
                ))}
              </div>
            </div>

            {isHost ? (
              <button className="btn" onClick={() => getSocket().emit("startGame")}>
                Start game
              </button>
            ) : (
              <p className="help-text" style={{ textAlign: "center" }}>
                Waiting for the host to start the game…
              </p>
            )}

            <Chat messages={messages} onSend={sendChat} meId={me?.id} />
          </div>
        </div>
      </div>
    );
  }

  // --- Playing / finished ---
  const finished = state.status === "finished";
  const opponents = isCoop ? [] : state.players.filter((p) => !p.isSelf);

  const boardGuesses = isCoop ? state.guesses : me ? me.guesses : [];
  const boardCurrent = isCoop ? state.draft || "" : current;
  const boardDisabled = isCoop ? !isPlaying : !me || me.finished || !isPlaying;
  const letterStates = aggregateLetterStates(boardGuesses);

  const guessesUsed = boardGuesses.length;
  const guessesLeft = state.maxGuesses - guessesUsed;

  return (
    <div className="page">
      <Header onLeave={() => router.push("/")} roomCode={code} mode={mode} solo={isSolo} />
      {toast && <div className="toast">{toast}</div>}
      {showConfetti && <Confetti />}

      <div className="game-layout">
        <div
          className="main-col"
          style={{ "--cols": wordLength, "--rows": state.maxGuesses }}
        >
          {isCoop && isPlaying && (
            <div className="status-line">
              <span>
                {guessesLeft} {guessesLeft === 1 ? "guess" : "guesses"} left — solve it together
              </span>
              {/* Always render the row so the board doesn't jump as the
                  indicator toggles on each keystroke; just hide it when idle. */}
              <span
                className="typing-indicator"
                style={{ visibility: state.draft && state.typingBy ? "visible" : "hidden" }}
              >
                ✏️ {state.typingBy || " "} is typing…
              </span>
            </div>
          )}
          {isSolo && isPlaying && (
            <div className="status-line">
              <span>
                {guessesLeft} {guessesLeft === 1 ? "guess" : "guesses"} left
              </span>
            </div>
          )}
          <Board
            guesses={boardGuesses}
            current={boardCurrent}
            maxGuesses={state.maxGuesses}
            wordLength={wordLength}
            disabled={boardDisabled}
            shake={shake}
          />
          {Object.keys(hints).length > 0 && (
            <div className="hint-strip" aria-label="Revealed hint letters">
              <span className="hint-strip-icon">💡</span>
              {Array.from({ length: wordLength }).map((_, i) => (
                <span key={i} className={`hint-slot ${hints[i] ? "filled" : ""}`}>
                  {hints[i] || ""}
                </span>
              ))}
            </div>
          )}
          <Keyboard onKey={handleKey} letterStates={letterStates} disabled={!canType} />
          {canAct && (
            <button
              className="btn ghost hint-btn"
              onClick={requestHint}
              disabled={hintsLeft <= 0 || cooldown > 0}
            >
              {cooldown > 0
                ? `⏳ ${cooldown}s penalty…`
                : hintsLeft > 0
                ? `💡 Hint (${hintsLeft} left)`
                : "💡 No hints left"}
            </button>
          )}
        </div>

        {!isSolo && (
          <div className="side-col">
            {isCoop ? (
              <CoopSidebar state={state} />
            ) : (
              <>
                <div className="side-title">Opponents ({opponents.length})</div>
                {opponents.length === 0 ? (
                  <p className="help-text">No one else here yet. Share the code {code}.</p>
                ) : (
                  <div className="opp-list">
                    {opponents.map((p) => (
                      <OpponentBoard
                        key={p.id}
                        player={p}
                        maxGuesses={state.maxGuesses}
                        wordLength={wordLength}
                        isWinner={state.winnerId === p.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            <Chat messages={messages} onSend={sendChat} meId={me?.id} />
          </div>
        )}
      </div>

      {finished &&
        (isSolo ? (
          <SoloResults
            state={state}
            onPlayAgain={() => getSocket().emit("startGame")}
            onLeave={() => router.push("/")}
          />
        ) : isCoop ? (
          <CoopResults
            state={state}
            isHost={isHost}
            onPlayAgain={() => getSocket().emit("playAgain")}
            onLeave={() => router.push("/")}
          />
        ) : (
          <VersusResults
            state={state}
            isHost={isHost}
            onPlayAgain={() => getSocket().emit("playAgain")}
            onLeave={() => router.push("/")}
          />
        ))}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="page">
      <Header />
      <div className="center-wrap">{children}</div>
    </div>
  );
}

function Chat({ messages, onSend, meId }) {
  const [text, setText] = useState("");
  const logRef = useRef(null);

  // Keep the log pinned to the newest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="chat">
      <div className="side-title" style={{ marginBottom: 8 }}>
        Chat
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <p className="help-text">No messages yet. Say hi! 👋</p>
        ) : (
          messages.map((m) => {
            const own = m.senderId === meId;
            return (
              <div className={`chat-msg ${own ? "own" : ""}`} key={m.id}>
                {!own && <span className="chat-name">{m.name}</span>}
                <span className="chat-bubble">{m.text}</span>
              </div>
            );
          })
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          className="field chat-input"
          value={text}
          maxLength={300}
          placeholder="Message…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}

function Header({ onLeave, roomCode, mode, solo }) {
  return (
    <header className="topbar">
      <h1>Wordle</h1>
      <div className="topbar-right">
        {solo ? (
          <span className="help-text">Solo</span>
        ) : (
          roomCode && (
            <span className="help-text">
              {mode === "versus" ? "Versus" : "Co-op"} · Room {roomCode}
            </span>
          )
        )}
        <ThemeToggle />
        <HowToPlay />
        {onLeave && (
          <button className="btn ghost" style={{ padding: "8px 12px" }} onClick={onLeave}>
            Leave
          </button>
        )}
      </div>
    </header>
  );
}

function CoopSidebar({ state }) {
  return (
    <>
      <div className="side-title">Players ({state.players.length})</div>
      <div className="player-list-compact">
        {state.players.map((p) => (
          <div className="player-chip" key={p.id}>
            <span className={`dot ${p.connected ? "online" : ""}`} />
            {p.name}
            {p.isSelf ? " (you)" : ""}
            {p.isHost && <span className="badge host">Host</span>}
            <span className="help-text" style={{ marginLeft: "auto" }}>
              {p.chars} letters
            </span>
          </div>
        ))}
      </div>

      <div className="side-title" style={{ marginTop: 18 }}>
        Guesses
      </div>
      {state.guesses.length === 0 ? (
        <p className="help-text">No guesses yet. Anyone can type and submit.</p>
      ) : (
        <div className="guess-log">
          {state.guesses.map((g, i) => (
            <div className="log-row" key={i}>
              <span className="log-word">{g.letters}</span>
              <span className="log-by">{g.by}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SoloResults({ state, onPlayAgain, onLeave }) {
  const me = state.players.find((p) => p.isSelf) || null;
  const solved = !!me?.solved;
  const attempts = me?.guesses?.length || 0;
  const wins = me?.score || 0;
  return (
    <div className="overlay">
      <div className="card">
        <h2>{solved ? "You got it! 🎉" : "Out of guesses 💀"}</h2>
        <p className="answer-reveal">
          The word was <strong>{state.answer}</strong>
        </p>
        {solved && (
          <p className="subtitle" style={{ textAlign: "center" }}>
            Solved in {attempts}/{state.maxGuesses} guesses.
          </p>
        )}
        {wins > 0 && (
          <p className="subtitle" style={{ textAlign: "center" }}>
            🏆 {wins} solved this session.
          </p>
        )}
        <WordMeaning word={state.answer} />
        <div className="row-gap">
          <button className="btn" onClick={onPlayAgain}>
            New word
          </button>
          <button className="btn ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function CoopResults({ state, isHost, onPlayAgain, onLeave }) {
  const won = state.outcome === "won";
  const mvp = state.players.find((p) => p.id === state.mvpId) || null;
  const ordered = [...state.players].sort((a, b) => b.chars - a.chars);
  return (
    <div className="overlay">
      <div className="card">
        <h2>{won ? "You solved it together! 🎉" : "Out of guesses 💀"}</h2>
        <p className="answer-reveal">
          The word was <strong>{state.answer}</strong>
        </p>
        {won && (
          <p className="subtitle" style={{ textAlign: "center" }}>
            Cracked in {state.guesses.length}/{state.maxGuesses} guesses.
          </p>
        )}
        {mvp && (
          <p className="subtitle" style={{ textAlign: "center" }}>
            🏆 {mvp.name}
            {mvp.isSelf ? " (you)" : ""} put in the most letters and takes the round!
          </p>
        )}
        <div className="results-list">
          {ordered.map((p) => (
            <div className="result-row" key={p.id}>
              <span className="result-rank">{p.id === state.mvpId ? "🥇" : "—"}</span>
              <span className="name" style={{ flex: 1, fontWeight: 600 }}>
                {p.name}
                {p.isSelf ? " (you)" : ""}
              </span>
              <span className="help-text">
                {p.chars} {p.chars === 1 ? "letter" : "letters"} · {p.score}{" "}
                {p.score === 1 ? "win" : "wins"}
              </span>
            </div>
          ))}
        </div>
        <WordMeaning word={state.answer} />
        <FinishButtons isHost={isHost} onPlayAgain={onPlayAgain} onLeave={onLeave} />
      </div>
    </div>
  );
}

function VersusResults({ state, isHost, onPlayAgain, onLeave }) {
  const ordered = [...state.players].sort((a, b) => {
    if (a.solved && b.solved) return a.rank - b.rank;
    if (a.solved) return -1;
    if (b.solved) return 1;
    return b.attempts - a.attempts;
  });
  const winner = state.players.find((p) => p.id === state.winnerId);

  return (
    <div className="overlay">
      <div className="card">
        <h2>{winner ? `${winner.name} wins! 🏆` : "Round over"}</h2>
        <p className="answer-reveal">
          The word was <strong>{state.answer}</strong>
        </p>
        <div className="results-list">
          {ordered.map((p) => (
            <div className="result-row" key={p.id}>
              <span className="result-rank">
                {p.solved
                  ? p.rank === 1
                    ? "🥇"
                    : p.rank === 2
                    ? "🥈"
                    : p.rank === 3
                    ? "🥉"
                    : p.rank
                  : "—"}
              </span>
              <span className="name" style={{ flex: 1, fontWeight: 600 }}>
                {p.name}
                {p.isSelf ? " (you)" : ""}
              </span>
              <span className="help-text">
                {p.solved ? `${p.attempts}/${state.maxGuesses}` : "Did not solve"} ·{" "}
                {p.score} {p.score === 1 ? "win" : "wins"}
              </span>
            </div>
          ))}
        </div>
        <WordMeaning word={state.answer} />
        <FinishButtons isHost={isHost} onPlayAgain={onPlayAgain} onLeave={onLeave} />
      </div>
    </div>
  );
}

function FinishButtons({ isHost, onPlayAgain, onLeave }) {
  return (
    <div className="row-gap">
      {isHost ? (
        <button className="btn" onClick={onPlayAgain}>
          Play again
        </button>
      ) : (
        <p
          className="help-text"
          style={{ flex: 1, textAlign: "center", alignSelf: "center" }}
        >
          Waiting for host to start a new round…
        </p>
      )}
      <button className="btn ghost" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
