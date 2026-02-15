#!/usr/bin/env bash
# Ralph Loop — ForwardCheck-AI New Feature (CI/CD + Feedback Pipeline)
# Runs Claude Code iteratively, one task per iteration.
# Each iteration gets a fresh context window.
# State persists via IMPLEMENTATION_PLAN_NEW_FEATURE.md and AGENTS.md on disk.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$PROJECT_DIR/PROMPT_new_feature.md"
PLAN_FILE="$PROJECT_DIR/IMPLEMENTATION_PLAN_NEW_FEATURE.md"
LOG_DIR="$PROJECT_DIR/.ralph-logs"
MAX_ITERATIONS=${1:-100}
FEATURE_BRANCH="feature/feedback-pipeline"

mkdir -p "$LOG_DIR"

# Create and switch to feature branch (idempotent — skips if already on it)
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$FEATURE_BRANCH" ]; then
  echo "Switching to branch: $FEATURE_BRANCH"
  git checkout -b "$FEATURE_BRANCH" 2>/dev/null || git checkout "$FEATURE_BRANCH"
fi
CURRENT_BRANCH="$FEATURE_BRANCH"

iteration=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ForwardCheck-AI — Ralph Loop (New Feature)"
echo "Branch:  $CURRENT_BRANCH"
echo "Prompt:  $PROMPT_FILE"
echo "Plan:    $PLAN_FILE"
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
  log_file="$LOG_DIR/feature-iteration-${iteration}-${timestamp}.log"

  echo ""
  echo "=========================================="
  echo "Ralph Loop (New Feature) — Iteration $iteration"
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

  # Push to remote after each successful iteration
  git push origin "$CURRENT_BRANCH" 2>/dev/null || {
    echo "Creating remote branch..."
    git push -u origin "$CURRENT_BRANCH"
  }

  echo "Iteration $iteration complete. Sleeping 2s..."
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Ralph Loop (New Feature) finished after $iteration iterations."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
