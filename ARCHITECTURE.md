# ForwardCheck-AI — System Architecture

> Multi-agent fact-checking pipeline built with Claude Opus 4.6

---

## 1. System Context Diagram

```mermaid
graph TB
    subgraph External["External World"]
        User["👤 Telegram User"]
        Browser["🌐 Web Browser"]
        BraveAPI["Brave Search API"]
        GoogleFC["Google Fact Check API"]
        AnthropicAPI["Anthropic Claude API"]
    end

    subgraph System["ForwardCheck-AI"]
        Bot["Telegram Bot<br/>(Grammy)"]
        API["Express 5<br/>REST API"]
        Pipeline["Investigation<br/>Pipeline"]
        DB[("SQLite<br/>better-sqlite3")]
        Cache["In-Memory<br/>Claim Cache"]
    end

    User -->|"Forward message"| Bot
    Browser -->|"GET /v/:id"| API
    Bot -->|"Trigger investigation"| Pipeline
    API -->|"POST /api/investigate"| Pipeline
    Pipeline -->|"LLM calls"| AnthropicAPI
    Pipeline -->|"Web search"| BraveAPI
    Pipeline -->|"Fact-check lookup"| GoogleFC
    Pipeline -->|"Read/Write"| DB
    Pipeline -->|"Cache hit?"| Cache
    Pipeline -->|"Verdict HTML"| Bot
    API -->|"Verdict page"| Browser
    Bot -->|"Reply with verdict + link"| User

    style System fill:#1a1a2e,stroke:#e94560,stroke-width:2px,color:#fff
    style Pipeline fill:#0f3460,stroke:#e94560,stroke-width:2px,color:#fff
    style AnthropicAPI fill:#d4a574,stroke:#8b6914,stroke-width:2px,color:#000
    style DB fill:#16213e,stroke:#53a8b6,stroke-width:2px,color:#fff
```

---

## 2. High-Level Component Architecture

```mermaid
graph TB
    subgraph Ingress["Ingress Layer"]
        TG["Telegram Bot<br/>src/bot/bot.ts"]
        MH["Message Handler<br/>src/bot/message-handler.ts"]
        SU["Status Updater<br/>src/bot/status-updater.ts"]
        EX["Express Server<br/>src/server/app.ts"]
        VR["Verdict Route<br/>src/server/routes/verdict.ts"]
    end

    subgraph Orchestration["Orchestration Layer"]
        IP["InvestigationPipeline<br/>src/orchestrator/pipeline.ts"]
        AR["AgentRunner<br/>src/orchestrator/agent-runner.ts"]
    end

    subgraph Agents["Agent Layer — 6-Stage Pipeline"]
        CL["Classifier<br/>Haiku 4.5"]
        ST["Strategist<br/>Opus 4.6"]
        SV["Source Verifier<br/>Sonnet 4.5"]
        DE["Domain Expert<br/>Sonnet 4.5"]
        PM["Pattern Matcher<br/>Sonnet 4.5"]
        DA["Devil's Advocate<br/>Opus 4.6"]
        JG["Judge<br/>Opus 4.6"]
    end

    subgraph Services["Services Layer"]
        CC["ClaudeClient<br/>src/services/claude-client.ts"]
        CM["ClaimCache<br/>src/services/claim-cache.ts"]
    end

    subgraph Tools["Tool Layer"]
        TR["ToolRegistry<br/>src/tools/tool-registry.ts"]
        BS["BraveSearch<br/>src/tools/brave-search.ts"]
        GF["GoogleFactCheck<br/>src/tools/google-factcheck.ts"]
    end

    subgraph Data["Data Layer"]
        DB[("SQLite DB<br/>src/db/connection.ts")]
        MG["Migrations<br/>src/db/migrations.ts"]
        IR["InvestigationRepo<br/>src/db/investigation-repository.ts"]
    end

    subgraph Schemas["Validation Layer"]
        ZC["ClassifierSchema"]
        ZS["StrategySchema"]
        ZR["ReportSchema"]
        ZD["ChallengeSchema"]
        ZV["VerdictSchema"]
    end

    TG --> MH
    MH --> SU
    MH --> IP
    EX --> VR
    EX --> IP

    IP --> AR
    IP --> CM
    IP --> IR

    AR --> CL
    AR --> ST
    AR --> SV
    AR --> DE
    AR --> PM
    AR --> DA
    AR --> JG

    CL --> CC
    ST --> CC
    SV --> CC
    DE --> CC
    PM --> CC
    DA --> CC
    JG --> CC

    SV --> TR
    DE --> TR
    PM --> TR
    JG --> TR

    TR --> BS
    TR --> GF

    IR --> DB
    MG --> DB

    CL -.->|validates| ZC
    ST -.->|validates| ZS
    SV -.->|validates| ZR
    DE -.->|validates| ZR
    PM -.->|validates| ZR
    DA -.->|validates| ZD
    JG -.->|validates| ZV

    style Agents fill:#0f3460,stroke:#e94560,stroke-width:2px,color:#fff
    style Orchestration fill:#1a1a2e,stroke:#53a8b6,stroke-width:2px,color:#fff
    style Services fill:#16213e,stroke:#53a8b6,stroke-width:1px,color:#fff
    style Tools fill:#16213e,stroke:#d4a574,stroke-width:1px,color:#fff
    style Data fill:#16213e,stroke:#53a8b6,stroke-width:1px,color:#fff
```

