# ForwardCheck-AI — Production Smoke Test Plan

> Each task is atomic and single-objective. A task is complete when: commands executed, output verified, results documented, and task checked off.

**Production URL:** `https://sincere-love-production-ced7.up.railway.app`
**Telegram Bot:** `@forward_check_beta_bot`
**Telegram Web:** `https://web.telegram.org/a/#8464582121`

---

## Phase S0: Pre-flight

### Task S0.1: Kill local server and verify production deployment
- [x]
**Objective:** Ensure no local dev server is running (avoids Telegram bot polling conflict) and verify Railway deployment is healthy.
**Steps:**
1. Kill any process on port 3000: `lsof -ti:3000 | xargs kill -9 2>/dev/null || true`
2. Kill any running `tsx` / `node` instances of this project: `pkill -f "tsx src/index.ts" 2>/dev/null || true`
3. Curl health endpoint: `curl -s $PROD_URL/health` — expect `{"status":"ok"}`
4. Check Railway service status: `railway service status` — expect `SUCCESS`
5. Check Railway logs for startup: `railway service logs 2>&1 | tail -10` — expect "ForwardCheck-AI is running" and "Telegram bot started"
**Pass criteria:** Health returns 200 with `status: ok`. Logs show bot started. No local server running.

---

## Phase S1: Web Endpoint Smoke Tests

### Task S1.1: Verify all web pages and static assets
- [x]
**Objective:** Confirm every user-facing page and static asset loads with correct HTTP status.
**Steps:**
1. `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/` — expect `200`
2. `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/chat` — expect `200`
3. `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health` — expect `200`
4. `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/static/telegram-bot-qr-code.jpg` — expect `200`
5. `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/nonexistent` — expect `404`
6. Verify landing page contains key content: `curl -s $PROD_URL/ | grep -c "ForwardCheck"` — expect > 0
7. Verify chat page contains form: `curl -s $PROD_URL/chat | grep -c "message"` — expect > 0
**Pass criteria:** All status codes match. Pages contain expected content.

### Task S1.2: Verify API input validation
- [x]
**Objective:** Confirm API endpoints reject invalid input correctly.
**Steps:**
1. Empty body: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{}'` — expect 400, error about message required
2. Too short: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"hi"}'` — expect 400, error about length
3. Non-string: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":123}'` — expect 400
4. HTML injection: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"<script>alert(1)</script> This is a test claim about vaccines"}'` — expect 201 (sanitized), verify response has `id`
5. Non-existent investigation: `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/api/investigation/nonexistent` — expect 404
6. Non-existent verdict: `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/v/nonexistent` — expect 404
7. Dev trigger blocked: `curl -s -o /dev/null -w "%{http_code}" -X POST $PROD_URL/api/dev/trigger -H "Content-Type: application/json" -d '{"message":"test"}'` — expect 404 (disabled in production)
**Pass criteria:** All responses match expected codes and error messages.

---

## Phase S2: End-to-End Investigation Flow

### Task S2.1: Submit claim via web chat and verify full pipeline
- [ ]
**Objective:** Submit a factual claim via the chat API, watch it flow through the 6-agent pipeline, and verify the verdict page renders.
**Steps:**
1. Submit claim: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"The Great Wall of China is visible from space with the naked eye"}'`
2. Extract `id` from response JSON
3. Poll `$PROD_URL/api/investigation/$ID` every 10 seconds until `status` is `completed` (timeout: 5 minutes)
4. Verify completed investigation has: `final_verdict` with `category`, `confidence`, `summary`, `sources`
5. Verify verdict page: `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/v/$ID` — expect 200
6. Verify verdict page content: `curl -s $PROD_URL/v/$ID | grep -c "verdict"` — expect > 0
7. Check Railway logs for pipeline completion: `railway service logs 2>&1 | grep "$ID" | tail -5`
8. Log the verdict category, confidence, cost, and duration from the API response
**Pass criteria:** Investigation completes within 5 minutes. Verdict page renders. Logs show pipeline completed.
**Note:** This task costs ~$0.60 in Anthropic API credits per run.

