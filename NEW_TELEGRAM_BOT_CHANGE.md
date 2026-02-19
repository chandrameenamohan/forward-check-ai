# New Telegram Bot Change

**Date:** February 16, 2026
**PR:** [#20](https://github.com/chandrameenamohan/forward-check-ai/pull/20)
**Branch:** `feature/telegram-opus-bot`

---

## What Changed

Migrated from the beta Telegram bot to the new production bot for the hackathon demo.

| | Old | New |
|--|-----|-----|
| **Bot username** | `forward_check_beta_bot` | `forward_check_opus_bot` |
| **Bot link** | t.me/forward_check_beta_bot | t.me/forward_check_opus_bot |
| **Bot token** | (rotated) | Updated in `.env` (not committed) |

---

## Files Updated (15 files)

### Docs (8 files)
- `README.md` — bot link in header
- `TECHNICAL_BLOG.md` — bot link in footer
- `TECHNICAL_BLOG.html` — regenerated from markdown
- `AGENTS.md` — bot reference
- `IMPLEMENTATION_SMOKE_PLAN.md` — smoke test bot references
- `IMPLEMENTATION_UI_PLAN.md` — UI plan bot reference
- `IMPLEMENTATION_PLAN_LIVEVIEW.md` — liveview plan bot reference
- `PROMPT_smoke.md` — smoke prompt bot reference

### Templates (2 files)
- `src/server/views/landing.ejs` — CTA button link + bot name
- `src/server/views/live.ejs` — footer bot link

### Tests (5 files)
- `tests/unit/bot/status-updater.test.ts` — bot username in test assertions
- `tests/unit/bot/feedback-commands.test.ts` — bot username in test assertions
- `tests/unit/bot/message-handler.test.ts` — bot username in test assertions
- `tests/unit/server/routes/landing.test.ts` — bot link in template assertions
- `tests/unit/server/routes/live.test.ts` — bot link in template assertions

---

## Old Names Removed

All three variants of the old bot name were replaced:
- `forward_check_beta_bot` (9 files)
- `ForwardCheckAIBot` (2 files)
- `ForwardCheckBot` (4 files)

Zero remaining references to any old bot name in the codebase.

---

## Security

- Bot token updated in `.env` only (local, not committed)
- `.env` is in `.gitignore` (line 4)
- No tokens or API keys in the commit
