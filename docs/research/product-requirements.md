# ForwardCheck-AI: WhatsApp Channel — Product Requirements Document

**Author:** Product Manager
**Date:** February 19, 2026
**Status:** Draft for Review
**Stakeholders:** Engineering, Design, Operations

---

## 1. Executive Summary

ForwardCheck-AI should expand from Telegram to WhatsApp as its second messaging channel. WhatsApp has 3 billion monthly active users (3x Telegram's ~1 billion) and dominates the exact regions where misinformation spreads most virulently — India, Brazil, and Sub-Saharan Africa. The platform has been directly linked to real-world harm caused by viral misinformation, including mob violence in India and political disinformation in Brazil, creating both a massive market opportunity and a compelling social mission.

This document defines the product requirements, user experience design, cost model, compliance framework, and phased rollout plan for launching ForwardCheck-AI on WhatsApp.

---

## 2. Why WhatsApp? Market Opportunity

### 2.1 User Base Comparison

| Metric | WhatsApp | Telegram |
|--------|----------|----------|
| Monthly Active Users | 3.0 billion (Q1 2025) | ~1 billion (2026) |
| Daily Active Users | 2.3 billion | ~500 million |
| YoY Growth | 10% | 7% |
| Global Ranking | #1 messaging app | #3 messaging app |

### 2.2 Regional Dominance

WhatsApp is the primary communication platform in the regions most vulnerable to misinformation:

- **India:** 596.6 million MAU — the largest single-country user base. WhatsApp-fueled misinformation has led to over 40 documented lynchings since 2017.
- **Brazil:** 98.9% population penetration. Organized WhatsApp groups were weaponized for political disinformation during elections.
- **Sub-Saharan Africa:** 97% penetration in Kenya, 96% in South Africa, 95% in Nigeria. Organizations like Dubawa and Africa Check already operate WhatsApp fact-checking tiplines here.
- **Southeast Asia:** 87% of internet users in Indonesia use WhatsApp monthly. Asia-Pacific user growth is 7.2% annually.
- **Latin America & Southeast Asia:** Business account growth rates exceed 35%.

### 2.3 The Misinformation Problem on WhatsApp

WhatsApp's architecture makes it uniquely vulnerable to misinformation:

- **End-to-end encryption** prevents platform-level content moderation
- **Forwarding mechanics** enable rapid viral spread across groups
- **Group chats** create meso-communication spaces with high reach but low verification
- **Closed nature** shields content from fact-checkers and watchdogs
- Research found that **42% of right-wing viral items** in WhatsApp groups during a campaign period contained false information
- WhatsApp's own mitigations (forwarding limits, labels) address spread mechanics but not content verification

**Key insight:** WhatsApp users have no easy way to verify claims they receive. ForwardCheck-AI fills this gap by letting users forward suspicious messages to a dedicated number for AI-powered fact-checking — bringing the remedy directly to the platform where misinformation spreads.

---

## 3. User Stories

### 3.1 Primary User Flow

```
1. User receives suspicious forwarded message in a WhatsApp chat
2. User forwards that message to ForwardCheck-AI's WhatsApp number
3. Bot acknowledges receipt: "Investigating your claim... This may take 2-4 minutes."
4. Bot sends progress updates as the pipeline runs
5. Bot sends formatted verdict with confidence score, key findings, and sources
6. User can share the verdict back to the original chat
```

### 3.2 Core User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-1 | WhatsApp user | Forward a suspicious message to ForwardCheck-AI | I can check if it's true before sharing it |
| US-2 | WhatsApp user | Receive a clear verdict (true/false/partial) | I understand the claim's accuracy at a glance |
| US-3 | WhatsApp user | See key findings and sources | I can verify the reasoning myself |
| US-4 | WhatsApp user | Share the verdict with others | I can counter misinformation in my groups |
| US-5 | WhatsApp user | Send a URL to an article | I can fact-check news articles I receive |
| US-6 | WhatsApp user | Get a response in my language | I can use the service even if I don't speak English |
| US-7 | Group admin | Add ForwardCheck-AI to a group | Members can get automated fact-checks |
| US-8 | Returning user | Send another claim without re-onboarding | The experience is frictionless for repeat use |

### 3.3 Anti-Stories (Out of Scope for MVP)

- As a user, I do NOT expect general-purpose AI chat (prohibited by WhatsApp policy)
- As a user, I do NOT expect image/video fact-checking (text-only MVP)
- As a user, I do NOT expect real-time streaming of investigation progress (WhatsApp has no edit-message API)

---

## 4. Feature Parity Analysis

### 4.1 Current Telegram Features

Based on codebase review (`src/bot/message-handler.ts`, `src/formatter/telegram-formatter.ts`):

| Feature | Telegram Implementation | WhatsApp Day 1 | Notes |
|---------|------------------------|-----------------|-------|
| Forward message to bot | `message.forward_origin` detection | Forward to number | Core flow — must have |
| Direct text claims | `message:text` handler | Text messages | Core flow — must have |
| URL detection & article reading | `detectUrl()` + extraction | Same pipeline | Must have |
| Progress status updates | `StatusUpdater` edits messages in-place | Sequential new messages | WhatsApp has no edit-message API |
| Rich verdict formatting | HTML with `<b>`, `<blockquote>` | WhatsApp markdown (*bold*, _italic_) | Requires new formatter |
| Confidence bar visualization | Unicode `buildBar()` — block chars | Plain text percentage + emoji | Simpler format needed |
| Inline keyboard buttons | `InlineKeyboard.url()` | CTA buttons or plain URL | WhatsApp interactive messages or link preview |
| "View Full Analysis" link | Inline keyboard URL button | CTA URL button or text link | Interactive message or plain link |
| "Watch Live Investigation" link | Inline keyboard URL button | Defer to Phase 2 | Low priority |
| /start command | Bot command handler | First-message auto-welcome | Triggered on first interaction |
| /bug and /feedback commands | Command handlers | Natural language ("report bug") | No slash commands on WhatsApp |
| Non-factual response | Plain text reply | Plain text reply | Direct parity |
| Claim caching | `ClaimCache` | Same backend service | Transparent |

### 4.2 Day 1 Must-Have Features

1. **Message ingestion** — Accept forwarded messages and direct text claims
2. **URL extraction and article reading** — Detect and process URLs in messages
3. **Full 6-agent pipeline** — Classifier, Strategist, Investigators, DA, Judge
4. **Formatted verdict delivery** — Adapted for WhatsApp's formatting capabilities
5. **Progress notifications** — New messages at key pipeline stages (not edits)
6. **Welcome message** — Auto-triggered on first interaction
7. **Claim caching** — Reuse cached results for duplicate claims
8. **Error handling** — Graceful timeout and error messages

### 4.3 Deferred Features

| Feature | Reason for Deferral | Target Phase |
|---------|--------------------|----|
| Live investigation streaming | Requires web UI deep link; WhatsApp can't edit messages | Phase 2 |
| Group bot functionality | Requires separate WhatsApp Business considerations | Phase 2 |
| Image/video fact-checking | Multimodal pipeline not yet built | Phase 3 |
| Multi-language support | Requires prompt localization | Phase 2 |
| Feedback/bug reporting | Need to design conversational flow (no commands) | Phase 2 |
| Verdict sharing templates | Formatted shareable cards | Phase 2 |

---

## 5. UX Differences: Telegram vs WhatsApp

### 5.1 Interaction Model

| Aspect | Telegram | WhatsApp |
|--------|----------|----------|
| Discovery | Search @BotName | Save phone number or scan QR |
| Onboarding | /start command | First message auto-welcome |
| Commands | /bug, /feedback, /start | No slash commands — conversational or button-based |
| Message editing | Bot can edit sent messages | No edit API — must send new messages |
| Rich formatting | HTML (`<b>`, `<i>`, `<blockquote>`) | WhatsApp markdown (`*bold*`, `_italic_`, `>quote`) |
| Inline buttons | `InlineKeyboard` with URL buttons | Interactive messages (button, list, CTA URL) |
| Message length | 4096 chars | ~4096 chars (similar) |
| Media messages | Photos, documents, stickers | Photos, documents, stickers, reactions |
| Bot identity | @username, profile photo | Business profile with verified badge |
| Group behavior | Bot responds to /commands or @mentions | Responds when mentioned or to all messages |

### 5.2 Key UX Adaptations Required

1. **Progress updates as separate messages:** Since WhatsApp has no message-edit API, the StatusUpdater pattern (edit in place) must be replaced with sequential status messages. Limit to 2-3 status messages to avoid spamming the user.

2. **WhatsApp-native verdict formatting:** Replace HTML formatting with WhatsApp markdown. The confidence bar visualization (`buildBar()`) should use simpler emoji + percentage format. Expandable blockquotes are not available — use condensed format.

3. **Conversational command handling:** Instead of `/bug` and `/feedback` commands, detect intent from natural language (e.g., "I want to report a bug" or "give feedback") or use WhatsApp interactive list messages with options.

4. **Welcome flow:** Replace `/start` with an automatic welcome message triggered when the user first messages the bot. Include clear instructions on how to use the service.

5. **CTA buttons for analysis links:** Use WhatsApp interactive CTA URL buttons instead of Telegram inline keyboards to link to the full web analysis.

---

## 6. Cost Analysis

### 6.1 Telegram vs WhatsApp Pricing

| Cost Factor | Telegram Bot API | WhatsApp Business API |
|-------------|-----------------|----------------------|
| API Access | Free | BSP hosting fees ($0-500/mo) |
| Sending messages | Free | $0 for service messages (user-initiated, within 24hr window) |
| Template messages | N/A | $0.004-$0.1365 per message depending on category and region |
| User-initiated window | N/A | 24 hours free (72 hours via ads) |
| Monthly platform fee | $0 | Varies by BSP |

### 6.2 ForwardCheck-AI Cost Model

**Critical insight:** ForwardCheck-AI's primary flow is user-initiated. The user forwards a message, and the bot responds within the 24-hour service window. Under WhatsApp's pricing model (effective July 1, 2025), **service messages within the 24-hour window are free**.

This means the core fact-checking flow has **zero WhatsApp messaging cost** — the user initiates, we respond within minutes.

**Costs are incurred only for:**
- Template messages (proactive outreach, re-engagement) — unlikely in MVP
- BSP hosting/infrastructure fees
- The existing Anthropic API costs for the 6-agent pipeline (~$0.15-0.50 per investigation)

### 6.3 Estimated Monthly Costs (MVP)

| Item | Cost |
|------|------|
| WhatsApp BSP (e.g., Twilio, 360dialog) | $0-150/mo |
| WhatsApp API messages (service, user-initiated) | $0 (free within 24hr window) |
| Anthropic API (at 1,000 investigations/mo) | $150-500/mo |
| Infrastructure (shared with Telegram) | $0 incremental |
| **Total incremental WhatsApp cost** | **~$150-650/mo** |

### 6.4 Cost Comparison

Telegram hosting is effectively free ($0 API cost). WhatsApp adds BSP fees but the core messaging flow is also free for user-initiated conversations. The dominant cost remains the Anthropic API pipeline, which is shared across channels.

---

## 7. Compliance & Policy

### 7.1 WhatsApp Business Messaging Policy

**Critical policy change (January 15, 2026):** Meta prohibits general-purpose AI chatbots on the WhatsApp Business Platform. However, ForwardCheck-AI is explicitly compliant because:

- It is a **task-oriented automation** (fact-checking), not a general-purpose chatbot
- It has a **specific, well-defined purpose** — verify factual claims
- It falls under the same category as customer service bots, which are explicitly permitted
- It does not attempt to be a general AI assistant

**Compliance checklist:**
- [ ] Register as a task-oriented service in WhatsApp Business account
- [ ] Clearly describe the bot's purpose in the Business Profile
- [ ] Implement opt-in flow before first interaction
- [ ] Provide opt-out mechanism ("stop", "unsubscribe")
- [ ] Respond only within 24-hour service windows for non-template messages
- [ ] Never send unsolicited marketing messages
- [ ] Rate-limit responses to avoid triggering spam detection

### 7.2 Opt-In Requirements

WhatsApp requires explicit user consent before messaging. For ForwardCheck-AI:

1. **Implicit opt-in:** User initiates by messaging the bot first (forwarding a claim). This constitutes opt-in per WhatsApp's policy.
2. **Website opt-in:** If we promote the service via web, collect phone numbers with explicit WhatsApp consent.
3. **Double opt-in:** Not required for user-initiated flows but recommended for any template-based re-engagement.

### 7.3 Message Template Approval

WhatsApp requires pre-approved templates for proactive messages. For MVP:
- No proactive messaging planned — user-initiated only
- Phase 2 may introduce templates for: investigation complete notifications, weekly claim roundups

---

## 8. Privacy & Data Handling

### 8.1 GDPR Considerations

| Requirement | Implementation |
|-------------|---------------|
| Lawful basis | Legitimate interest (user-initiated fact-check request) |
| Data minimization | Store only claim text, verdict, and anonymized metadata |
| Right to erasure | Implement data deletion endpoint |
| Data Processing Agreement | Required with BSP (WhatsApp Business Solution Provider) |
| EU data residency | Use BSP with EU data centers (Frankfurt or Ireland) |
| Consent records | Log opt-in timestamp and method |
| Privacy notice | Display in WhatsApp Business profile description |

### 8.2 WhatsApp-Specific Privacy

- **End-to-end encryption:** Messages between user and bot are encrypted in transit. However, once received by our server via the Business API, standard data protection applies.
- **Metadata:** WhatsApp collects metadata (device info, IP, usage patterns) independently. Our system should not store WhatsApp-specific metadata beyond what's needed for the service.
- **Phone numbers:** WhatsApp identifies users by phone number (unlike Telegram's user IDs). Implement phone number hashing/anonymization for analytics.
- **No message content storage beyond investigation:** Delete raw message content after investigation completes; retain only the claim text and verdict.

### 8.3 Data Handling Differences from Telegram

| Data Point | Telegram | WhatsApp |
|-----------|----------|----------|
| User identifier | Numeric user ID | Phone number (PII) |
| Message content | Encrypted (bot receives plaintext) | End-to-end encrypted (API receives plaintext) |
| User metadata | Username (optional) | Phone number, profile name |
| PII sensitivity | Low (opaque IDs) | High (phone numbers = PII) |
| Required protections | Standard | Phone number hashing, stricter retention policies |

---

## 9. Competitive Landscape

### 9.1 Existing WhatsApp Fact-Checking Services

| Service | Region | Approach | Strengths | Weaknesses |
|---------|--------|----------|-----------|------------|
| **Dubawa Chatbot** | Nigeria, West Africa | AI-powered claim verification via WhatsApp | Local context, 5-second response time, CJID backing | Regional focus only, limited to existing fact-check database |
| **Meedan Check Bot** | India, Brazil, Africa | Tipline infrastructure for fact-checkers | Deployed by AFP, Africa Check, BOOM, India Today; 5,700+ fact-checks | Primarily a tool for newsrooms, not consumer-facing |
| **WhatsApp + IFCN** | Global | IFCN-certified fact-checker directory | Official WhatsApp partnership, credibility | Directory only — users must search for local fact-checkers |
| **Perplexity on WhatsApp** | Global | General AI search | Strong AI, real-time web search | Banned under January 2026 general-purpose chatbot policy |

### 9.2 ForwardCheck-AI Differentiators

1. **Multi-agent adversarial pipeline:** 6 specialized AI agents including Devil's Advocate — no competitor uses adversarial verification
2. **Confidence decomposition:** Transparent breakdown of evidence strength, source reliability, claim complexity, counter-argument resilience
3. **Manipulation detection:** Identifies specific rhetorical techniques with severity scores
4. **Real-time investigation:** Full pipeline runs per claim rather than database lookups
5. **Cross-platform:** Same pipeline serves Telegram and WhatsApp — consistent quality
6. **Not a general-purpose chatbot:** Task-specific design means full WhatsApp policy compliance

---

## 10. Success Metrics & KPIs

### 10.1 Launch Metrics (First 90 Days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| WhatsApp users (unique phone numbers) | 500 | Analytics |
| Claims investigated via WhatsApp | 2,000 | Database count |
| Average response time | < 3 minutes | Pipeline duration logging |
| User retention (return within 7 days) | 30% | Phone number repeat analysis |
| Error/timeout rate | < 5% | Error logging |
| User satisfaction (post-verdict feedback) | 4.0/5.0 | In-chat feedback prompt |

### 10.2 Growth Metrics (6 Months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Monthly active users (WhatsApp) | 5,000 | Analytics |
| Claims investigated per month | 15,000 | Database count |
| Organic referral rate | 20% of new users | Attribution tracking |
| Cost per investigation | < $0.30 | Cost monitoring |
| WhatsApp as % of total volume | 40%+ | Channel attribution |

### 10.3 Quality Metrics

| Metric | Target |
|--------|--------|
| Verdict accuracy (spot-checked) | > 85% |
| False positive rate (true claims marked false) | < 5% |
| Pipeline completion rate | > 95% |
| Confidence calibration (predicted vs actual accuracy) | Within 10 points |

---

## 11. MVP Scope Definition

### 11.1 In Scope (Phase 1 - MVP)

1. WhatsApp Business API integration via BSP (Twilio or 360dialog)
2. User-initiated text message fact-checking (forward or direct)
3. URL detection and article content extraction
4. Full 6-agent investigation pipeline (shared with Telegram)
5. WhatsApp-formatted verdict messages (adapted formatting)
6. Progress notifications (2-3 messages during investigation)
7. Welcome message on first interaction
8. Claim caching (shared cache across channels)
9. Investigation database storage with channel attribution
10. Basic analytics (claims per channel, response times)
11. Error handling and graceful degradation

### 11.2 Out of Scope (MVP)

- Image/video/audio fact-checking
- Multi-language support
- Group chat integration
- Proactive messaging or re-engagement
- Live investigation streaming link
- Feedback/bug reporting flow
- Verdict sharing templates
- WhatsApp Business verified badge (requires Meta review)

### 11.3 Technical Requirements

- Platform-agnostic message adapter layer (abstract Telegram/WhatsApp differences)
- WhatsApp-specific message formatter (replacing `telegram-formatter.ts`)
- Webhook endpoint for WhatsApp Business API callbacks
- Phone number anonymization for storage and analytics
- WhatsApp message queue for rate limiting
- Shared pipeline with channel-aware status update mechanism

---

## 12. Phased Rollout Recommendation

### Phase 1: MVP Launch (Weeks 1-4)

**Goal:** Core fact-checking flow on WhatsApp with feature parity for the primary use case.

- Set up WhatsApp Business API account via BSP
- Implement platform adapter layer (abstract messaging interface)
- Build WhatsApp message formatter
- Implement webhook handler for incoming WhatsApp messages
- Wire to existing investigation pipeline
- Deploy to staging, test with internal team
- Limited beta with 50-100 users in a single region (suggest India or Nigeria — highest need)

**Exit criteria:** 100 successful investigations, < 5% error rate, < 3 min average response time.

### Phase 2: Feature Expansion (Weeks 5-8)

**Goal:** Improve UX and expand capabilities.

- Add conversational feedback flow (natural language bug/feedback reporting)
- Implement WhatsApp interactive messages (list messages, CTA buttons)
- Add "Share Verdict" formatted message templates
- Multi-language detection and response (start with Hindi and Portuguese)
- Live investigation link in verdict message
- Implement WhatsApp message templates for investigation-complete notifications (for sessions > 24hr)

**Exit criteria:** 500 active users, 30% 7-day retention, user satisfaction > 4.0.

### Phase 3: Scale & Group Support (Weeks 9-16)

**Goal:** Grow user base and support group use cases.

- WhatsApp group integration (bot responds when mentioned)
- Image forwarding support (OCR + fact-check pipeline)
- Regional number provisioning (local numbers for India, Brazil, Nigeria)
- WhatsApp Business verified badge application
- Advanced analytics dashboard (channel comparison, regional insights)
- Cost optimization (caching, pipeline efficiency)

**Exit criteria:** 5,000 active users, WhatsApp = 40%+ of total volume.

### Phase 4: Maturity (Months 4-6)

**Goal:** Platform maturity and partnerships.

- Partnerships with fact-checking organizations (IFCN, Africa Check, Dubawa)
- WhatsApp Flows for structured onboarding
- Audio/video fact-checking pipeline
- API for third-party integrations
- Localized content and regional misinformation databases

---

## 13. Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| WhatsApp rejects bot as "general-purpose AI" | High | Low | Document task-specific purpose; no open-ended chat capability; pre-apply for review |
| BSP costs exceed budget | Medium | Medium | Start with free tier; monitor per-message costs; optimize caching to reduce repeat investigations |
| Response time too slow for WhatsApp users | Medium | Medium | Target < 3 min; send progress messages; optimize pipeline parallelism |
| Phone number PII handling breach | High | Low | Hash phone numbers at ingestion; minimize retention; encrypt at rest |
| Low adoption in target markets | Medium | Medium | Partner with local fact-checkers; leverage WhatsApp's wa.me deep links; social media promotion |
| WhatsApp rate limiting or account suspension | High | Low | Implement message queuing; stay within Business API rate limits; monitor account health |
| Meta policy changes | Medium | Medium | Maintain task-oriented focus; avoid feature creep toward general AI; monitor policy updates |

---

## 14. Appendix: Architecture Requirements for Engineering

The following architectural requirements should inform the engineering specification:

1. **Platform Adapter Interface:** Abstract `MessagePlatform` interface that both Telegram and WhatsApp implement, enabling shared pipeline code.
2. **Channel-Aware Pipeline:** `InvestigateOptions` already has `telegramChatId` — generalize to `channelType` + `channelUserId` + `channelMessageId`.
3. **Formatter Strategy:** Replace direct `formatTelegramVerdict()` calls with a formatter factory that returns platform-appropriate formatters.
4. **Status Update Strategy:** Replace the edit-in-place `StatusUpdater` with a strategy pattern — Telegram edits, WhatsApp sends new messages.
5. **Webhook Handler:** New Express route for WhatsApp webhook verification and message callbacks.
6. **Phone Number Handling:** Hash phone numbers before storing in `investigation-repository`; never log raw phone numbers.

---

*This document is based on market research conducted February 19, 2026. All statistics and pricing data are current as of this date and should be verified before implementation decisions.*