### Task S2.2: Submit non-factual message and verify short-circuit
- [ ]
**Objective:** Submit a greeting/opinion and verify the pipeline short-circuits without running the full 6-agent pipeline.
**Steps:**
1. Submit greeting: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"Hello! How are you doing today? This is a friendly message."}'`
2. Extract `id` from response
3. Poll `$PROD_URL/api/investigation/$ID` every 5 seconds until completed (timeout: 60 seconds — should be fast)
4. Verify the response indicates non-factual classification (classifier result category should be greeting/opinion/other)
5. Verify cost is minimal (< $0.05 — Haiku only)
6. Check Railway logs: `railway service logs 2>&1 | grep "$ID" | tail -5`
**Pass criteria:** Completes in < 60 seconds. Cost < $0.05. No investigator/DA/judge agents invoked.

### Task S2.3: Verify SSE live streaming
- [ ]
**Objective:** Submit a claim and verify the SSE stream delivers real-time agent progress events.
**Steps:**
1. Submit claim: `curl -s -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"Albert Einstein failed math in school and was a poor student"}'`
2. Extract `id` from response
3. Connect to SSE: `curl -s -N $PROD_URL/api/live/$ID/stream --max-time 300` — capture output
4. Verify SSE output contains event types: `classifier`, `strategist`, `investigator`, `da`, `judge` (at least some of them)
5. Verify SSE stream ends with a completion or verdict event
6. Verify live page loads: `curl -s -o /dev/null -w "%{http_code}" $PROD_URL/live/$ID` — expect 200
**Pass criteria:** SSE stream delivers events. Live page loads. Events arrive in pipeline order.
**Note:** This task costs ~$0.60 in Anthropic API credits per run.

---

## Phase S3: Telegram Bot Verification

### Task S3.1: Verify Telegram bot is connected and reachable
- [ ]
**Objective:** Confirm the Telegram bot is running in production and responding to the Telegram API.
**Steps:**
1. Extract bot token from .env: `source .env && echo $TELEGRAM_BOT_TOKEN`
2. Call Telegram getMe API: `curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"` — expect `ok: true`, verify username matches `forward_check_beta_bot`
3. Check Railway logs for "Telegram bot started": `railway service logs 2>&1 | grep -i "telegram" | tail -5`
4. Verify no 409 conflict errors in recent logs: `railway service logs 2>&1 | grep -c "409"` — expect 0
5. Call getUpdates with limit 0 to check polling health: `curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates?limit=0&timeout=1"` — this will likely return 409 (since the bot is actively polling), which actually confirms the bot IS running
**Pass criteria:** getMe returns valid bot info. Logs show bot started. No conflict errors (or only expected 409 from getUpdates because bot is polling).

---

## Phase S4: Load & Performance Testing

### Task S4.1: Concurrent endpoint stress test
- [ ]
**Objective:** Verify the server handles concurrent requests without crashing or returning errors.
**Steps:**
1. Health endpoint — 50 concurrent requests: `for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code}\n" $PROD_URL/health & done | sort | uniq -c`
   — expect all 200
2. Landing page — 20 concurrent requests: `for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" $PROD_URL/ & done | sort | uniq -c`
   — expect all 200
3. Chat page — 20 concurrent requests: `for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" $PROD_URL/chat & done | sort | uniq -c`
   — expect all 200
4. Invalid POST — 10 concurrent: `for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{}' & done | sort | uniq -c`
   — expect all 400
5. Check Railway logs after stress test for errors: `railway service logs 2>&1 | tail -20`
6. Verify health still works after stress: `curl -s $PROD_URL/health` — expect ok
**Pass criteria:** No 500 errors. No crashes. Server stays healthy after burst.

