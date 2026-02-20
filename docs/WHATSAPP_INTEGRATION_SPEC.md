# ForwardCheck-AI: WhatsApp Integration — Project Specification

**Version:** 1.0
**Date:** February 19, 2026
**Authors:** Product Manager, WhatsApp Bot Expert, Software Architect
**Status:** Draft — Pending Stakeholder Review

---

## 1. Executive Summary

ForwardCheck-AI should expand from Telegram to WhatsApp as its second messaging platform. This document assesses feasibility across three dimensions — market opportunity, technical architecture, and platform capabilities — and provides a concrete implementation plan.

**Recommendation: GO.** The integration is technically straightforward, strategically compelling, and financially viable.

| Dimension | Assessment |
|-----------|-----------|
| Market Opportunity | **Strong** — WhatsApp has 3B MAU (3x Telegram), dominates misinformation-prone regions |
| Technical Feasibility | **High** — Codebase is ~80% platform-agnostic; AI pipeline needs zero changes |
| Platform Compatibility | **Good** — Cloud API supports forwarded message detection, webhooks map to existing Express server |
| Cost Impact | **Low** — User-initiated messages are free; incremental cost is ~$150-650/mo |
| Regulatory Risk | **Medium** — Meta's AI chatbot ban requires careful positioning as task-oriented tool |
| Effort Estimate | **~4 weeks MVP** — ~1,065 LOC new, ~9 files modified, 25+ files unchanged |

---

## 2. Market Opportunity

### 2.1 Why WhatsApp?

| Metric | WhatsApp | Telegram |
|--------|----------|----------|
| Monthly Active Users | 3.0 billion | ~1 billion |
| Daily Active Users | 2.3 billion | ~500 million |
| Global Ranking | #1 messaging app | #3 messaging app |

WhatsApp dominates the regions where misinformation causes the most real-world harm:

- **India:** 597M users. WhatsApp-fueled misinformation linked to 40+ documented mob attacks since 2017.
- **Brazil:** 98.9% penetration. Organized WhatsApp groups weaponized during elections.
- **Sub-Saharan Africa:** 95-97% penetration in Nigeria, Kenya, South Africa.
- **Southeast Asia:** 87% of Indonesian internet users use WhatsApp monthly.

WhatsApp's architecture — end-to-end encryption, forwarding mechanics, closed groups — makes it uniquely vulnerable to viral misinformation while shielding content from external fact-checkers. ForwardCheck-AI brings the remedy directly to the platform where misinformation spreads.

### 2.2 Competitive Landscape

| Competitor | Region | Approach | Limitation |
|-----------|--------|----------|------------|
| Dubawa Chatbot | Nigeria | AI + database lookup | Regional only |
| Meedan Check Bot | India, Brazil, Africa | Tipline for newsrooms | Not consumer-facing |
| WhatsApp + IFCN | Global | Directory of fact-checkers | Discovery only, not automated |
| Perplexity | Global | General AI search | **Banned** under Jan 2026 AI chatbot policy |

**ForwardCheck-AI's differentiators:** Adversarial multi-agent pipeline (6 agents including Devil's Advocate), transparent confidence decomposition, manipulation detection, and real-time investigation per claim — no competitor has this architecture.

---

## 3. Technical Feasibility Assessment

### 3.1 Current Architecture — Already 80% Platform-Agnostic

The entire 6-agent AI pipeline, all Zod schemas, tools, services, and the agent runner have **zero Telegram knowledge**. 25+ files need no changes.

Telegram coupling is isolated to 4 areas:

| Area | Files | Lines | Coupling Level |
|------|-------|-------|---------------|
| `src/bot/` (Grammy bot, handler, status updater) | 3 | ~385 | Full |
| `src/formatter/telegram-formatter.ts` | 1 | ~155 | Full |
| `src/orchestrator/pipeline.ts` (2 optional fields) | 1 | ~4 | Minimal |
| Database columns (4 `telegram_*` columns) | 2 | ~8 | Naming only |

**Proof of concept already exists:** The web chat route (`/api/chat/message`) invokes the pipeline with null Telegram fields, proving it works without any Telegram dependency.

### 3.2 Message Flow

```
User sends message
        │
        ▼
Platform Adapter (Telegram Grammy / WhatsApp Webhook)
        │
        ▼
Normalize to PlatformMessage { text, isForwarded, chatId, sender }
        │
        ▼
Message Router → pipeline.investigate(text, platformOptions)
        │
        ▼
  ┌── InvestigationPipeline (100% platform-agnostic) ──┐
  │  Classifier (Haiku) → Strategist (Opus) →           │
  │  3× Investigators (Sonnet) → DA (Opus) → Judge (Opus)│
  └─────────────────────────────────────────────────────┘
        │
        ▼
Platform Formatter (Telegram HTML / WhatsApp Markdown)
        │
        ▼
Platform Responder (ctx.api.sendMessage / POST Cloud API)
```

