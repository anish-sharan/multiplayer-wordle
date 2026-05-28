# Multiplayer Wordle

**Play:** https://multiplayer-wordle-pied.vercel.app/
**Backend Space:** https://huggingface.co/spaces/Nadan11111/wordle

Real-time multiplayer Wordle with a **Next.js frontend** and a **FastAPI backend**,
split into two folders:

```
FE/   Next.js (App Router) frontend          → deploy to Vercel
BE/   FastAPI + python-socketio backend       → deploy to Hugging Face Spaces
```

Two game modes the host picks in the lobby:

- 🤝 **Co-op** — the whole room shares **one board**. Anyone can type into the
  shared row and submit; you see teammates' letters appear live and have 6
  guesses to crack one word together.
- ⚔️ **Versus** — everyone gets their own board with the **same word** and races
  to solve it first. Opponents' tile colours stream in live (letters hidden),
  and rankings are shown at the end.

After each round the answer is revealed along with its **dictionary definition**.

## Architecture

> For a full architecture diagram and a feature-by-feature walkthrough (rooms,
> co-op/versus play, scoring, definitions, reconnect), see
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

- The backend uses **python-socketio**, which is wire-compatible with the
  browser's `socket.io-client`, so realtime gameplay (rooms, acks, live updates)
  works over WebSockets.
- The frontend talks to the backend via `NEXT_PUBLIC_BACKEND_URL` for both the
  Socket.IO connection and the `/api/define/<word>` definition lookups.
- Game state is held in memory on the backend (the `rooms` dict in
  `BE/game.py`).

## Run locally

You'll run the two pieces in separate terminals.

**1. Backend (FastAPI) — port 8000**

```bash
cd BE
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Frontend (Next.js) — port 3000**

```bash
cd FE
npm install
npm run dev
```

Open http://localhost:3000. The frontend defaults to `http://localhost:8000`
for the backend, so no env file is needed locally. Enter a name, **Create a
room**, pick a mode, and share the code. Open a second browser tab to test
multiplayer.

## Deployment (Vercel + Hugging Face Spaces)

Vercel is serverless and can't run a persistent WebSocket server, so the
FastAPI backend runs on Hugging Face Spaces (Docker SDK) and the Next.js
frontend on Vercel.

### 1. Backend → Hugging Face Spaces

Create a new **Space** with the **Docker** SDK and push the contents of `BE/`
to it (the included `BE/Dockerfile` already exposes port `7860`, which is what
Spaces routes to by default).

| Setting | Value |
| --- | --- |
| SDK | Docker |
| Hardware | CPU basic is enough |
| App port | `7860` (set by `Dockerfile`) |
| Visibility | Public |

Easiest sync flow: add the Space as a remote to a Git checkout of `BE/` and
push, e.g.

```bash
cd BE
git init && git add . && git commit -m "Initial backend"
git remote add space https://huggingface.co/spaces/Nadan11111/wordle
git push space main
```

In the Space's **Settings → Variables and secrets**, add:

```
CLIENT_ORIGIN = https://multiplayer-wordle-pied.vercel.app
```

The Space URL looks like `https://<user>-<space-name>.hf.space`. For this
deployment that's `https://nadan11111-wordle.hf.space` — use that as the
backend URL for the frontend.

### 2. Frontend → Vercel

Import the repo into Vercel and set the **Root Directory** to `FE`
(it auto-detects Next.js). Add one environment variable:

```
NEXT_PUBLIC_BACKEND_URL = https://nadan11111-wordle.hf.space
```

Redeploy so it's baked into the client build, then point the Space's
`CLIENT_ORIGIN` at your final Vercel URL.

> **Hugging Face Spaces free tier:** the Space sleeps after ~48h of inactivity
> (and within shorter windows depending on traffic), so the first connection
> and first definition lookup after idle can take ~30–60s to wake.
> In-memory game state resets whenever the Space rebuilds or sleeps. An uptime
> pinger on `/health` keeps it warm.
>
> **Vercel:** the Hobby tier is for non-commercial use — check the plan terms
> if this is a commercial project.

## Project structure

```
FE/
  app/page.js               Home: name entry, create/join room
  app/room/[code]/page.js   Game room (lobby, co-op + versus play, results)
  app/components/           Board, Keyboard, OpponentBoard, WordMeaning
  app/lib/socket.js         Shared Socket.IO client
  app/lib/config.js         Reads NEXT_PUBLIC_BACKEND_URL

BE/
  main.py                   FastAPI app + Socket.IO mount + /api/define proxy
  game.py                   Game logic (co-op + versus) + in-memory rooms
  words.py                  Word list + Wordle scoring (duplicate-letter safe)
  Dockerfile                Container image (used by Hugging Face Spaces)
  requirements.txt

render.yaml                 Optional Render Blueprint (alternative host)
```

## Notes

- Game state is in memory, so rooms reset if the backend restarts. Swap the
  `rooms` dict in `BE/game.py` for Redis to persist or scale across instances.
- The accepted-guess dictionary is the curated list in `BE/words.py`. Add more
  words there to broaden what players can guess.
- Definitions come from the free [dictionaryapi.dev](https://dictionaryapi.dev)
  and are cached in memory per word.
