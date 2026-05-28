"""Multiplayer Wordle game logic for the FastAPI / python-socketio backend.

Two modes, chosen per room by the host:
  - "coop":   one shared board. Anyone types into the shared row and submits.
              The whole team has 6 guesses to crack one word together.
  - "versus": every player gets their own board with the SAME word and races to
              solve it first. Opponents see colours, not letters.
"""
import asyncio
import random
import time

from moderation import allow_chat, clean_chat, clean_name
from words import (
    DEFAULT_LENGTH,
    SUPPORTED_LENGTHS,
    get_random_word,
    is_valid_word,
    score_guess,
)

MAX_GUESSES = 6
MAX_PLAYERS = 5                     # per room
ROOM_TTL_MS = 24 * 60 * 60 * 1000   # rooms (and their chat) expire after 1 day
HINT_MAX = 2                        # hints per round
HINT_COOLDOWN_MS = 5000             # versus-only penalty per hint

rooms = {}      # code -> room dict
sid_room = {}   # socket id -> room code

_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # omit easily-confused chars


def _now_ms():
    return int(time.time() * 1000)


def generate_code():
    while True:
        code = "".join(random.choice(_CODE_CHARS) for _ in range(4))
        if code not in rooms:
            return code


def purge_expired_rooms():
    """Drop rooms (and all their data) inactive for more than ROOM_TTL_MS."""
    now = _now_ms()
    expired = [
        code for code, r in list(rooms.items())
        if now - r.get("lastActivity", now) > ROOM_TTL_MS
    ]
    for code in expired:
        room = rooms.pop(code, None)
        if room:
            for p in room["players"]:
                sid_room.pop(p["id"], None)
    return len(expired)


