"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for the route segments under the root layout. Must be a
// client component; receives the thrown error and a reset() to retry the render.
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Wordle</h1>
      </header>
      <div className="center-wrap">
        <div className="card error-card">
          <div className="error-emoji">⚠️</div>
          <h2>Something went wrong</h2>
          <p className="subtitle">
            An unexpected error occurred. You can try again, or head back to the
            home screen.
          </p>
          <button className="btn" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn secondary link-btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