---

## 3. Agent Pipeline — Data Flow

```mermaid
flowchart TD
    MSG["📨 Incoming Message"] --> CACHE{"Cache<br/>Hit?"}
    CACHE -->|"Yes"| CACHED["Return Cached Verdict<br/>Cost: $0.00"]
    CACHE -->|"No"| CL

    CL["🏷️ CLASSIFIER<br/>━━━━━━━━━━━━━━<br/>Model: Haiku 4.5<br/>Turns: 1 · No tools<br/>Cost: ~$0.01<br/>━━━━━━━━━━━━━━<br/>→ category, domain,<br/>  extractedClaim,<br/>  urgency"]

    CL -->|"opinion / scam /<br/>greeting / other"| NF["Quick Response<br/>(No investigation)"]
    CL -->|"factual_claim"| ST

    ST["🧠 STRATEGIST<br/>━━━━━━━━━━━━━━<br/>Model: Opus 4.6 ★<br/>Turns: 1 · Thinking: adaptive<br/>Cost: ~$0.20–0.50<br/>━━━━━━━━━━━━━━<br/>→ SearchStrategy:<br/>  claimCharacteristics,<br/>  investigatorGuidance,<br/>  falsificationCriteria"]

    ST --> PAR

    subgraph PAR["⚡ PARALLEL INVESTIGATION — Promise.allSettled()"]
        direction LR
        SV["🔍 SOURCE VERIFIER<br/>━━━━━━━━━━━━━━━━<br/>Sonnet 4.5 · 6 turns<br/>Tools: brave, factcheck<br/>~$0.30–0.40<br/>━━━━━━━━━━━━━━━━<br/>Find origins,<br/>verify credibility,<br/>locate debunks"]

        DE["🎓 DOMAIN EXPERT<br/>━━━━━━━━━━━━━━━━<br/>Sonnet 4.5 · 6 turns<br/>Tools: brave, factcheck<br/>~$0.30–0.40<br/>━━━━━━━━━━━━━━━━<br/>Check accuracy via<br/>authoritative sources<br/>for specific domain"]

        PM["🔄 PATTERN MATCHER<br/>━━━━━━━━━━━━━━━━<br/>Sonnet 4.5 · 6 turns<br/>Tools: brave, factcheck<br/>~$0.30–0.40<br/>━━━━━━━━━━━━━━━━<br/>Search Snopes,<br/>PolitiFact; ID<br/>misinfo patterns"]
    end

    PAR --> AGG["Aggregate AgentReports[]<br/>Compute confidence spread"]
    AGG --> DISAGREE{"Spread<br/>> 30?"}
    DISAGREE -->|"Yes"| DEEP["🔴 Deep Reasoning<br/>DA effort → max"]
    DISAGREE -->|"No"| NORMAL["DA effort → high"]
    DEEP --> DAV
    NORMAL --> DAV

    DAV["😈 DEVIL'S ADVOCATE<br/>━━━━━━━━━━━━━━━━━━<br/>Model: Opus 4.6 ★<br/>Turns: 1 · Thinking: adaptive<br/>Effort: high or max<br/>Cost: ~$0.50–1.00<br/>━━━━━━━━━━━━━━━━━━<br/>→ ChallengeReport:<br/>  challenges[],<br/>  counterArgumentSucceeded,<br/>  confidenceAdjustment"]

    DAV --> JDG

    JDG["⚖️ JUDGE<br/>━━━━━━━━━━━━━━━━━━<br/>Model: Opus 4.6 ★<br/>Turns: 5 max · Thinking: max<br/>Tools: brave (critical verify)<br/>Cost: ~$1.00–2.00<br/>━━━━━━━━━━━━━━━━━━<br/>4-Phase Protocol:<br/>1. Strategize<br/>2. Synthesize<br/>3. Evaluate<br/>4. Verdict"]

    JDG --> VERDICT

    VERDICT["📋 FINAL VERDICT<br/>━━━━━━━━━━━━━━━━<br/>category · confidence<br/>confidenceDecomposition<br/>keyFindings · sources<br/>manipulationTechniques<br/>devilsAdvocateOutcome<br/>whatWouldChangeMyMind"]

    VERDICT --> FMT["Format & Gate"]
    FMT --> OUT1["💬 Telegram Reply<br/>(HTML + View Full Analysis link)"]
    FMT --> OUT2["🌐 Web Verdict Page<br/>/v/:investigationId"]
    FMT --> STORE["💾 SQLite + Cache"]

    style CL fill:#2d6a4f,stroke:#95d5b2,stroke-width:2px,color:#fff
    style ST fill:#6a040f,stroke:#e85d04,stroke-width:2px,color:#fff
    style SV fill:#023e8a,stroke:#48cae4,stroke-width:2px,color:#fff
    style DE fill:#023e8a,stroke:#48cae4,stroke-width:2px,color:#fff
    style PM fill:#023e8a,stroke:#48cae4,stroke-width:2px,color:#fff
    style DAV fill:#6a040f,stroke:#e85d04,stroke-width:2px,color:#fff
    style JDG fill:#6a040f,stroke:#e85d04,stroke-width:2px,color:#fff
    style VERDICT fill:#3c096c,stroke:#c77dff,stroke-width:2px,color:#fff
    style PAR fill:#001d3d,stroke:#48cae4,stroke-width:1px,color:#fff
    style DEEP fill:#9d0208,stroke:#e85d04,stroke-width:2px,color:#fff
```

