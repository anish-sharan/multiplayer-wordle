"use client";

import "./globals.css";
import { useEffect } from "react";

// Catches errors thrown in the root layout itself. It replaces the layout, so
// it must render its own <html>/<body>. Defaults to the dark theme since the
// layout's theme script didn't run.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body>
        <div className="page">
          <header className="topbar">
            <h1>Wordle</h1>
          </header>
          <div className="center-wrap">
            <div className="card error-card">
              <div className="error-emoji">⚠️</div>
              <h2>Something went wrong</h2>
              <p className="subtitle">
                A critical error occurred. Please try again or reload the page.
              </p>
              <button className="btn" onClick={() => reset()}>
                Try again
              </button>
              <a href="/" className="btn secondary link-btn">
                Back to home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