### 3.3 Forwarded Message Detection

| | Telegram | WhatsApp |
|---|---|---|
| Detection | `message.forward_origin !== undefined` | `context.forwarded === true` |
| Viral indicator | None | `context.frequently_forwarded` (5+ forwards) |
| Original sender | Available via `forward_origin` | **Not available** (privacy by design) |
| Pipeline impact | None — forwarded status is logged but not used by AI agents | None |

The forwarded status is trivially abstractable. WhatsApp's `frequently_forwarded` flag is a bonus signal for prioritizing viral claims.

---

## 4. WhatsApp Platform Analysis

### 4.1 Technology Choice: Meta Cloud API (Direct HTTP)

| Option | Status | Recommendation |
|--------|--------|---------------|
| Meta Cloud API (direct HTTP) | Active, only supported path | **Use this** |
| Meta official Node.js SDK | Archived since June 2023 | Do not use |
| Baileys (unofficial) | Active but violates ToS | Do not use |
| whatsapp-web.js (unofficial) | Active but violates ToS | Do not use |

The On-Premises API was deprecated Oct 2025. Cloud API is the sole path forward. Meta recommends direct HTTP integration — no SDK needed. TypeScript types available via `@whatsapp-cloudapi/types`.

This aligns perfectly with ForwardCheck-AI's existing Express 5 server.

### 4.2 Webhook Integration

WhatsApp uses webhooks (not long-polling). Integration requires:

1. **GET `/webhook/whatsapp`** — Verification challenge (Meta sends `hub.verify_token` + `hub.challenge`)
2. **POST `/webhook/whatsapp`** — Incoming message payloads

The existing Railway deployment provides HTTPS by default. Express routes map cleanly.

### 4.3 Rate Limits & Scaling

| Tier | Contacts/Day | Requirement |
|------|-------------|-------------|
| Unverified | 250 | Default |
| Tier 1 | 1,000 | Business verification |
| Tier 2 | 10,000 | High quality + volume |
| Tier 3 | 100,000 | Sustained high quality |
| Unlimited | No limit | Top-tier accounts |

Throughput: 80 messages/sec default, upgradeable to 1,000 MPS.

### 4.4 Registration Timeline

| Step | Duration |
|------|----------|
| Account setup | 1-2 hours |
| Business verification | 1-15 business days |
| Display name approval | 1-3 business days |
| Template approval | Hours to days |
| **Total** | **1-3 weeks** |

---

## 5. Product Requirements

### 5.1 User Stories (MVP)

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-1 | WhatsApp user | Forward a suspicious message to ForwardCheck-AI | I can check if it's true before sharing it |
| US-2 | WhatsApp user | Receive a clear verdict (true/false/partial) | I understand the claim's accuracy at a glance |
| US-3 | WhatsApp user | See key findings and sources | I can verify the reasoning myself |
| US-4 | WhatsApp user | Share the verdict with others | I can counter misinformation in my groups |
| US-5 | WhatsApp user | Send a URL to an article | I can fact-check news articles I receive |
| US-8 | Returning user | Send another claim without re-onboarding | The experience is frictionless for repeat use |

### 5.2 Feature Parity Matrix

| Feature | Telegram | WhatsApp MVP | Notes |
|---------|----------|-------------|-------|
| Forward message to bot | `forward_origin` detection | `context.forwarded` | Core — must have |
| Direct text claims | Text handler | Text messages | Core — must have |
| URL detection & reading | `detectUrl()` | Same pipeline | Must have |
| Progress updates | Edit-in-place | Sequential messages | No edit API on WhatsApp |
| Rich verdict | HTML formatting | WhatsApp markdown | New formatter needed |
| Inline buttons | `InlineKeyboard` | CTA URL buttons | Interactive messages |
| Welcome flow | `/start` command | Auto-welcome on first message | No slash commands |
| Feedback/bug | `/bug`, `/feedback` | Deferred | Phase 2 |
| Group support | N/A | Deferred | Phase 3 |
| Multi-language | N/A | Deferred | Phase 2 |

### 5.3 Key UX Adaptations

1. **No message editing** — StatusUpdater pattern becomes sequential messages (limit to 2-3 to avoid spam)
2. **No slash commands** — Conversational intent detection or interactive buttons
3. **WhatsApp markdown** — `*bold*`, `_italic_`, `>quote` instead of HTML tags
4. **Phone numbers are PII** — Hash at ingestion, never log raw numbers
5. **CTA buttons** — Interactive messages with URL buttons for "View Full Analysis"

