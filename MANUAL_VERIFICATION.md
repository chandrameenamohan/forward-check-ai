# ForwardCheck-AI — QA Manual Verification

> Black-box verification steps for the full application. Run these after implementation or bug fixes.

---

## Prerequisites

Ensure `.env` has at minimum:
```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=<your-bot-token>
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_PATH=./data/forwardcheck.db
```

Optional (enriches investigator results):
```
BRAVE_SEARCH_API_KEY=...
GOOGLE_FACTCHECK_API_KEY=...
```

---

## Step 1: Start Server

```bash
npm run dev
```

**Verify:**
- Logs show "Database initialized", "Express server started", "Telegram bot started", "ForwardCheck-AI is running"
- No crash on startup

---

## Step 2: Run API Checks (second terminal)

```bash
bash scripts/qa-manual-checks.sh
```

**Verify:** All 8 checks show PASS. Summary: `8 passed, 0 failed`.

| Check | Expected |
|-------|----------|
| GET /health | 200, `status: "ok"` |
| POST /api/investigate (valid) | 201, returns `id` |
| POST /api/investigate (empty) | 400 |
| POST /api/investigate (no body) | 400 |
| GET /api/investigation/:id | 200, returns investigation |
| GET /api/investigation/fake | 404 |
| GET /v/fake | 404 |
| GET /v/:id (pending) | 200, HTML "in progress" |

---

## Step 3: Seed Demo Data

Stop the server first (`Ctrl+C`), then:

```bash
npx tsx scripts/seed-demo.ts
```

- ~$2.00 API cost, ~7-13 minutes
- Processes 4 claims through the full 6-agent pipeline
- Save the investigation IDs from the output

**Expected results after bug fixes:**

| Claim | Expected Category | Expected Confidence Range |
|-------|-------------------|--------------------------|
| "PM Modi announced Rs 5000..." | likely-false | 0-29 |
| "WHO declares green tea cures cancer" | likely-false | 0-29 |
| "Chandrayaan-3 landed on Moon's south pole" | likely-true or partially-true | 60-100 |
| "NASA confirmed water on Mars in 2024" | likely-true or partially-true | 50-100 |

**Watch for:**
- No "Confidence gate override" warnings (B1 fix)
- No "did not call submit_report" warnings (B2 fix)
- No Zod validation failures on summary length (B4 fix)
- All 3 investigators succeed per claim (no "Investigator failed" errors)

---

## Step 4: View Verdict Pages

Start the server again:

```bash
npm run dev
```

Open each verdict page in browser:
```
http://localhost:3000/v/<id-from-seed-output>
```

**Verify for each verdict page:**
- [ ] Verdict badge with correct color (green/yellow/red)
- [ ] Confidence percentage + 4 decomposition bars
- [ ] Claim summary text
- [ ] Manipulation techniques cards (if any)
- [ ] AI Reasoning section (DA + Judge thinking excerpts)
- [ ] "What Would Prove This Wrong" section
- [ ] Collapsible agent reports (click accordion to expand)
- [ ] Sources with clickable links
- [ ] Original claim text at bottom
- [ ] Pipeline metadata (duration, cost, deep reasoning indicator)

**Pending page test:** Create a new investigation via API, then immediately visit `/v/<id>` — should show "Investigation in progress" page.

---

## Step 5: Telegram Bot (optional)

Requires valid `TELEGRAM_BOT_TOKEN` in `.env`. With the server running:

1. Open your bot in Telegram
2. Send: `Hello` → should get greeting response
3. Send: `I think pizza is better than pasta` → should get opinion response
4. Forward a factual claim → should get:
   - "Investigating your claim..." progress updates
   - Final verdict with "View Full Analysis" button
5. Click "View Full Analysis" → opens verdict web page

---

## Step 6: Clean Shutdown

Press `Ctrl+C` in the server terminal.

**Verify:**
- "Received shutdown signal" log
- "Telegram bot stopped" log
- "Express server stopped" log
- "Database connection closed" log
- Process exits cleanly (no hanging)

---

## Quick Reference

| Step | Command | Cost | Time |
|------|---------|------|------|
| 1 | `npm run dev` | Free | Instant |
| 2 | `bash scripts/qa-manual-checks.sh` | Free | 1 min |
| 3 | `npx tsx scripts/seed-demo.ts` | ~$2.00 | 7-13 min |
| 4 | Browser: verdict pages | Free | 5 min |
| 5 | Telegram bot (optional) | ~$0.50/claim | 2-3 min |
| 6 | `Ctrl+C` | Free | Instant |