---

## 4. Three-Tier Model Strategy

```mermaid
graph TB
    subgraph Tier1["TIER 1 — Routing (Haiku 4.5)"]
        H1["Classifier Agent<br/>~$0.01/call · 1 turn · No tools<br/>Purpose: Fast categorization gate"]
    end

    subgraph Tier2["TIER 2 — Investigation (Sonnet 4.5)"]
        S1["Source Verification"]
        S2["Domain Expertise"]
        S3["Pattern Matching"]
        NOTE2["~$0.30–0.40/call · 6 turns · Web search tools<br/>Purpose: Parallel evidence gathering"]
    end

    subgraph Tier3["TIER 3 — Reasoning (Opus 4.6)"]
        O1["Strategist<br/>effort: medium"]
        O2["Devil's Advocate<br/>effort: high/max"]
        O3["Judge<br/>effort: max"]
        NOTE3["~$0.20–2.00/call · Extended thinking<br/>Purpose: Planning, adversarial analysis, final judgment"]
    end

    H1 -->|"factual_claim"| O1
    O1 -->|"guidance"| S1
    O1 -->|"guidance"| S2
    O1 -->|"guidance"| S3
    S1 -->|"report"| O2
    S2 -->|"report"| O2
    S3 -->|"report"| O2
    O2 -->|"challenge"| O3

    style Tier1 fill:#2d6a4f,stroke:#95d5b2,stroke-width:2px,color:#fff
    style Tier2 fill:#023e8a,stroke:#48cae4,stroke-width:2px,color:#fff
    style Tier3 fill:#6a040f,stroke:#e85d04,stroke-width:2px,color:#fff
```