### Task S4.2: Response time benchmarks
- [ ]
**Objective:** Measure and document baseline response times for key endpoints.
**Steps:**
1. Health endpoint (5 samples): `for i in $(seq 1 5); do curl -s -o /dev/null -w "%{time_total}\n" $PROD_URL/health; done` — compute average, expect < 1s
2. Landing page (5 samples): `for i in $(seq 1 5); do curl -s -o /dev/null -w "%{time_total}\n" $PROD_URL/; done` — compute average, expect < 2s
3. Chat page (5 samples): `for i in $(seq 1 5); do curl -s -o /dev/null -w "%{time_total}\n" $PROD_URL/chat; done` — compute average, expect < 2s
4. Chat API submission (1 sample): `curl -s -o /dev/null -w "%{time_total}\n" -X POST $PROD_URL/api/chat/message -H "Content-Type: application/json" -d '{"message":"Is it true that water boils at 100 degrees Celsius at sea level?"}'` — expect < 3s for the initial 201 response (pipeline runs async)
5. Document all timings in the smoke test log
**Pass criteria:** All response times within expected bounds. No endpoint takes > 5s for initial response.

---

## Phase S5: Production Health Review

### Task S5.1: Review production logs and deployment health
- [ ]
**Objective:** Review Railway logs end-to-end for errors, warnings, memory issues, or unexpected behavior.
**Steps:**
1. Pull full logs: `railway service logs 2>&1 | head -100`
2. Count error-level messages: `railway service logs 2>&1 | grep -ci "error"` — document count
3. Count warning-level messages: `railway service logs 2>&1 | grep -ci "warn"` — document count
4. Check for memory warnings: `railway service logs 2>&1 | grep -ci "memory\|heap\|oom"` — expect 0
5. Check for unhandled rejections: `railway service logs 2>&1 | grep -ci "unhandled"` — expect 0
6. Check deployment status: `railway service status` — expect SUCCESS
7. Check uptime from health: `curl -s $PROD_URL/health | python3 -c "import sys,json; print(f'Uptime: {json.load(sys.stdin)[\"uptime\"]:.0f}s')"` — should be increasing
8. Write a summary of production health: errors found, warnings found, uptime, overall assessment
**Pass criteria:** No unhandled rejections. No OOM. Errors are explained (e.g., expected 409 from Telegram). Overall: production-ready.

---

## Dependency Graph

```
S0.1 (Pre-flight)
  └─→ S1.1 (Web pages)
  └─→ S1.2 (API validation)
  └─→ S3.1 (Telegram bot)
  └─→ S4.1 (Stress test)
  └─→ S4.2 (Response times)
        S1.1 + S1.2 └─→ S2.1 (E2E factual claim)
                     └─→ S2.2 (E2E non-factual)
                     └─→ S2.3 (SSE streaming)
                           S2.* + S4.* └─→ S5.1 (Health review)
```

**S0.1** is prerequisite for all.
**S1, S3, S4** can run in any order after S0.
**S2** depends on S1 (endpoints verified first).
**S5** should run last (reviews everything).

---

## Fix Protocol

If any task FAILS:
1. Check Railway logs for the error
2. Identify the root cause (code bug vs config vs infra)
3. Fix the code locally
4. Run `npx tsc --noEmit` to verify types
5. Run `npx vitest run` to verify tests pass
6. Commit the fix: `git add -A && git commit -m "Smoke fix: <description>"`
7. Redeploy: `railway up -d`
8. Wait for deployment: poll `railway service status` until SUCCESS
9. Re-run the failed check
10. If it passes, mark the task complete and continue

---

## Estimated Cost

| Task | API Cost |
|------|----------|
| S0, S1, S3, S4, S5 | $0 (no pipeline calls) |
| S2.1 (factual claim) | ~$0.60 |
| S2.2 (non-factual) | ~$0.01 |
| S2.3 (SSE + factual) | ~$0.60 |
| **Total** | **~$1.21** |
