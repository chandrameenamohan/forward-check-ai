#!/usr/bin/env bash
# QA Manual Verification — ForwardCheck-AI
# Run this while the server is running (npm run dev in another terminal)
# Usage: bash scripts/qa-manual-checks.sh

set -uo pipefail

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ForwardCheck-AI — QA Manual Checks"
echo "Server: $BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check() {
  local label="$1"
  local expected_code="$2"
  local actual_code="$3"
  local body="$4"

  if [ "$actual_code" = "$expected_code" ]; then
    echo "PASS  $label (HTTP $actual_code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $label (expected $expected_code, got $actual_code)"
    FAIL=$((FAIL + 1))
  fi
  echo "      Response: $body"
  echo ""
}

# --- 1. Health Endpoint ---
echo "=== 1. Health Endpoint ==="
BODY=$(curl -s "$BASE_URL/health")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "GET /health" "200" "$CODE" "$BODY"

# --- 2. Create Investigation (valid) ---
echo "=== 2. Create Investigation (valid message) ==="
BODY=$(curl -s -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{"message": "WHO says green tea cures cancer"}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{"message": "WHO says green tea cures cancer"}')
check "POST /api/investigate (valid)" "201" "$CODE" "$BODY"

# Extract the ID from the first creation response
INVESTIGATION_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "      Captured investigation ID: $INVESTIGATION_ID"
echo ""

# --- 3. Get Investigation by ID ---
echo "=== 3. Get Investigation by ID ==="
if [ -n "$INVESTIGATION_ID" ]; then
  BODY=$(curl -s "$BASE_URL/api/investigation/$INVESTIGATION_ID")
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/investigation/$INVESTIGATION_ID")
  check "GET /api/investigation/:id" "200" "$CODE" "$BODY"
else
  echo "SKIP  No investigation ID captured from previous step"
  echo ""
fi

# --- 4. Empty Message — expect 400 ---
echo "=== 4. Empty Message ==="
BODY=$(curl -s -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{"message": ""}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{"message": ""}')
check "POST /api/investigate (empty message)" "400" "$CODE" "$BODY"

# --- 5. Missing Body — expect 400 ---
echo "=== 5. Missing Message Field ==="
BODY=$(curl -s -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/investigate" \
  -H "Content-Type: application/json" \
  -d '{}')
check "POST /api/investigate (no message field)" "400" "$CODE" "$BODY"

# --- 6. Non-existent Investigation — expect 404 ---
echo "=== 6. Non-existent Investigation ==="
BODY=$(curl -s "$BASE_URL/api/investigation/doesnotexist")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/investigation/doesnotexist")
check "GET /api/investigation/doesnotexist" "404" "$CODE" "$BODY"

# --- 7. Non-existent Verdict Page — expect 404 ---
echo "=== 7. Non-existent Verdict Page ==="
BODY=$(curl -s "$BASE_URL/v/doesnotexist" | head -c 200)
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/v/doesnotexist")
check "GET /v/doesnotexist" "404" "$CODE" "$BODY"

# --- 8. Pending Verdict Page ---
echo "=== 8. Pending Verdict Page ==="
if [ -n "$INVESTIGATION_ID" ]; then
  BODY=$(curl -s "$BASE_URL/v/$INVESTIGATION_ID" | head -c 200)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/v/$INVESTIGATION_ID")
  check "GET /v/:id (pending investigation)" "200" "$CODE" "$BODY"
else
  echo "SKIP  No investigation ID captured"
  echo ""
fi

# --- Summary ---
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