---

## 5. Data Model — Entity Relationships

```mermaid
erDiagram
    INVESTIGATION {
        text id PK "nanoid()"
        text original_message "Raw user input"
        text extracted_claim "From Classifier"
        text status "pending|investigating|completed|completed_non_factual"
        json classifier_result "ClassifierResult"
        json search_strategy "SearchStrategy"
        json agent_reports "AgentReport[]"
        json challenge_report "ChallengeReport"
        json final_verdict "FinalVerdict"
        text telegram_chat_id FK "nullable"
        text telegram_message_id FK "nullable"
        text created_at "ISO datetime"
        text completed_at "nullable"
        real total_cost_usd "Accumulated API cost"
        integer pipeline_duration_ms "End-to-end latency"
    }

    CLASSIFIER_RESULT {
        text category "factual_claim|opinion|scam|greeting|other"
        text extractedClaim
        boolean isCompound
        text domain "public_health|geopolitics|economics|science|technology|general"
        text language "ISO 639-1"
        text urgency "low|medium|high"
        text reasoning
    }

    SEARCH_STRATEGY {
        json claimCharacteristics "type, pattern, assessment"
        json investigatorGuidance "3 role-specific plans"
        json falsificationCriteria "proveTrue[], proveFalse[]"
        text thinkingExcerpt "Strategist reasoning visible to user"
    }

    AGENT_REPORT {
        text agentRole "source_verification|domain_expertise|pattern_matching"
        text summary "max 800 chars"
        json findings "Finding[] with sources"
        json manipulationIndicators "string[]"
        text overallAssessment
        integer confidenceScore "0-100"
    }

    CHALLENGE_REPORT {
        json challenges "Challenge[] targeting agents"
        boolean counterArgumentSucceeded
        integer suggestedConfidenceAdjustment "-30 to +30"
        text counterArgumentSummary
        text overallAssessment
        text thinkingExcerpt "DA reasoning visible to user"
    }

    FINAL_VERDICT {
        text category "likely-true|partially-true|unverified|likely-false|satire|opinion"
        text nuanceTag "misleading|out-of-context|exaggerated|fabricated|recirculated|scam"
        integer confidence "0-100 truthfulness"
        json confidenceDecomposition "4 sub-scores"
        json manipulationTechniques "technique, severity, quote"
        json keyFindings "string[]"
        json sources "url, title, relevance"
        text summary "max 500 chars"
        text reasoning
        text whatWouldChangeMyMind
        text devilsAdvocateOutcome "failed|partially_succeeded|succeeded"
        boolean deepReasoningActivated
        text thinkingSummary "Judge reasoning visible to user"
    }

    INVESTIGATION ||--o| CLASSIFIER_RESULT : "stage 1"
    INVESTIGATION ||--o| SEARCH_STRATEGY : "stage 2"
    INVESTIGATION ||--o{ AGENT_REPORT : "stage 3 (x3)"
    INVESTIGATION ||--o| CHALLENGE_REPORT : "stage 4"
    INVESTIGATION ||--o| FINAL_VERDICT : "stage 5"
```

---

