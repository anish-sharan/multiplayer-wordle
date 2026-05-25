---
title: Multiplayer Wordle API
emoji: 🎯
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Multiplayer Wordle — Backend

FastAPI + Socket.IO realtime server for Multiplayer Wordle, deployed as a Docker
Space on Hugging Face. Socket.IO handles gameplay at `/socket.io/`; FastAPI serves
`/health` and the dictionary-definition proxy at `/api/define/{word}`.

The frontend (Next.js on Vercel) connects here via `NEXT_PUBLIC_BACKEND_URL`.

## Configuration

- `CLIENT_ORIGIN` — allowed browser origin(s) for CORS, i.e. your Vercel URL.
  Set it under **Settings → Variables and secrets**. Defaults to `*` if unset.