---

## 6. Proposed Architecture

### 6.1 Platform Adapter Layer

```
src/
  platforms/
    types.ts                    # PlatformMessage, PlatformResponder, PlatformAdapter
    message-router.ts           # Routes PlatformMessage → pipeline → response
    telegram/
      adapter.ts                # TelegramAdapter (refactored from src/bot/)
      responder.ts              # TelegramResponder (sendMessage, editMessage)
      formatter.ts              # Telegram HTML formatting (moved from src/formatter/)
    whatsapp/
      adapter.ts                # WhatsAppAdapter
      responder.ts              # WhatsAppResponder (POST to Cloud API)
      formatter.ts              # WhatsApp markdown formatting
      webhook.ts                # Express routes for /webhook/whatsapp
      client.ts                 # WhatsApp Cloud API HTTP client
```

### 6.2 Core Interfaces

```typescript
interface PlatformMessage {
  platform: "telegram" | "whatsapp" | "web";
  chatId: string;
  messageId: string;
  text: string;
  isForwarded: boolean;
  isFrequentlyForwarded?: boolean;
  sender: { id: string; username?: string; displayName?: string; };
}

interface PlatformResponder {
  sendText(chatId: string, text: string): Promise<void>;
  sendVerdict(chatId: string, verdict: FinalVerdict, analysisUrl: string): Promise<void>;
  sendStatusUpdate(chatId: string, stage: PipelineStage): Promise<void>;
  sendInitial(chatId: string): Promise<void>;
}

interface PlatformAdapter {
  readonly platform: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

### 6.3 Pipeline Updates

```typescript
// Updated InvestigateOptions — platform-agnostic
interface InvestigateOptions {
  platform?: string;           // "telegram" | "whatsapp" | "web"
  platformChatId?: string;     // replaces telegramChatId
  platformMessageId?: string;  // replaces telegramMessageId
  onStatusUpdate?: (stage: PipelineStage) => void | Promise<void>;
  onInvestigationCreated?: (investigationId: string) => void | Promise<void>;
  investigationId?: string;
  sourceUrl?: string;
  extractedUrlContent?: string;
}
```

### 6.4 Database Migration

```sql
-- Add platform-agnostic columns
ALTER TABLE investigations ADD COLUMN source_platform TEXT DEFAULT 'telegram';
ALTER TABLE investigations ADD COLUMN platform_chat_id TEXT;
ALTER TABLE investigations ADD COLUMN platform_message_id TEXT;

-- Backfill existing data
UPDATE investigations SET platform_chat_id = telegram_chat_id,
                          platform_message_id = telegram_message_id;