## 6. Sequence Diagram — Full Investigation Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant TG as Telegram Bot
    participant MH as Message Handler
    participant SU as Status Updater
    participant PL as Pipeline
    participant Cache as ClaimCache
    participant DB as SQLite
    participant CL as Classifier<br/>(Haiku)
    participant STR as Strategist<br/>(Opus)
    participant INV as Investigators<br/>(Sonnet x3)
    participant DA as Devil's Advocate<br/>(Opus)
    participant JDG as Judge<br/>(Opus)
    participant Brave as Brave Search
    participant GFCA as Google FactCheck

    User->>TG: Forward message
    TG->>MH: on("message:text")
    MH->>SU: create StatusUpdater
    SU-->>User: "🔍 Analyzing your message..."

    MH->>PL: investigate(message, chatId)
    PL->>Cache: get(message)
    alt Cache Hit
        Cache-->>PL: cached verdict
        PL-->>MH: InvestigateResult (cost: $0)
    else Cache Miss
        PL->>DB: create(message) → id

        rect rgb(45, 106, 79)
            Note over CL: STAGE 1 — Classification
            PL->>CL: runClassifier(message)
            CL-->>PL: ClassifierResult
            PL->>DB: updateClassifierResult()
        end

        alt Non-factual
            PL-->>MH: Quick response
        else Factual claim
            SU-->>User: "🧠 Planning investigation..."

            rect rgb(106, 4, 15)
                Note over STR: STAGE 2 — Strategy (Extended Thinking)
                PL->>STR: runStrategist(claim, classifierResult)
                Note right of STR: Thinking: adaptive<br/>Effort: medium
                STR-->>PL: SearchStrategy
                PL->>DB: updateSearchStrategy()
            end

            SU-->>User: "🔎 Searching for evidence..."

            rect rgb(2, 62, 138)
                Note over INV: STAGE 3 — Parallel Investigation
                par Source Verification
                    PL->>INV: runSourceVerification(claim, strategy)
                    INV->>Brave: brave_web_search(queries)
                    Brave-->>INV: results
                    INV->>GFCA: google_fact_check_search(query)
                    GFCA-->>INV: claims
                and Domain Expertise
                    PL->>INV: runDomainExpertise(claim, domain, strategy)
                    INV->>Brave: brave_web_search(queries)
                    Brave-->>INV: results
                and Pattern Matching
                    PL->>INV: runPatternMatching(claim, strategy)
                    INV->>Brave: brave_web_search(queries)
                    Brave-->>INV: results
                    INV->>GFCA: google_fact_check_search(query)
                    GFCA-->>INV: claims
                end
                INV-->>PL: AgentReport[] (3 reports)
                PL->>DB: updateAgentReports()
            end

            Note over PL: Disagreement detection:<br/>spread = max(conf) - min(conf)<br/>If > 30 → deep reasoning

            SU-->>User: "😈 Challenging findings..."

            rect rgb(106, 4, 15)
                Note over DA: STAGE 4 — Adversarial Challenge (Extended Thinking)
                PL->>DA: runDevilsAdvocate(claim, reports, criteria)
                Note right of DA: Thinking: adaptive<br/>Effort: high or max
                DA-->>PL: ChallengeReport
                PL->>DB: updateChallengeReport()
            end

            SU-->>User: "⚖️ Rendering final verdict..."

            rect rgb(106, 4, 15)
                Note over JDG: STAGE 5 — Final Judgment (Extended Thinking)
                PL->>JDG: runJudge(claim, reports, challenge, strategy)
                Note right of JDG: Thinking: max<br/>4-Phase Protocol
                opt Critical verification needed
                    JDG->>Brave: brave_web_search(query)
                    Brave-->>JDG: results
                end
                JDG-->>PL: FinalVerdict
            end

            PL->>DB: updateFinalVerdict(verdict, duration, cost)
            PL->>Cache: set(message, verdict)
        end
    end

    PL-->>MH: InvestigateResult
    MH-->>User: Verdict HTML + "View Full Analysis" button
    User->>TG: Click "View Full Analysis"
    TG-->>User: Link to /v/{id}
