#!/usr/bin/env bash
set -euo pipefail

CHAPTERS=(
  chapter_1_connection
  chapter_2_context_and_persona
  chapter_3_tools_and_escape
  chapter_4_backend_events
  chapter_5_production_polish
)

if [[ $# -lt 1 ]] || [[ "$1" -lt 1 ]] || [[ "$1" -gt 5 ]]; then
  echo "Usage: $0 <chapter_number>  (1-5)"
  echo ""
  echo "Resets a chapter folder to its original scaffold state."
  echo "Your current work will be OVERWRITTEN. Use git to save first."
  exit 1
fi

CHAPTER_IDX=$(( $1 - 1 ))
CHAPTER_DIR="${CHAPTERS[$CHAPTER_IDX]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -d "$ROOT_DIR/$CHAPTER_DIR" ]]; then
  echo "Error: $CHAPTER_DIR not found"
  exit 1
fi

echo "This will restore $CHAPTER_DIR to its original scaffold."
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Restoring $CHAPTER_DIR from git..."
cd "$ROOT_DIR"
git checkout -- "$CHAPTER_DIR/"

echo "Done! $CHAPTER_DIR is back to its original state."
echo "Run: ./scripts/run-chapter.sh $1"
