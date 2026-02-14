#!/usr/bin/env bash
set -euo pipefail

# ForwardCheck-AI Quality Gate
# Runs typecheck, unit tests, coverage, and mocked integration tests.
# Exits non-zero on any failure.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PASS_COUNT=0
FAIL_COUNT=0
START_TIME=$(date +%s)

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "  FAIL: $1"
}

# ──────────────────────────────────────────────
# Step 1: TypeScript
# ──────────────────────────────────────────────
echo ""
echo "=== TypeScript ==="
if npx tsc --noEmit; then
  pass "TypeScript compilation"
else
  fail "TypeScript compilation"
  echo ""
  echo "=== Quality Gate FAILED ==="
  echo "  TypeScript errors must be fixed before proceeding."
  exit 1
fi

# ──────────────────────────────────────────────
# Step 2: Unit Tests
# ──────────────────────────────────────────────
echo ""
echo "=== Unit Tests ==="
if npx vitest run --exclude 'tests/integration/**'; then
  pass "Unit tests"
else
  fail "Unit tests"
  echo ""
  echo "=== Quality Gate FAILED ==="
  echo "  Unit test failures must be fixed before proceeding."
  exit 1
fi

# ──────────────────────────────────────────────
# Step 3: Coverage
# ──────────────────────────────────────────────
echo ""
echo "=== Coverage ==="
if npx vitest run --coverage --exclude 'tests/integration/**'; then
  pass "Coverage generation"
else
  fail "Coverage generation"
  echo ""
  echo "=== Quality Gate FAILED ==="
  echo "  Coverage run failed."
  exit 1
fi

# Parse coverage-summary.json for line coverage percentage
COVERAGE_FILE="$PROJECT_DIR/coverage/coverage-summary.json"
COVERAGE_THRESHOLD=60

if [ ! -f "$COVERAGE_FILE" ]; then
  fail "Coverage summary file not found at $COVERAGE_FILE"
  echo ""
  echo "=== Quality Gate FAILED ==="
  exit 1
fi

# Extract total line coverage pct using node (portable, no jq dependency)
LINE_COVERAGE=$(node -e "
  const data = JSON.parse(require('fs').readFileSync('$COVERAGE_FILE', 'utf8'));
  console.log(data.total.lines.pct);
")

echo "  Line coverage: ${LINE_COVERAGE}%"

# Compare as integers (truncate decimals for threshold check)
LINE_COVERAGE_INT=$(node -e "console.log(Math.floor($LINE_COVERAGE))")

if [ "$LINE_COVERAGE_INT" -lt "$COVERAGE_THRESHOLD" ]; then
  fail "Line coverage ${LINE_COVERAGE}% is below ${COVERAGE_THRESHOLD}% threshold"
  echo ""
  echo "=== Quality Gate FAILED ==="
  exit 1
else
  pass "Line coverage >= ${COVERAGE_THRESHOLD}%"
fi

# ──────────────────────────────────────────────
# Step 4: Integration Tests (mocked only)
# ──────────────────────────────────────────────
echo ""
echo "=== Integration Tests (mocked) ==="
if npx vitest run tests/integration/api-e2e.test.ts; then
  pass "Integration tests (API E2E)"
else
  fail "Integration tests (API E2E)"
  echo ""
  echo "=== Quality Gate FAILED ==="
  echo "  Mocked integration tests must pass."
  exit 1
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "==========================================="
echo "  Quality Gate Summary"
echo "==========================================="
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "  Line coverage: ${LINE_COVERAGE}%"
echo "  Duration: ${DURATION}s"
echo "==========================================="

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  Result: FAILED"
  exit 1
else
  echo "  Result: PASSED"
  exit 0
fi