-- feedback table
ALTER TABLE feedback ADD COLUMN platform_user_id_hash TEXT;
```

### 6.5 Effort Estimate

| Category | Details |
|----------|---------|
| New files | ~10 files, ~1,065 LOC |
| Modified files | ~9 files (low-medium complexity) |
| Unchanged files | 25+ files (entire AI pipeline, schemas, tools, services) |

---

## 7. Implementation Phases

### Phase 1: Platform Abstraction (Week 1-2) — Pure Refactor

1. Create `src/platforms/types.ts` with interfaces
2. Refactor `src/bot/` into `src/platforms/telegram/` adapter pattern
3. Create `src/platforms/message-router.ts`
4. Update pipeline to use platform-agnostic fields
5. Run database migration
6. **Verify Telegram still works identically** — zero behavior change

### Phase 2: WhatsApp Integration (Week 3-4)

1. Set up WhatsApp Business API account (start early — 1-3 weeks for approval)
2. Create `src/platforms/whatsapp/client.ts` (Cloud API HTTP wrapper)
3. Create `src/platforms/whatsapp/webhook.ts` (Express routes)
4. Create `src/platforms/whatsapp/adapter.ts` + `responder.ts`
5. Create `src/platforms/whatsapp/formatter.ts`
6. Wire into `src/index.ts` and `src/server/app.ts`
7. Deploy and test with WhatsApp sandbox

### Phase 3: Beta Launch (Week 5-6)

1. End-to-end testing with real WhatsApp Business number
2. Limited beta with 50-100 users (recommended: India or Nigeria)
3. Phone number anonymization verification
4. Error handling and edge case testing
5. Performance monitoring setup

### Phase 4: Feature Expansion (Week 7-10)

1. Conversational feedback flow
2. Interactive messages (CTA buttons, list messages)
3. Multi-language support (Hindi, Portuguese)
4. Verdict sharing templates
5. Group chat support

---

## 8. Cost Analysis

### 8.1 WhatsApp Messaging Costs

| Message Type | Cost |
|-------------|------|
| User-initiated (service window, 24h) | **FREE** |
| Bot reply within service window | **FREE** |
| Template messages (proactive) | $0.004-$0.22/msg by category + country |

**Core fact-checking flow is $0** — user initiates, bot responds within minutes.

### 8.2 Estimated Monthly Costs (MVP)

| Item | Cost |
|------|------|
| WhatsApp BSP hosting (if needed) | $0-150/mo |
| WhatsApp API messages | $0 (user-initiated flow) |
| Anthropic API (at 1,000 investigations/mo) | $150-500/mo |
| Infrastructure (shared with Telegram) | $0 incremental |
| **Total incremental cost** | **~$150-650/mo** |

### 8.3 Comparison

Telegram Bot API is completely free. WhatsApp adds potential BSP fees but the messaging itself is free for the core use case. The dominant cost remains the Anthropic API pipeline ($0.15-0.50/investigation), which is shared across channels.

---

## 9. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Meta classifies bot as "general-purpose AI" | **High** | Low-Medium | Position as narrow task-oriented service; no open-ended chat; IFCN partnership; early Meta engagement |
| Business API approval delayed | Medium | Medium | Start registration immediately (parallel with development) |
| Phone number PII breach | **High** | Low | Hash at ingestion; minimize retention; encrypt at rest; GDPR compliance |
| Response time unacceptable for WhatsApp users | Medium | Medium | Progress messages; pipeline optimization; claim caching |
| Rate limiting or account suspension | High | Low | Message queuing; stay within limits; monitor account health |
| Low adoption | Medium | Medium | Partner with local fact-checkers; wa.me deep links; social media |
| Meta policy changes | Medium | Medium | Maintain task-oriented focus; monitor policy; avoid feature creep |

### 9.1 Critical Risk: Meta AI Chatbot Ban

Meta's January 2026 policy prohibits "general-purpose AI chatbots" on WhatsApp Business Platform. ForwardCheck-AI must be positioned as:

**Permitted (task-oriented automation):**
- Specific, narrow function: fact-checking forwarded claims
- Not a general-purpose assistant
- Clear social good: combating misinformation
- Same category as customer service bots

**Mitigation strategies:**
1. Describe as "misinformation detection tool" in Business Profile
2. Reject non-fact-checking queries ("I can only fact-check claims. Please forward a message you'd like me to verify.")
3. Partner with IFCN-certified fact-checking organization
4. Apply for API access early, fully disclosing the AI-powered use case
5. Maintain strict scope — no general conversation

---

## 10. Success Metrics

### Launch (90 days)

| Metric | Target |
|--------|--------|
| Unique WhatsApp users | 500 |
| Claims investigated | 2,000 |
| Average response time | < 3 minutes |
| 7-day retention | 30% |
| Error rate | < 5% |

### Growth (6 months)

| Metric | Target |
|--------|--------|
| Monthly active users | 5,000 |
| Claims/month | 15,000 |
| WhatsApp as % of volume | 40%+ |
| Cost per investigation | < $0.30 |
| Verdict accuracy | > 85% |

---

## 11. Recommendation: GO

The WhatsApp integration is recommended for immediate development based on:

1. **Massive market opportunity** — 3B users in regions where misinformation causes real harm
2. **Architecture is ready** — 80% of the codebase needs zero changes
3. **Cost model is favorable** — core messaging flow is free
4. **Competition is thin** — no comparable multi-agent fact-checking bot on WhatsApp
5. **Technical path is clear** — Cloud API + Express webhooks + platform adapter pattern
6. **Effort is manageable** — ~4 weeks to MVP with ~1,065 LOC new code

**Primary risk** is Meta's AI chatbot policy, which requires careful positioning as a task-oriented service. This risk is mitigable through strict scope enforcement and early engagement with Meta's review process.

**Recommended next steps:**
1. Start WhatsApp Business API registration immediately (1-3 week approval)
2. Begin Phase 1 (platform abstraction) in parallel
3. Legal review of Meta's Business Messaging Policy
4. Identify IFCN partnership opportunities

---

## Appendix A: Research Documents

- [WhatsApp Platform Research](research/whatsapp-platform-research.md) — API, libraries, pricing, policies
- [Architecture Assessment](research/architecture-assessment.md) — Codebase analysis, adapter design, effort estimate
- [Product Requirements](research/product-requirements.md) — Market analysis, user stories, compliance, rollout plan

---

*Generated by ForwardCheck-AI team: Product Manager, WhatsApp Bot Expert, Software Architect — February 19, 2026*
