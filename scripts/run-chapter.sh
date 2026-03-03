#!/usr/bin/env bash
set -euo pipefail

CHAPTERS=(
  chapter_1_connection
  chapter_2_context_and_persona
  chapter_3_tools_and_escape
  chapter_4_production_polish
)

if [[ $# -lt 1 ]] || [[ "$1" -lt 1 ]] || [[ "$1" -gt 4 ]]; then
  echo "Usage: $0 <chapter_number>  (1-4)"
  echo ""
  echo "  1  Connection"
  echo "  2  Context & Persona"
  echo "  3  Tools & Escape"
  echo "  4  Production Polish"
  exit 1
fi

CHAPTER_DIR="${CHAPTERS[$(( $1 - 1 ))]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -d "$ROOT_DIR/$CHAPTER_DIR" ]]; then
  echo "Error: $CHAPTER_DIR not found"
  exit 1
fi

echo "================================================"
echo "  Starting $CHAPTER_DIR"
echo "================================================"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo ""
echo "[backend] Installing Python dependencies with uv..."
cd "$ROOT_DIR/$CHAPTER_DIR/backend"
uv sync --quiet

echo "[backend] Starting FastAPI on http://localhost:8000"
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo ""
echo "[frontend] Installing npm dependencies..."
cd "$ROOT_DIR/$CHAPTER_DIR/frontend"
npm install --silent

echo "[frontend] Starting Vite dev server on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "================================================"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  Press Ctrl+C to stop both servers"
echo "================================================"

wait