```

---

## 7. Tool Dispatch Architecture

```mermaid
flowchart LR
    subgraph Agents["Agent Layer"]
        SV["Source Verifier"]
        DE["Domain Expert"]
        PM["Pattern Matcher"]
        JG["Judge"]
    end

    subgraph Runner["Agent Runner Loop"]
        LOOP["1. Call Claude API<br/>2. Parse tool_use blocks<br/>3. Execute via registry<br/>4. Append tool_result<br/>5. Loop until end_turn"]
    end

    subgraph Registry["Tool Registry"]
        TR["ToolRegistry.execute()"]
    end

    subgraph Tools["External Tools"]
        BS["brave_web_search<br/>━━━━━━━━━━━━━━<br/>Input: query, count<br/>Output: results[]<br/>API: api.search.brave.com"]
        GF["google_fact_check_search<br/>━━━━━━━━━━━━━━<br/>Input: query<br/>Output: claims[]<br/>API: factchecktools.googleapis.com"]
    end

    subgraph Structured["Structured Output Tools"]
        SS["submit_strategy<br/>(Strategist only)"]
        SR["submit_report<br/>(Investigators only)"]
        SC["submit_challenge<br/>(DA only)"]
        SVD["submit_verdict<br/>(Judge only)"]
    end

    SV --> LOOP
    DE --> LOOP
    PM --> LOOP
    JG --> LOOP

    LOOP -->|"tool_use"| TR
    TR --> BS
    TR --> GF
    TR --> SS
    TR --> SR
    TR --> SC
    TR --> SVD

    style Registry fill:#3c096c,stroke:#c77dff,stroke-width:2px,color:#fff
    style Tools fill:#023e8a,stroke:#48cae4,stroke-width:2px,color:#fff
    style Structured fill:#2d6a4f,stroke:#95d5b2,stroke-width:2px,color:#fff
```

---

## 8. Deployment & Runtime Architecture

```mermaid
graph TB
    subgraph Process["Node.js Process (Single)"]
        subgraph Boot["Bootstrap — src/index.ts"]
            ENV["loadEnv()"]
            LOG["Pino Logger"]
            MIG["Run Migrations"]
        end

        subgraph Runtime["Runtime Components"]
            BOT["Grammy Bot<br/>(Long Polling)"]
            SRV["Express 5 Server<br/>:3000"]
            PIPE["InvestigationPipeline<br/>(singleton)"]
        end

        subgraph Shared["Shared Services"]
            CLIENT["ClaudeClient"]
            TOOLS["ToolRegistry"]
            REPO["InvestigationRepository"]
            CCACHE["ClaimCache"]
        end
    end

    subgraph Storage["Persistence"]
        SQLITE[("SQLite<br/>./data/forwardcheck.db")]
    end

    subgraph External["External APIs"]
        TGAPI["Telegram Bot API<br/>getUpdates (polling)"]
        CLAUDE["Anthropic API<br/>messages.create()"]
        BAPI["Brave Search API"]
        GAPI["Google Fact Check API"]
    end

    ENV --> LOG --> MIG
    MIG --> Runtime

    BOT <-->|"Long polling"| TGAPI
    CLIENT -->|"HTTPS"| CLAUDE
    TOOLS -->|"HTTPS"| BAPI
    TOOLS -->|"HTTPS"| GAPI

    BOT --> PIPE
    SRV --> PIPE
    PIPE --> CLIENT
    PIPE --> TOOLS
    PIPE --> REPO
    PIPE --> CCACHE
    REPO --> SQLITE

    subgraph Graceful["Graceful Shutdown"]
        SIG["SIGINT / SIGTERM"]
        SIG --> BOT
        SIG --> SRV
    end

    style Process fill:#1a1a2e,stroke:#e94560,stroke-width:2px,color:#fff
    style Storage fill:#16213e,stroke:#53a8b6,stroke-width:2px,color:#fff
    style External fill:#0f3460,stroke:#d4a574,stroke-width:1px,color:#fff
```

---

## 9. Cost Model & Escalation Path

```mermaid
flowchart TD
    subgraph CostPath["Per-Investigation Cost Breakdown"]
        C1["Classifier — Haiku 4.5<br/>~$0.01"]
        C2["Strategist — Opus 4.6<br/>~$0.20–0.50"]
        C3["3× Investigators — Sonnet 4.5<br/>~$0.90–1.20"]
        C4["Devil's Advocate — Opus 4.6<br/>~$0.50–1.00"]
        C5["Judge — Opus 4.6<br/>~$1.00–2.00"]
        TOTAL["TOTAL: ~$2.60–4.70 per investigation"]
    end

    C1 --> C2 --> C3 --> C4 --> C5 --> TOTAL

    subgraph Escalation["Dynamic Escalation"]
        SPREAD{"Confidence<br/>Spread > 30?"}
        NORM["Standard Path<br/>DA effort: high"]
        ESCA["Escalated Path<br/>DA effort: max<br/>deepReasoningActivated: true<br/>+$0.50–1.00 additional"]
    end

    C3 --> SPREAD
    SPREAD -->|"No"| NORM
    SPREAD -->|"Yes"| ESCA
    NORM --> C4
    ESCA --> C4

    style CostPath fill:#1a1a2e,stroke:#e94560,stroke-width:1px,color:#fff
    style TOTAL fill:#3c096c,stroke:#c77dff,stroke-width:2px,color:#fff
    style ESCA fill:#9d0208,stroke:#e85d04,stroke-width:2px,color:#fff
