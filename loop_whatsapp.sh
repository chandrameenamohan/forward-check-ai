#!/usr/bin/env bash
# Ralph Loop — ForwardCheck-AI WhatsApp Integration
# Runs Claude Code iteratively, one task per iteration.
# Each iteration gets a fresh context window.
# State persists via IMPLEMENTATION_PLAN_WHATSAPP.md and AGENTS.md on disk.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$PROJECT_DIR/PROMPT_build_whatsapp.md"
PLAN_FILE="$PROJECT_DIR/IMPLEMENTATION_PLAN_WHATSAPP.md"
LOG_DIR="$PROJECT_DIR/.ralph-logs"
MAX_ITERATIONS=${1:-100}
CURRENT_BRANCH=$(git branch --show-current)

mkdir -p "$LOG_DIR"

iteration=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ForwardCheck-AI WhatsApp Integration — Ralph Loop"
echo "Branch:  $CURRENT_BRANCH"
echo "Prompt:  $PROMPT_FILE"
echo "Max:     $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
  echo "Error: $PLAN_FILE not found"
  exit 1
fi

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  timestamp=$(date +%Y%m%d-%H%M%S)
  log_file="$LOG_DIR/iteration-${iteration}-${timestamp}.log"

  echo ""
  echo "=========================================="
  echo "Ralph Loop — Iteration $iteration"
  echo "=========================================="

  # Count remaining tasks
  remaining=$(grep -c '^\- \[ \]' "$PLAN_FILE" 2>/dev/null || true)
  if [ "$remaining" -eq 0 ]; then
    echo "All tasks complete. Exiting loop."
    break
  fi
  echo "$remaining tasks remaining."

  # Run Claude Code autonomously with streaming output
  cat "$PROMPT_FILE" | claude --print \
    --model claude-opus-4-6 \
    --dangerously-skip-permissions \
    --verbose \
    2>&1 | tee "$log_file"

  exit_code=${PIPESTATUS[1]}
  echo "Iteration $iteration finished with exit code $exit_code" >> "$log_file"

  if [ "$exit_code" -ne 0 ]; then
    echo "WARNING: Claude exited with code $exit_code on iteration $iteration. Continuing..."
  fi

  # Skip push — local development only
  # git push origin "$CURRENT_BRANCH" 2>/dev/null || {
  #   echo "Creating remote branch..."
  #   git push -u origin "$CURRENT_BRANCH"
  # }

  echo "Iteration $iteration complete. Sleeping 2s..."
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Ralph loop finished after $iteration iterations."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