async def cleanup_loop(interval_seconds=1800):
    """Background sweep (every 30 min) that purges expired rooms."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            purge_expired_rooms()
        except Exception:
            pass


def new_room(code):
    now = _now_ms()
    return {
        "code": code,
        "createdAt": now,
        "lastActivity": now,
        "status": "lobby",   # "lobby" | "playing" | "finished"
        "mode": "coop",      # "coop" | "versus"
        "wordLength": DEFAULT_LENGTH,  # 4 | 5 | 6, host-chosen in the lobby
        "solo": False,       # single-player room (a 1-player versus game)
        "hostId": None,
        "word": None,
        # coop state
        "guesses": [],       # shared: [{letters, result, by}]
        "draft": "",         # shared in-progress row
        "draftAuthors": [],  # parallel to draft: sid who typed each char
        "typingBy": None,
        "outcome": None,     # "won" | "lost"
        "mvpId": None,       # coop round winner (most letters contributed)
        # versus state
        "winnerId": None,
        "solveCount": 0,
        "players": [],
        "hintsUsed": 0,      # coop: shared hint count this round
        # in-room chat, capped to the most recent messages
        "chat": [],
    }


def new_player(sid, name):
    return {
        "id": sid,
        "name": name,
        "connected": True,
        "isHost": False,
        "score": 0,      # cumulative wins across rounds (kept on Play Again)
        # per-player board (versus mode)
        "guesses": [],
        "solved": False,
        "finished": False,
        "rank": None,
        # coop contribution this round
        "chars": 0,
        "hints": 0,      # hints used this round (versus / solo)
        # chat rate-limit window (ms timestamps)
        "chatTimes": [],
    }


def reset_round(room):
    """Reset per-round state for a new game. Cumulative `score` is preserved."""
    room["word"] = get_random_word(room["wordLength"])
    room["status"] = "playing"
    room["guesses"] = []
    room["draft"] = ""
    room["draftAuthors"] = []
    room["typingBy"] = None
    room["outcome"] = None
    room["mvpId"] = None
    room["winnerId"] = None
    room["solveCount"] = 0
    room["hintsUsed"] = 0
    for p in room["players"]:
        p["guesses"] = []
        p["solved"] = False
        p["finished"] = False
        p["rank"] = None
        p["chars"] = 0
        p["hints"] = 0


def refresh_host_flags(room):
    for p in room["players"]:
        p["isHost"] = p["id"] == room["hostId"]


def _versus_view_player(p, viewer_id, reveal_all):
    is_self = p["id"] == viewer_id
    show = is_self or reveal_all
    return {
        "id": p["id"],
        "name": p["name"],
        "connected": p["connected"],
        "isHost": p["isHost"],
        "isSelf": is_self,
        "score": p["score"],
        "solved": p["solved"],
        "finished": p["finished"],
        "rank": p["rank"],
        "attempts": len(p["guesses"]),
        "guesses": [
            {"letters": g["letters"] if show else None, "result": g["result"]}
            for g in p["guesses"]
        ],
    }


def build_state(room, viewer_id):
    revealed = room["status"] == "finished"
    base = {
        "code": room["code"],
        "status": room["status"],
        "mode": room["mode"],
        "wordLength": room["wordLength"],
        "solo": room["solo"],
        "maxGuesses": MAX_GUESSES,
        "maxHints": HINT_MAX,
        "hostId": room["hostId"],
        "answer": room["word"] if revealed else None,
    }
    if room["mode"] == "coop":
        base.update({
            "guesses": room["guesses"],
            "draft": room["draft"],
            "typingBy": room["typingBy"],
            "outcome": room["outcome"],
            "mvpId": room["mvpId"],
            "players": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "connected": p["connected"],
                    "isHost": p["isHost"],
                    "isSelf": p["id"] == viewer_id,
                    "score": p["score"],
                    "chars": p["chars"],
                }
                for p in room["players"]
            ],
        })
        return base

    base.update({
        "winnerId": room["winnerId"],
        "players": [_versus_view_player(p, viewer_id, revealed) for p in room["players"]],
    })
    return base


def _award_versus_winner(room):
    """Fastest solver (rank 1 / winnerId) takes the round."""
    winner = next((p for p in room["players"] if p["id"] == room["winnerId"]), None)
    if winner:
        winner["score"] += 1


def _award_coop_mvp(room):
    """Co-op round goes to whoever contributed the most letters to the guesses."""
    best = None
    for p in room["players"]:
        if best is None or p["chars"] > best["chars"]:
            best = p
    if best and best["chars"] > 0:
        room["mvpId"] = best["id"]
        best["score"] += 1
    else:
        room["mvpId"] = None


def maybe_finish_versus(room):
    if room["mode"] != "versus" or room["status"] != "playing":
        return
    if room["players"] and all(p["finished"] for p in room["players"]):
        room["status"] = "finished"
        _award_versus_winner(room)


def register_handlers(sio):
    async def broadcast_state(room):
        room["lastActivity"] = _now_ms()
        for p in room["players"]:
            if p["connected"]:
                await sio.emit("roomState", build_state(room, p["id"]), to=p["id"])

    @sio.event
    async def connect(sid, environ, auth=None):
        pass

    @sio.on("createRoom")
    async def create_room(sid):
        purge_expired_rooms()  # opportunistic cleanup
        code = generate_code()
        rooms[code] = new_room(code)
        return {"code": code}

    @sio.on("joinRoom")
    async def join_room(sid, data=None):
        data = data or {}
        code = str(data.get("code") or "").upper().strip()
        room = rooms.get(code)
        if not room:
            return {"ok": False, "error": "Room not found."}

        name = clean_name(data.get("name"))

        player = next((p for p in room["players"] if p["id"] == sid), None)
        if player is None:
            # Co-op lets you jump in any time; versus is locked once it starts.
            if room["status"] != "lobby" and room["mode"] == "versus":
                return {"ok": False, "error": "That versus game is already in progress."}
            if len(room["players"]) >= MAX_PLAYERS:
                return {"ok": False, "error": f"Room is full (max {MAX_PLAYERS} players)."}
            player = new_player(sid, name)
            room["players"].append(player)
        else:
            player["name"] = name
            player["connected"] = True

        if not room["hostId"]:
            room["hostId"] = sid
        refresh_host_flags(room)

        sid_room[sid] = code
        await broadcast_state(room)
        # Give the (re)joining client the recent chat backlog.
        await sio.emit("chatHistory", room["chat"], to=sid)
        return {"ok": True}

    @sio.on("setMode")
    async def set_mode(sid, data=None):
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room or room["hostId"] != sid or room["status"] != "lobby":
            return
        mode = data.get("mode")
        if mode in ("coop", "versus"):
            room["mode"] = mode
            await broadcast_state(room)

    @sio.on("setWordLength")
    async def set_word_length(sid, data=None):
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room or room["hostId"] != sid or room["status"] != "lobby":
            return
        try:
            length = int(data.get("length"))
        except (TypeError, ValueError):
            return
        if length in SUPPORTED_LENGTHS:
            room["wordLength"] = length
            await broadcast_state(room)

    @sio.on("startGame")
    async def start_game(sid):
        room = rooms.get(sid_room.get(sid))
        if not room or room["hostId"] != sid or room["status"] == "playing":
            return
        reset_round(room)
        await broadcast_state(room)

    @sio.on("startSolo")
    async def start_solo(sid, data=None):
        """Single-player: mark the room solo, force versus, and start at once."""
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room or room["hostId"] != sid or room["status"] == "playing":
            return
        room["solo"] = True
        room["mode"] = "versus"
        try:
            length = int(data.get("length"))
        except (TypeError, ValueError):
            length = DEFAULT_LENGTH
        if length in SUPPORTED_LENGTHS:
            room["wordLength"] = length
        reset_round(room)
        await broadcast_state(room)

    @sio.on("type")
    async def type_op(sid, data=None):
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room or room["mode"] != "coop" or room["status"] != "playing":
            return
        player = next((p for p in room["players"] if p["id"] == sid), None)
        if player is None:
            return
        op = data.get("op")
        if op == "BACKSPACE":
            room["draft"] = room["draft"][:-1]
            if room["draftAuthors"]:
                room["draftAuthors"].pop()
        elif isinstance(op, str) and len(op) == 1 and op.isalpha():
            if len(room["draft"]) < room["wordLength"]:
                room["draft"] += op.upper()
                room["draftAuthors"].append(sid)
        else:
            return
        room["typingBy"] = player["name"] if room["draft"] else None
        await broadcast_state(room)

    @sio.on("submitGuess")
    async def submit_guess(sid, data=None):
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room or room["status"] != "playing":
            return {"ok": False, "error": "Game is not active."}

        if room["mode"] == "coop":
            if len(room["guesses"]) >= MAX_GUESSES:
                return {"ok": False, "error": "No guesses left."}
            guess = (room["draft"] or "").upper()
            if not (len(guess) == room["wordLength"] and guess.isalpha()):
                return {"ok": False, "error": "Not enough letters."}
            if not is_valid_word(guess, room["wordLength"]):
                return {"ok": False, "error": "Not in word list."}
            result = score_guess(guess, room["word"])
            player = next((p for p in room["players"] if p["id"] == sid), None)
            # Credit each letter in the submitted row to whoever typed it.
            for author_sid in room["draftAuthors"]:
                author = next((p for p in room["players"] if p["id"] == author_sid), None)
                if author:
                    author["chars"] += 1
            room["guesses"].append({
                "letters": guess,
                "result": result,
                "by": player["name"] if player else "?",
            })
            room["draft"] = ""
            room["draftAuthors"] = []
            room["typingBy"] = None
            solved = all(r == "correct" for r in result)
            if solved:
                room["status"] = "finished"
                room["outcome"] = "won"
                _award_coop_mvp(room)
            elif len(room["guesses"]) >= MAX_GUESSES:
                room["status"] = "finished"
                room["outcome"] = "lost"
                _award_coop_mvp(room)
            await broadcast_state(room)
            return {"ok": True, "solved": solved}

        # versus
        player = next((p for p in room["players"] if p["id"] == sid), None)
        if player is None or player["finished"]:
            return {"ok": False, "error": "You're already done."}
        guess = str(data.get("guess") or "").upper()
        if not (len(guess) == room["wordLength"] and guess.isalpha()):
            return {"ok": False, "error": "Not enough letters."}
        if not is_valid_word(guess, room["wordLength"]):
            return {"ok": False, "error": "Not in word list."}
        result = score_guess(guess, room["word"])
        player["guesses"].append({"letters": guess, "result": result})
        solved = all(r == "correct" for r in result)
        if solved:
            player["solved"] = True
            player["finished"] = True
            room["solveCount"] += 1
            player["rank"] = room["solveCount"]
            if not room["winnerId"]:
                room["winnerId"] = player["id"]
        elif len(player["guesses"]) >= MAX_GUESSES:
            player["finished"] = True
        maybe_finish_versus(room)
        await broadcast_state(room)
        return {"ok": True, "result": result, "solved": solved}

    def _unrevealed_positions(word, guesses):
        """Indices whose correct letter hasn't been guessed yet."""
        known = set()
        for g in guesses:
            for i, r in enumerate(g["result"]):
                if r == "correct":
                    known.add(i)
        return [i for i in range(len(word)) if i not in known]

    @sio.on("hint")
    async def hint(sid, data=None):
        room = rooms.get(sid_room.get(sid))
        if not room or room["status"] != "playing" or not room["word"]:
            return {"ok": False, "error": "Game is not active."}
        word = room["word"]

        if room["mode"] == "coop":
            if room["hintsUsed"] >= HINT_MAX:
                return {"ok": False, "error": "No hints left."}
            remaining = _unrevealed_positions(word, room["guesses"])
            if not remaining:
                return {"ok": False, "error": "All letters revealed."}
            idx = random.choice(remaining)
            room["hintsUsed"] += 1
            payload = {
                "index": idx,
                "letter": word[idx],
                "hintsLeft": HINT_MAX - room["hintsUsed"],
            }
            # Shared board → share the hint with the whole team.
            for p in room["players"]:
                if p["connected"]:
                    await sio.emit("hint", payload, to=p["id"])
            return {"ok": True}

        # versus / solo: private to the requester
        player = next((p for p in room["players"] if p["id"] == sid), None)
        if not player or player["finished"]:
            return {"ok": False, "error": "You're already done."}
        if player["hints"] >= HINT_MAX:
            return {"ok": False, "error": "No hints left."}
        remaining = _unrevealed_positions(word, player["guesses"])
        if not remaining:
            return {"ok": False, "error": "All letters revealed."}
        idx = random.choice(remaining)
        player["hints"] += 1
        cooldown = HINT_COOLDOWN_MS if (room["mode"] == "versus" and not room["solo"]) else 0
        return {
            "ok": True,
            "index": idx,
            "letter": word[idx],
            "hintsLeft": HINT_MAX - player["hints"],
            "cooldownMs": cooldown,
        }

    @sio.on("chatMessage")
    async def chat_message(sid, data=None):
        data = data or {}
        room = rooms.get(sid_room.get(sid))
        if not room:
            return
        player = next((p for p in room["players"] if p["id"] == sid), None)
        if not player:
            return
        # Rate limit per player, then length-cap + censor.
        if not allow_chat(player["chatTimes"]):
            return
        text = clean_chat(data.get("text"))
        if not text:
            return
        now = _now_ms()
        room["lastActivity"] = now
        msg = {
            "id": f"{now}-{random.randint(1000, 9999)}",
            "senderId": sid,
            "name": player["name"],
            "text": text,
            "ts": now,
        }
        room["chat"].append(msg)
        if len(room["chat"]) > 100:
            room["chat"] = room["chat"][-100:]
        for p in room["players"]:
            if p["connected"]:
                await sio.emit("chatMessage", msg, to=p["id"])

    @sio.on("playAgain")
    async def play_again(sid):
        room = rooms.get(sid_room.get(sid))
        if not room or room["hostId"] != sid:
            return
        room["status"] = "lobby"
        room["word"] = None
        room["guesses"] = []
        room["draft"] = ""
        room["draftAuthors"] = []
        room["typingBy"] = None
        room["outcome"] = None
        room["mvpId"] = None
        room["winnerId"] = None
        room["solveCount"] = 0
        room["hintsUsed"] = 0
        for p in room["players"]:
            p["guesses"] = []
            p["solved"] = False
            p["finished"] = False
            p["rank"] = None
            p["chars"] = 0
            p["hints"] = 0
        await broadcast_state(room)

    @sio.on("leaveRoom")
    async def leave_room(sid):
        """Tear down the whole room (chat included) and notify everyone."""
        code = sid_room.pop(sid, None)
        if not code:
            return
        room = rooms.pop(code, None)
        if not room:
            return
        for p in room["players"]:
            if p["id"] != sid:
                sid_room.pop(p["id"], None)
            if p["connected"]:
                await sio.emit("roomDestroyed", {"code": code}, to=p["id"])

    @sio.event
    async def disconnect(sid):
        code = sid_room.pop(sid, None)
        if not code:
            return
        room = rooms.get(code)
        if not room:
            return
        idx = next((i for i, p in enumerate(room["players"]) if p["id"] == sid), -1)
        if idx == -1:
            return
        room["players"].pop(idx)
        if not room["players"]:
            rooms.pop(code, None)
            return
        if room["hostId"] == sid:
            room["hostId"] = room["players"][0]["id"]
        refresh_host_flags(room)
        maybe_finish_versus(room)
        await broadcast_state(room)
