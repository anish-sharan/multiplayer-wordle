"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/app/lib/config";

// Fetches and renders the definition of the revealed answer word.
export default function WordMeaning({ word }) {
  const [status, setStatus] = useState("loading"); // loading | ok | none
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!word) return;
    let cancelled = false;
    setStatus("loading");
    setData(null);

    fetch(`${BACKEND_URL}/api/define/${encodeURIComponent(word.toLowerCase())}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d && d.found) {
          setData(d);
          setStatus("ok");
        } else {
          setStatus("none");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("none");
      });

    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) return null;

  return (
    <div className="meaning">
      <div className="meaning-head">
        <span className="meaning-word">{word.toUpperCase()}</span>
        {status === "ok" && data.phonetic ? (
          <span className="meaning-phonetic">{data.phonetic}</span>
        ) : null}
      </div>

      {status === "loading" && <p className="meaning-loading">Looking up definition…</p>}

      {status === "none" && (
        <p className="meaning-loading">No definition found for this word.</p>
      )}

      {status === "ok" && (
        <div className="meaning-list">
          {data.meanings.map((m, i) => (
            <div className="meaning-item" key={i}>
              {m.partOfSpeech && <span className="meaning-pos">{m.partOfSpeech}</span>}
              <span className="meaning-def">{m.definition}</span>
              {m.example && <span className="meaning-example">“{m.example}”</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
