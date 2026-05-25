"""Lightweight content moderation for names and chat.

- mask_profanity: censors a basic blocklist (word-boundary, case-insensitive).
- clean_name / clean_chat: trim + length-cap + censor.

This is intentionally simple (a small static blocklist, no leetspeak handling),
meant to catch obvious cases — not to be a comprehensive filter.
"""
import re
import time

NAME_MAX = 20
CHAT_MAX = 300

# Chat rate limit: at most CHAT_BURST messages per CHAT_WINDOW_MS per player.
CHAT_WINDOW_MS = 5000
CHAT_BURST = 6

# Basic blocklist (kept modest). Word-boundary matched, case-insensitive.
_BLOCKLIST = {
    "fuck", "fucker", "fucking", "motherfucker", "dumbfuck", "shit", "bullshit",
    "shithead", "dipshit", "bitch", "bastard", "asshole", "asshat", "dumbass",
    "jackass", "dick", "dickhead", "piss", "cunt", "slut", "whore", "fag",
    "faggot", "nigger", "nigga", "retard", "wanker", "twat",
}

_PATTERNS = [re.compile(rf"\b{re.escape(w)}\b", re.IGNORECASE) for w in _BLOCKLIST]


def mask_profanity(text):
    """Replace blocklisted words with asterisks of the same length."""
    if not text:
        return text
    for rx in _PATTERNS:
        text = rx.sub(lambda m: "*" * len(m.group(0)), text)
    return text


def clean_name(raw):
    name = mask_profanity(str(raw or "").strip()[:NAME_MAX]).strip()
    # If censoring wiped it out (or it was empty), fall back.
    if not name or set(name) <= {"*", " "}:
        return "Player"
    return name


def clean_chat(raw):
    """Returns a cleaned message, or None if it shouldn't be sent."""
    text = str(raw or "").strip()[:CHAT_MAX]
    if not text:
        return None
    return mask_profanity(text)


def allow_chat(times, now_ms=None):
    """Sliding-window rate limit. `times` is a per-player list of ms timestamps.

    Mutates `times` in place; returns True if the message is allowed.
    """
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    cutoff = now - CHAT_WINDOW_MS
    times[:] = [t for t in times if t > cutoff]
    if len(times) >= CHAT_BURST:
        return False
    times.append(now)
    return True
