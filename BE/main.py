"""FastAPI + Socket.IO backend for Multiplayer Wordle.

- Socket.IO (python-socketio) handles realtime gameplay at /socket.io/.
- FastAPI serves HTTP: a health check and the dictionary-definition proxy.

Run locally:   uvicorn main:app --reload --port 8000
Run on Render: uvicorn main:app --host 0.0.0.0 --port $PORT
"""
import asyncio
import os
from contextlib import asynccontextmanager

import httpx
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from game import cleanup_loop, register_handlers

# Allowed browser origin(s) for CORS — your Vercel URL(s). "*" by default.
_origin_env = os.environ.get("CLIENT_ORIGIN", "*").strip()
_allowed = "*" if _origin_env == "*" else [o.strip() for o in _origin_env.split(",") if o.strip()]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=_allowed)
register_handlers(sio)

@asynccontextmanager
async def lifespan(app):
    # Background sweep that deletes rooms (and their chat) after ~1 day idle.
    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()


api = FastAPI(title="Multiplayer Wordle API", lifespan=lifespan)
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allowed == "*" else _allowed,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory cache so each word is only looked up once.
_definition_cache = {}


@api.get("/")
@api.get("/health")
async def health():
    return {"status": "ok", "service": "wordle-realtime"}


@api.get("/api/define/{word}")
async def define(word: str):
    """Proxy + shape the free Dictionary API (dictionaryapi.dev)."""
    clean = "".join(c for c in (word or "").lower() if c.isalpha())
    if not clean:
        return {"found": False}
    if clean in _definition_cache:
        return _definition_cache[clean]

    result = {"found": False, "word": clean}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean}"
            )
        if resp.status_code == 200:
            data = resp.json()
            first = data[0] if isinstance(data, list) and data else None
            if first:
                phonetic = first.get("phonetic") or ""
                if not phonetic:
                    for p in first.get("phonetics", []) or []:
                        if p.get("text"):
                            phonetic = p["text"]
                            break
                meanings = []
                for m in (first.get("meanings") or [])[:3]:
                    defs = m.get("definitions") or []
                    if defs and defs[0].get("definition"):
                        meanings.append({
                            "partOfSpeech": m.get("partOfSpeech") or "",
                            "definition": defs[0]["definition"],
                            "example": defs[0].get("example") or "",
                        })
                if meanings:
                    result = {
                        "found": True,
                        "word": first.get("word") or clean,
                        "phonetic": phonetic,
                        "meanings": meanings,
                    }
    except Exception:
        pass

    if result["found"]:
        _definition_cache[clean] = result
    return result


# ASGI entrypoint: Socket.IO owns /socket.io/, FastAPI handles everything else.
app = socketio.ASGIApp(sio, other_asgi_app=api)
