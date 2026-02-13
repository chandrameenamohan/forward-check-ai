#!/usr/bin/env bash
set -euo pipefail

# ForwardCheck-AI Full Quality Run
# Runs everything from quality-gate.sh PLUS all integration tests (including live API).
# Produces quality-report.md with full results.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

REPORT_FILE="$PROJECT_DIR/quality-report.md"
START_TIME=$(date +%s)

# Collect metadata
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_BRANCH=$(git branch --show-current)
GIT_SHA=$(git rev-parse --short HEAD)

# Status tracking
TS_STATUS="PASS"
UNIT_PASSED=0
UNIT_FAILED=0
UNIT_SKIPPED=0
INTEG_PASSED=0
INTEG_FAILED=0
LINE_COV="0"
BRANCH_COV="0"
FUNC_COV="0"
API_COST="unknown"

# ──────────────────────────────────────────────
# Step 1: TypeScript
# ──────────────────────────────────────────────
echo ""
echo "=== TypeScript ==="
if npx tsc --noEmit; then
  TS_STATUS="PASS"
  echo "  PASS: TypeScript compilation"
else
  TS_STATUS="FAIL"
  echo "  FAIL: TypeScript compilation"
fi

# ──────────────────────────────────────────────
# Step 2: Unit Tests
# ──────────────────────────────────────────────
echo ""
echo "=== Unit Tests ==="
UNIT_OUTPUT=$(npx vitest run --exclude 'tests/integration/**' 2>&1) || true
echo "$UNIT_OUTPUT" | tail -5

# Parse test counts from vitest output (strip ANSI codes)
UNIT_SUMMARY=$(echo "$UNIT_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g' | grep 'Tests')
UNIT_PASSED=$(echo "$UNIT_SUMMARY" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
UNIT_FAILED=$(echo "$UNIT_SUMMARY" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
UNIT_SKIPPED=$(echo "$UNIT_SUMMARY" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+' || echo "0")

# ──────────────────────────────────────────────
# Step 3: Coverage
# ──────────────────────────────────────────────
echo ""
echo "=== Coverage ==="
npx vitest run --coverage --exclude 'tests/integration/**' 2>&1 | tail -5

COVERAGE_FILE="$PROJECT_DIR/coverage/coverage-summary.json"
if [ -f "$COVERAGE_FILE" ]; then
  LINE_COV=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('$COVERAGE_FILE', 'utf8'));
    console.log(d.total.lines.pct);
  ")
  BRANCH_COV=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('$COVERAGE_FILE', 'utf8'));
    console.log(d.total.branches.pct);
  ")
  FUNC_COV=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('$COVERAGE_FILE', 'utf8'));
    console.log(d.total.functions.pct);
  ")
  echo "  Line: ${LINE_COV}% | Branch: ${BRANCH_COV}% | Function: ${FUNC_COV}%"
fi

# ──────────────────────────────────────────────
# Step 4: All Integration Tests (including live API)
# ──────────────────────────────────────────────
echo ""
echo "=== Integration Tests (all, including live API) ==="
INTEG_OUTPUT=$(npx vitest run tests/integration/ 2>&1) || true
echo "$INTEG_OUTPUT" | tail -10

# Parse integration test counts
INTEG_SUMMARY=$(echo "$INTEG_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g' | grep 'Tests')
INTEG_PASSED=$(echo "$INTEG_SUMMARY" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
INTEG_FAILED=$(echo "$INTEG_SUMMARY" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")

# Parse total API cost from E2E pipeline log
API_COST=$(echo "$INTEG_OUTPUT" | grep -oE 'Total API cost: \$[0-9.]+' | grep -oE '\$[0-9.]+' | tail -1 || echo "N/A")
if [ -z "$API_COST" ]; then
  API_COST="N/A"
fi

# ──────────────────────────────────────────────
# Generate Report
# ──────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

cat > "$REPORT_FILE" <<EOF
# ForwardCheck-AI Quality Report

| Field | Value |
|-------|-------|
| Timestamp | $TIMESTAMP |
| Branch | \`$GIT_BRANCH\` |
| Commit | \`$GIT_SHA\` |

## TypeScript

**Status:** $TS_STATUS

## Unit Tests

| Metric | Count |
|--------|-------|
| Passed | $UNIT_PASSED |
| Failed | $UNIT_FAILED |
| Skipped | $UNIT_SKIPPED |

## Integration Tests

| Metric | Count |
|--------|-------|
| Passed | $INTEG_PASSED |
| Failed | $INTEG_FAILED |

## Coverage

| Metric | Percentage |
|--------|-----------|
| Lines | ${LINE_COV}% |
| Branches | ${BRANCH_COV}% |
| Functions | ${FUNC_COV}% |

## API Cost

**Total:** $API_COST

## Duration

**Total:** ${DURATION}s
EOF

echo ""
echo "==========================================="
echo "  Full Quality Report Generated"
echo "==========================================="
echo "  Report: $REPORT_FILE"
echo "  TypeScript: $TS_STATUS"
echo "  Unit tests: $UNIT_PASSED passed, $UNIT_FAILED failed, $UNIT_SKIPPED skipped"
echo "  Integration: $INTEG_PASSED passed, $INTEG_FAILED failed"
echo "  Coverage: line ${LINE_COV}% | branch ${BRANCH_COV}% | function ${FUNC_COV}%"
echo "  API cost: $API_COST"
echo "  Duration: ${DURATION}s"
echo "==========================================="

# Exit non-zero if anything failed
if [ "$TS_STATUS" = "FAIL" ] || [ "$UNIT_FAILED" != "0" ] || [ "$INTEG_FAILED" != "0" ]; then
  echo "  Result: FAILED"
  exit 1
else
  echo "  Result: PASSED"
  exit 0
fi
