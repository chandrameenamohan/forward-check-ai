#!/usr/bin/env bash
# Ralph Loop — ForwardCheck-AI Scene Videos
# Iteratively builds 6 independent Remotion scene compositions.
# Each iteration: read plan → pick first [ ] task → implement → commit → exit.
# State persists via IMPLEMENTATION_SCENES_VIDEO.md on disk.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VIDEO_DIR="/Users/ralph/Projects/hello-world-video/forwardcheck-video"
PROMPT_FILE="$PROJECT_DIR/PROMPT_scenes_video.md"
PLAN_FILE="$PROJECT_DIR/IMPLEMENTATION_SCENES_VIDEO.md"
LOG_DIR="$PROJECT_DIR/.ralph-logs/scenes-video"
MAX_ITERATIONS=${1:-20}

mkdir -p "$LOG_DIR"

iteration=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ForwardCheck-AI — Scene Video Ralph Loop"
echo "Prompt:    $PROMPT_FILE"
echo "Plan:      $PLAN_FILE"
echo "Video dir: $VIDEO_DIR"
echo "Max:       $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
  echo "Error: $PLAN_FILE not found"
  exit 1
fi

if [ ! -d "$VIDEO_DIR" ]; then
  echo "Error: Remotion project not found at $VIDEO_DIR"
  exit 1
fi

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  timestamp=$(date +%Y%m%d-%H%M%S)
  log_file="$LOG_DIR/iteration-${iteration}-${timestamp}.log"

  echo ""
  echo "=========================================="
  echo "Scene Video Loop — Iteration $iteration"
  echo "=========================================="

  # Count remaining tasks
  remaining=$(grep -c '^\- \[ \]' "$PLAN_FILE" 2>/dev/null || true)
  if [ "$remaining" -eq 0 ]; then
    echo "All tasks complete. Exiting loop."
    break
  fi
  echo "$remaining tasks remaining."

  # Show next task preview
  next_task=$(grep -A 1 '^\- \[ \]' "$PLAN_FILE" | head -2)
  echo "Next: $next_task"
  echo ""

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

  # Push Remotion project changes (if it's a git repo)
  if [ -d "$VIDEO_DIR/.git" ]; then
    cd "$VIDEO_DIR"
    git push origin "$(git branch --show-current)" 2>/dev/null || true
    cd "$PROJECT_DIR"
  fi

  # Push plan file updates
  git push origin "$(git branch --show-current)" 2>/dev/null || true

  echo "Iteration $iteration complete. Sleeping 2s..."
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Scene video loop finished after $iteration iterations."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
