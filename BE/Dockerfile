# FastAPI + Socket.IO backend for Multiplayer Wordle.
# Used by container hosts (Koyeb, Hugging Face Spaces, Fly.io, etc.).
FROM python:3.11-slim

WORKDIR /app

# Install deps first so this layer caches when only app code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# Hugging Face Spaces routes to 7860 by default; other hosts inject $PORT.
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
