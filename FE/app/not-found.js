import Link from "next/link";

// Shown for unmatched routes (and anywhere notFound() is called).
export default function NotFound() {
  return (
    <div className="page">
      <header className="topbar">
        <h1>Wordle</h1>
      </header>
      <div className="center-wrap">
        <div className="card error-card">
          <div className="error-emoji">🧩</div>
          <h2>Page not found</h2>
          <p className="subtitle">
            We couldn&rsquo;t find that page. If you were joining a game,
            double-check the room code — rooms also close once everyone leaves.
          </p>
          <Link href="/" className="btn link-btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