```

---

## 10. Confidence Gate & Verdict Category Matrix

```mermaid
graph LR
    subgraph Categories["Verdict Categories"]
        LT["likely-true<br/>Confidence: 70–100"]
        PT["partially-true<br/>Confidence: 40–80"]
        UV["unverified<br/>Confidence: 20–60"]
        LF["likely-false<br/>Confidence: 60–100"]
        SAT["satire<br/>Any confidence"]
        OP["opinion<br/>Any confidence"]
    end

    subgraph Nuance["Nuance Tags (optional overlay)"]
        N1["misleading"]
        N2["out-of-context"]
        N3["exaggerated"]
        N4["fabricated"]
        N5["recirculated"]
        N6["scam"]
    end

    subgraph Decomposition["Confidence Decomposition"]
        D1["evidenceStrength<br/>0–100"]
        D2["sourceReliability<br/>0–100"]
        D3["claimComplexity<br/>0–100 (higher = easier)"]
        D4["counterArgumentResilience<br/>0–100"]
    end

    subgraph Gate["enforceConfidenceGates()"]
        CHECK["Validate category ↔<br/>confidence alignment<br/>Detect mismatches<br/>Log warnings"]
    end

    D1 --> CHECK
    D2 --> CHECK
    D3 --> CHECK
    D4 --> CHECK
    CHECK --> Categories
    Categories -.-> Nuance

    style Gate fill:#3c096c,stroke:#c77dff,stroke-width:2px,color:#fff
    style Categories fill:#0f3460,stroke:#48cae4,stroke-width:1px,color:#fff
    style Nuance fill:#2d6a4f,stroke:#95d5b2,stroke-width:1px,color:#fff
```

---

## File Map

| Layer | Key Files | Responsibility |
|-------|-----------|----------------|
| **Entry** | `src/index.ts` | Bootstrap, wire dependencies, start services |
| **Bot** | `src/bot/bot.ts`, `message-handler.ts`, `status-updater.ts` | Telegram I/O, progress feedback |
| **API** | `src/server/app.ts`, `routes/verdict.ts` | REST endpoints, verdict web pages |
| **Pipeline** | `src/orchestrator/pipeline.ts` | End-to-end investigation orchestration |
| **Runner** | `src/orchestrator/agent-runner.ts` | Generic agent execution loop with timeout |
| **Agents** | `src/agents/classifier-agent.ts` | Haiku — fast routing |
| | `src/agents/strategist-agent.ts` | Opus — investigation planning |
| | `src/agents/investigators/source-verification-agent.ts` | Sonnet — origin & credibility |
| | `src/agents/investigators/domain-expertise-agent.ts` | Sonnet — domain-specific accuracy |
| | `src/agents/investigators/pattern-matching-agent.ts` | Sonnet — known misinfo patterns |
| | `src/agents/devils-advocate-agent.ts` | Opus — adversarial red-teaming |
| | `src/agents/judge-agent.ts` | Opus — final synthesis & verdict |
| **Services** | `src/services/claude-client.ts` | Anthropic SDK wrapper with cost tracking |
| | `src/services/claim-cache.ts` | In-memory dedup cache |
| **Tools** | `src/tools/tool-registry.ts`, `brave-search.ts`, `google-factcheck.ts` | External search dispatch |
| **Data** | `src/db/connection.ts`, `migrations.ts`, `investigation-repository.ts` | SQLite persistence |
| **Schemas** | `src/schemas/*.ts` | Zod validation for all agent outputs |
| **Formatter** | `src/formatter/telegram-formatter.ts` | HTML output, confidence gates |
| **Config** | `src/config/env.ts`, `logger.ts` | Environment, structured logging |
