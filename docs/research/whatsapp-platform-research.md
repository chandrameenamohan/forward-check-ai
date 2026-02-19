# WhatsApp Platform Research for ForwardCheck-AI

**Date:** 2026-02-19
**Purpose:** Evaluate WhatsApp as a second messaging channel for ForwardCheck-AI fact-checking bot

---

## Table of Contents

1. [WhatsApp Business API vs Cloud API](#1-whatsapp-business-api-vs-cloud-api)
2. [Node.js/TypeScript Libraries](#2-nodejstypescript-libraries)
3. [Message Types Supported](#3-message-types-supported)
4. [Forwarded Message Detection](#4-forwarded-message-detection)
5. [Rate Limits & Approval Process](#5-rate-limits--approval-process)
6. [Webhook Setup & Hosting](#6-webhook-setup--hosting)
7. [End-to-End Encryption Implications](#7-end-to-end-encryption-implications)
8. [Unofficial vs Official Libraries](#8-unofficial-vs-official-libraries)
9. [Meta Bot Policies & Restrictions](#9-meta-bot-policies--restrictions)
10. [Pricing](#10-pricing)
11. [Key Recommendations for ForwardCheck-AI](#11-key-recommendations-for-forwardcheck-ai)

---

## 1. WhatsApp Business API vs Cloud API

### Current State (2026)

The On-Premises WhatsApp Business API was officially deprecated in October 2025. **Meta Cloud API is now the only supported architecture.** All new integrations must use the Cloud API.

| Aspect | Cloud API (current) | On-Premises API (deprecated) |
|---|---|---|
| Hosting | Meta-hosted | Self-hosted or BSP-hosted |
| Status | **Active, sole option** | Deprecated Oct 2025 |
| Setup | Free, via Meta Developer Portal | Required BSP partnership |
| Throughput | Up to 500 msg/sec (upgradeable to 1,000) | Varied by infrastructure |
| Updates | Automatic from Meta | Manual upgrades |
| Cost | Free API access; pay per template message | BSP fees + infrastructure |

### Bottom Line

There is no longer a choice between the two. **Cloud API is the only path.** This simplifies the decision for ForwardCheck-AI.

---

## 2. Node.js/TypeScript Libraries

### Option A: Official Meta WhatsApp Node.js SDK

- **Package:** `whatsapp` (npm)
- **Repo:** [WhatsApp/WhatsApp-Nodejs-SDK](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)
- **Status: ARCHIVED (June 2023).** No longer maintained.
- Written in TypeScript with full declaration files
- Covered sending messages, webhook handling, media uploads
- **Not recommended for new projects** due to abandonment

### Option B: Baileys (WhiskeySockets/Baileys)

- **Package:** `baileys` (npm)
- **Repo:** [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
- Pure TypeScript/JavaScript implementation of WhatsApp Web protocol
- Uses WebSocket directly (no browser/Selenium needed)
- MIT licensed, actively maintained (v7.0.0+ with breaking changes)
- Multi-device (MD) support
- Requires Node 17+
- **Unofficial** -- connects via WhatsApp Web protocol, not the official Cloud API

### Option C: whatsapp-web.js

- **Package:** `whatsapp-web.js` (npm)
- Puppeteer-based (requires headless browser)
- Apache-2.0 licensed
- Slower and heavier than Baileys due to browser dependency
- **Unofficial** -- same protocol-level risks as Baileys

### Option D: Direct Cloud API Integration (HTTP)

- No SDK needed; use `fetch` / `axios` / `got` to call Meta's REST endpoints
- Full TypeScript types available via `@whatsapp-cloudapi/types` npm package
- Webhook receiver is a standard Express/Fastify HTTPS endpoint
- **This is what Meta recommends** since their official SDK is archived

### Recommendation for ForwardCheck-AI

**Direct Cloud API integration (Option D)** is the best choice:
- Official, compliant, and future-proof
- The existing Express 5 server in ForwardCheck-AI can serve as the webhook endpoint
- TypeScript types available via community packages
- Avoids unofficial library ban/disconnect risks
- Aligns with Meta's recommended approach

---

## 3. Message Types Supported

The WhatsApp Cloud API supports receiving and sending these message types:

### Incoming (Webhook)
| Type | Description |
|---|---|
| `text` | Plain text messages |
| `image` | JPEG, PNG, WEBP (max 5 MB) |
| `video` | MP4, 3GPP (max 16 MB) |
| `audio` | MP3, OGG, MP4, AAC (max 16 MB) |
| `document` | PDF, DOCX, ZIP, etc. (max 100 MB) |
| `sticker` | WebP stickers (max 100 KB) |
| `location` | Latitude/longitude coordinates |
| `contacts` | Contact cards (vCard) |
| `reaction` | Emoji reactions to existing messages |
| `button` | Button reply from interactive message |
| `interactive` | List/button reply messages |

### Outgoing (Send)
| Type | Description |
|---|---|
| Text | Plain text messages |
| Template | Pre-approved templates (bypass 24-hr window) |
| Interactive | Buttons, lists, product messages |
| Media | Image, video, audio, document, sticker |
| Reaction | Emoji reactions |
| Location | GPS coordinates |
| Contacts | Contact cards |

### Relevance to ForwardCheck-AI

ForwardCheck-AI primarily needs to handle **text messages** (forwarded claims). Image/media fact-checking would be a stretch goal. The text message type maps well to the existing Telegram `message.text` handler.

---

## 4. Forwarded Message Detection

This is **critical** for ForwardCheck-AI, since the bot's core UX is triggered by forwarded messages.

### Cloud API Webhook Context Object

When a user sends a message to a WhatsApp Business number, the webhook payload includes a `context` object on the message with these fields:

```json
{
  "messages": [{
    "context": {
      "forwarded": true,
      "frequently_forwarded": true,
      "from": "16315551234",
      "id": "wamid.HBgLMTY..."
    },
    "from": "16505551234",
    "id": "wamid.ID",
    "timestamp": "1234567890",
    "type": "text",
    "text": {
      "body": "This claim to fact-check..."
    }
  }]
}
```

| Field | Type | Description |
|---|---|---|
| `forwarded` | boolean | `true` if the message was forwarded |
| `frequently_forwarded` | boolean | `true` if forwarded 5+ times (viral) |
| `from` | string | Phone number of original sender (in replies) |
| `id` | string | Message ID being replied to |

### Key Difference from Telegram

- **Telegram:** `message.forward_origin` provides original sender/channel info, forward date
- **WhatsApp:** `context.forwarded` is a boolean flag only. **No original sender identity is provided for forwarded messages** due to privacy design. `frequently_forwarded` indicates viral spread (5+ forwards).

### Implications for ForwardCheck-AI

1. ForwardCheck-AI can detect forwarded messages via `context.forwarded`
2. The `frequently_forwarded` flag is a valuable signal -- viral claims are higher priority
3. Unlike Telegram, there is **no way to identify the original source** of a forwarded WhatsApp message -- the bot can only analyze the content itself
4. The Classifier agent needs to handle this gracefully (no source metadata available)

---

## 5. Rate Limits & Approval Process

### Messaging Tiers (Unique Contacts per 24 Hours)

| Tier | Limit | Requirements |
|---|---|---|
| Unverified | 250 contacts/day | Default for new accounts |
| Tier 1 | 1,000 contacts/day | Business verification |
| Tier 2 | 10,000 contacts/day | High quality + volume usage |
| Tier 3 | 100,000 contacts/day | Sustained high quality |
| Unlimited | No limit | Top-tier accounts |

### Tier Upgrade Criteria
- Maintain high quality rating (minimal blocks/complaints)
- Use at least 50% of current tier limit within 7 days
- Both criteria must be met simultaneously
- Upgrades happen automatically

### Message Throughput
- Default: **80 messages per second (MPS)** per phone number
- Upgradeable to **1,000 MPS** for eligible accounts
- Cloud API handles up to **500 msg/sec** at infrastructure level

### Template Message Approval
- Template messages must be submitted and approved by Meta
- Review takes hours to days
- Templates support dynamic parameters (headers, body, buttons)
- Template categories: marketing, utility, authentication

### Registration Process
1. Create Meta Business Manager account at business.facebook.com
2. Create a Meta App with WhatsApp product enabled
3. Verify business identity (legal docs, 1-15 business days)
4. Register a phone number (must NOT already be on WhatsApp)
5. Verify phone via SMS/voice call (6-digit code)
6. Submit display name for approval
7. Configure webhook URL and verification token
8. Submit message templates for approval

### Timeline Expectations
- Account setup: 1-2 hours
- Business verification: 1-15 business days
- Display name approval: 1-3 business days
- Template approval: Hours to days

---

## 6. Webhook Setup & Hosting

### Requirements

1. **HTTPS endpoint** with a valid SSL certificate (required)
2. **Publicly accessible URL** (e.g., `https://yourdomain.com/webhook/whatsapp`)
3. **Fast response time** (<200 ms recommended; acknowledge with 200 OK immediately)
4. **Verification challenge support** (GET endpoint for initial setup)

### Verification Flow

Meta sends a GET request to your callback URL with:
- `hub.mode` = `subscribe`
- `hub.verify_token` = your chosen secret
- `hub.challenge` = a random string

Your endpoint must verify the token matches and return `hub.challenge` as the response body.

### Webhook Payload Delivery

Meta sends POST requests with JSON payloads containing:
- `object`: always `"whatsapp_business_account"`
- `entry[].changes[].value.messages[]`: array of incoming messages
- `entry[].changes[].value.statuses[]`: delivery status updates
- `entry[].changes[].value.metadata`: phone number info

### Compatibility with ForwardCheck-AI

ForwardCheck-AI already runs an **Express 5 server** with webhook handling for Telegram (via grammY). Adding a WhatsApp webhook endpoint is straightforward:
- Add a new route (e.g., `/webhook/whatsapp`)
- Implement GET handler for verification challenge
- Implement POST handler for incoming messages
- The existing Railway deployment provides HTTPS by default

---

## 7. End-to-End Encryption Implications

### How It Works

- WhatsApp uses the **Signal Protocol** (Double-Ratchet algorithm)
- All personal messages are end-to-end encrypted by default
- **Cloud API messages**: encrypted during transit via Signal protocol, then **decrypted by Meta's Cloud API for processing**, then re-encrypted for delivery to the business

### What This Means for Bots

| Aspect | Impact |
|---|---|
| Message content | Fully accessible to the bot via webhook payloads |
| Media files | Downloadable via Cloud API media endpoints |
| Message storage | Meta temporarily stores messages for up to 30 days for delivery |
| Meta access | Meta states they cannot read message content during transit or storage |
| Business responsibility | Business must handle data according to privacy regulations |
| Compliance | GDPR, CCPA, and local regulations apply to stored message data |

### Key Takeaway

**E2E encryption does NOT prevent the bot from reading messages.** The Cloud API decrypts messages for business consumption. ForwardCheck-AI will receive full plaintext message content, exactly like it does with Telegram.

However, businesses must be transparent about data processing (privacy policy) and handle data responsibly, especially under GDPR.

---

## 8. Unofficial vs Official Libraries -- Comparison

| Factor | Official Cloud API (Direct HTTP) | Baileys (Unofficial) | whatsapp-web.js (Unofficial) |
|---|---|---|---|
| **Compliance** | Fully compliant | Violates ToS | Violates ToS |
| **Reliability** | Enterprise-grade, SLA | Frequent disconnects | Browser dependency |
| **Ban risk** | None | Account ban possible | Account ban possible |
| **Cost** | Per-message pricing | Free | Free |
| **Scalability** | 80-1000 MPS | Limited by WA Web | Limited by browser |
| **TypeScript** | Types via community pkg | Native TypeScript | JavaScript w/ types |
| **Setup** | Business verification needed | Just phone number | Just phone number |
| **Media handling** | Full support | Full support | Full support |
| **Forwarded detection** | `context.forwarded` field | Protocol-level access | Protocol-level access |
| **Maintenance** | Meta-maintained infra | Community-maintained | Community-maintained |
| **WhatsApp protocol changes** | Transparent | Breaking changes | Breaking changes |

### Verdict

**For ForwardCheck-AI, the official Cloud API is the only viable option:**
- No risk of account bans
- Proper business verification builds user trust
- Compliant with Meta policies
- Production-grade reliability
- Already have Express server infrastructure

Unofficial libraries are suitable only for personal projects, prototyping, or low-risk scenarios.

---

## 9. Meta Bot Policies & Restrictions

### CRITICAL: General-Purpose AI Chatbot Ban (Effective Jan 15, 2026)

Meta has banned "general-purpose AI chatbots" from the WhatsApp Business Platform:

**What is BANNED:**
- Open-ended or assistant-style AI interactions (ChatGPT-style)
- Bots where AI/LLM is the "primary functionality"
- General-purpose AI assistants
- Research/question-answering bots with no specific business context

**What is ALLOWED:**
- Customer support and FAQ bots
- Order tracking and notifications
- Booking confirmations and appointment reminders
- Lead qualification
- **Business-specific AI tools** where AI is "incidental or ancillary"

### Impact on ForwardCheck-AI

This is the **most significant risk** for a WhatsApp integration. ForwardCheck-AI is an AI-powered fact-checking tool. The key question is whether Meta would classify it as:

- **Prohibited:** A general-purpose AI assistant that answers arbitrary questions
- **Permitted:** A specific business tool (fact-checking service) with a defined, narrow use case

**Risk Assessment: MEDIUM-HIGH**

Arguments it could be **permitted**:
- It has a specific, narrow function (fact-checking forwarded claims)
- It is not a general-purpose assistant -- it does one thing
- Fact-checking is a defined service, not open-ended chat
- It serves a clear social good (combating misinformation)

Arguments it could be **prohibited**:
- AI/LLM is the primary functionality, not incidental
- It uses multiple AI agents to analyze and respond
- It could be seen as an "AI research assistant"
- Meta may enforce broadly to protect its own Meta AI

### Mitigation Strategies

1. **Position as a business service**, not an AI assistant
2. Frame as "misinformation detection tool" with a specific, narrow scope
3. Do not market as a chatbot -- market as a verification service
4. Consider partnering with a fact-checking organization (IFCN-certified)
5. Apply for WhatsApp Business API access early and disclose the use case
6. Have a human escalation path for ambiguous cases
7. Limit interactions to forwarded message analysis only (no general chat)

### Other Policy Requirements

- **24-hour messaging window**: Can only send free-form messages within 24 hours of user's last message. Outside this window, only template messages are allowed.
- **Opt-in required**: Users must explicitly opt in to receive messages
- **Template messages**: All proactive outbound messages must use pre-approved templates
- **No spam**: Automated bulk messaging is restricted
- **Privacy**: Must have a privacy policy; must comply with data protection laws

---

## 10. Pricing

### Current Model (Post-July 2025): Per-Message Billing

Meta charges per **delivered template message**. Service messages (user-initiated, within 24-hour window) are **free**.

| Category | Price Range (per message) | Notes |
|---|---|---|
| **Service (user-initiated)** | **FREE** | Within 24-hour window |
| Marketing | $0.02 - $0.22 | Varies by country |
| Utility | $0.004 - $0.046 | Volume discounts available |
| Authentication | $0.004 - $0.046 | OTP, verification codes |

### ForwardCheck-AI Cost Analysis

For ForwardCheck-AI, the cost model is favorable:
- **User sends forwarded message to bot** = user-initiated conversation = **FREE**
- **Bot replies with fact-check result** = within 24-hour window = **FREE**
- **Bot sends follow-up or proactive update** = may require template = paid

**Estimated cost: Near zero for core fact-checking flow**, since users initiate conversations and bot replies within the 24-hour window.

The only costs would be:
- Proactive follow-up messages (template messages, ~$0.01-$0.05 each)
- Marketing/engagement templates to re-engage users
- Anthropic API costs (same as Telegram channel)

### Volume Discounts
- Utility and authentication messages get automatic volume discounts at higher tiers
- 1M+ monthly messages can save 15-20%

### Free Messaging Opportunities
- Utility templates within an active 24-hour customer service window: **FREE**
- Messages from Click-to-WhatsApp ads: **FREE for 72 hours**

---

## 11. Key Recommendations for ForwardCheck-AI

### Go / No-Go Assessment

| Factor | Assessment |
|---|---|
| Technical feasibility | **HIGH** -- Cloud API is well-documented, Express integration is straightforward |
| Forwarded message detection | **GOOD** -- `context.forwarded` and `frequently_forwarded` fields available |
| Library/SDK | **CLEAR** -- Direct Cloud API (HTTP) with TypeScript types |
| Pricing | **FAVORABLE** -- User-initiated fact-checks are free |
| Encryption | **Non-issue** -- Bot receives full plaintext via Cloud API |
| Meta AI Bot Policy | **HIGH RISK** -- Potential classification as prohibited general-purpose AI |
| Registration timeline | **MEDIUM** -- 1-3 weeks for full business verification |

### Recommended Approach

1. **Library:** Direct HTTP integration with Meta Cloud API (no SDK needed)
2. **Architecture:** Add WhatsApp webhook route to existing Express server
3. **TypeScript types:** Use `@whatsapp-cloudapi/types` or define custom Zod schemas
4. **Deployment:** Same Railway instance as Telegram bot
5. **Policy compliance:** Position as narrow business tool; limit to forwarded message analysis only; no general chat

### Technical Architecture Alignment

The existing ForwardCheck-AI architecture maps well:

| Telegram Component | WhatsApp Equivalent |
|---|---|
| grammY middleware | Express route handler |
| `message.forward_origin` | `context.forwarded` boolean |
| `message.text` | `messages[0].text.body` |
| `bot.api.sendMessage()` | `POST /v21.0/{phone_id}/messages` |
| Bot token auth | Access token + webhook verify token |
| Long polling / webhook | Webhook only (POST to callback URL) |

### Critical Risk: Meta Bot Policy

The single biggest risk is Meta's January 2026 ban on general-purpose AI chatbots. ForwardCheck-AI must be carefully positioned as a **specific business service** (misinformation detection) rather than a general AI assistant. Recommend:
- Legal review of Meta's Business Messaging Policy
- Early engagement with Meta's business review team
- Partnership with an IFCN-certified fact-checking organization
- Strict scope limitation (only process forwarded messages, reject general queries)

---

## Sources

- [WhatsApp Cloud API Setup & Cost Guide 2026 - Chatarmin](https://chatarmin.com/en/blog/whatsapp-cloudapi)
- [WhatsApp Business API Integration 2026 - Chatarmin](https://chatarmin.com/en/blog/whats-app-business-api-integration)
- [WhatsApp Business API Pricing 2025 - Latenode](https://latenode.com/blog/integration-api-management/whatsapp-business-api/whatsapp-business-api-pricing-for-2025-understanding-costs-and-how-to-save)
- [WhatsApp API Pricing 2026 Update - EngageLab](https://www.engagelab.com/blog/whatsapp-api-pricing)
- [WhatsApp Cloud API vs Business API - ChakraHQ](https://chakrahq.com/article/whatsapp-cloud-api-different-busines-api-difference-explained/)
- [Baileys GitHub - WhiskeySockets](https://github.com/WhiskeySockets/Baileys)
- [WhatsApp Node.js SDK - Meta (ARCHIVED)](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)
- [Baileys Library Overview - Devzery](https://www.devzery.com/post/baileys-library-unofficial-whatsapp-web-api-for-typescript-js)
- [WhatsApp API Rate Limits - WATI](https://www.wati.io/en/blog/whatsapp-business-api/whatsapp-api-rate-limits/)
- [WhatsApp Rate Limits for Developers - Fyno](https://www.fyno.io/blog/whatsapp-rate-limits-for-developers-a-guide-to-smooth-sailing-clycvmek2006zuj1oof8uiktv)
- [Scale WhatsApp Cloud API Throughput - WUSeller](https://www.wuseller.com/whatsapp-business-knowledge-hub/scale-whatsapp-cloud-api-master-throughput-limits-upgrades-2026/)
- [WhatsApp Business API Pricing 2026 - FlowCall](https://flowcall.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp Pricing Update Jan 2026 - Authkey](https://authkey.io/blogs/whatsapp-pricing-update-2026/)
- [WhatsApp Pricing Changes July 2025 - CleverTap](https://clevertap.com/blog/whatsapp-business-pricing-changes-in-july-2025/)
- [Not All Chatbots Are Banned: WhatsApp 2026 AI Policy - Respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [WhatsApp Changes Terms to Bar General-Purpose Chatbots - TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/)
- [Meta Bans General-Purpose AI Chatbots on WhatsApp - Azguards](https://azguards.com/artificial-intelligence/what-metas-2026-whatsapp-chatbot-ban-means-for-businesses-explained/)
- [WhatsApp E2E Encryption - WhatsApp Help Center](https://faq.whatsapp.com/820124435853543)
- [WhatsApp Data Security & Encryption - Infobip](https://www.infobip.com/blog/whatsapp-data-security)
- [WhatsApp Cloud API Security 2026 - WUSeller](https://www.wuseller.com/whatsapp-business-knowledge-hub/whatsapp-cloud-api-security-2026-privacy-compliance-guide-for-business/)
- [WhatsApp Webhooks Implementation - Meta Business](https://business.whatsapp.com/blog/how-to-use-webhooks-from-whatsapp-business-api/)
- [WhatsApp Webhooks - ngrok](https://ngrok.com/docs/integrations/webhooks/whatsapp-webhooks)
- [WhatsApp API Prerequisites - WATI](https://www.wati.io/en/blog/whatsapp-api-prerequisites/)
- [WhatsApp Business API Setup Guide 2026 - WUSeller](https://www.wuseller.com/whatsapp-business-knowledge-hub/whatsapp-business-api-guide-2026-setup-verification/)
- [Supported Message Types - SleekFlow](https://help.sleekflow.io/en_US/whatsapp/supported-message-types-on-whatsapp-business-api-cloud-a)
