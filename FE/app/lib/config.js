// Base URL of the FastAPI backend (Socket.IO + definition API).
//
// Priority:
//   1. NEXT_PUBLIC_BACKEND_URL  (set this on Vercel to the Render URL,
//      e.g. https://your-wordle-api.onrender.com)
//   2. Same host the page was loaded from, on port 8000. This makes it work
//      both on http://localhost:3000 (desktop) and on a LAN IP like
//      http://192.168.1.6:3000 (phone on the same Wi-Fi) with no config —
//      as long as the backend runs on the same machine, port 8000.
//   3. http://localhost:8000 fallback (server-side render only).
function resolveBackendUrl() {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

export const BACKEND_URL = resolveBackendUrl();
