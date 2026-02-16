# ForwardCheck-AI Architecture Diagrams (Batch 2)

Diagrams 4-6 for the technical blog post, rendered in Anthropic engineering blog style.

---

## Diagram 4: Component Architecture

Shows the system's layered architecture from entry points through orchestration, agents, external services, and storage.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#f0f4f8', 'primaryTextColor': '#1e293b', 'primaryBorderColor': '#94a3b8', 'lineColor': '#64748b', 'secondaryColor': '#dbeafe', 'tertiaryColor': '#f8fafc', 'fontSize': '14px', 'fontFamily': 'system-ui, -apple-system, sans-serif'}}}%%
flowchart TB
    subgraph Entry["Entry Points"]
        TG["Telegram Bot"]
        WC["Web Chat"]
    end

    EX["Express Server"]

    subgraph Pipeline["Investigation Pipeline"]
        ORCH["Orchestrator"]
        AR["Agent Runner"]
    end

    subgraph Agents["Agent Layer"]
        CL["Classifier\nHaiku"]
        ST["Strategist\nOpus"]
        SV["Source Verifier\nSonnet"]
        DE["Domain Expert\nSonnet"]
        PM["Pattern Matcher\nSonnet"]
        DA["Devil's Advocate\nOpus"]
        JG["Judge\nOpus"]
    end

    subgraph External["External Services"]
        BS["Brave Search"]
        GF["Google FactCheck"]
    end

    CLAUDE["Claude API"]

    subgraph Storage["Persistence"]
        DB[("SQLite")]
        CACHE["Claim Cache"]
    end

    TG --> EX
    WC --> EX
    EX --> ORCH
    ORCH --> AR
    ORCH --> CACHE
    ORCH --> DB

    AR --> CL
    AR --> ST
    AR --> SV
    AR --> DE
    AR --> PM
    AR --> DA
    AR --> JG

    SV --> BS
    DE --> BS
    PM --> GF

    CL --> CLAUDE
    ST --> CLAUDE
    SV --> CLAUDE
    DE --> CLAUDE
    PM --> CLAUDE
    DA --> CLAUDE
    JG --> CLAUDE

    style Entry fill:#dbeafe,stroke:#94a3b8,color:#1e293b
    style Pipeline fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style Agents fill:#f8fafc,stroke:#94a3b8,color:#1e293b
    style External fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style Storage fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style CLAUDE fill:#dbeafe,stroke:#3b82f6,color:#1e293b
    style DB fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
```

---

## Diagram 5: Confidence Gates

Confidence decomposition feeds into `enforceConfidenceGates()`, which validates category-confidence alignment and applies nuance tags.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#f0f4f8', 'primaryTextColor': '#1e293b', 'primaryBorderColor': '#94a3b8', 'lineColor': '#64748b', 'secondaryColor': '#dbeafe', 'tertiaryColor': '#f8fafc', 'fontSize': '14px', 'fontFamily': 'system-ui, -apple-system, sans-serif'}}}%%
flowchart LR
    subgraph Decomposition["Confidence Components"]
        D1["Evidence\nStrength\n0-100"]
        D2["Source\nReliability\n0-100"]
        D3["Claim\nComplexity\n0-100"]
        D4["Counter-Argument\nResilience\n0-100"]
    end

    GATE["enforceConfidenceGates()"]

    subgraph Verdicts["Verdict Categories"]
        V1["likely-true\n85-100"]
        V2["partially-true\n60-84"]
        V3["unverified\n30-59"]
        V4["likely-false\n0-29"]
    end

    subgraph Tags["Nuance Tags"]
        T1["misleading"]
        T2["out-of-context"]
        T3["exaggerated"]
        T4["fabricated"]
    end

    D1 --> GATE
    D2 --> GATE
    D3 --> GATE
    D4 --> GATE
    GATE --> Verdicts
    Verdicts -. "optional" .-> Tags

    style Decomposition fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style GATE fill:#dbeafe,stroke:#3b82f6,color:#1e293b
    style Verdicts fill:#f8fafc,stroke:#94a3b8,color:#1e293b
    style Tags fill:#f8fafc,stroke:#cbd5e1,stroke-dasharray:5 5,color:#64748b
```

---

## Diagram 6: Cost Model with Dynamic Escalation

Per-investigation cost flow with the dynamic escalation decision point: confidence spread > 30 triggers "max" effort path.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#f0f4f8', 'primaryTextColor': '#1e293b', 'primaryBorderColor': '#94a3b8', 'lineColor': '#64748b', 'secondaryColor': '#dbeafe', 'tertiaryColor': '#f8fafc', 'fontSize': '14px', 'fontFamily': 'system-ui, -apple-system, sans-serif'}}}%%
flowchart TD
    C1["Classifier\n$0.01"]
    C2["Strategist\n$0.20 - $0.50"]
    C3["3x Investigators\n$0.90 - $1.20"]

    SPREAD{"Confidence\nSpread > 30?"}

    NORM["Standard Path\nDA effort: high\n$0.50 - $1.00"]
    ESCA["Escalated Path\nDA effort: max\n+$0.50 - $1.00"]

    C5["Judge\n$1.00 - $2.00"]
    TOTAL["Total: $2.60 - $4.70"]

    C1 --> C2
    C2 --> C3
    C3 --> SPREAD

    SPREAD -- "No" --> NORM
    SPREAD -- "Yes" --> ESCA

    NORM --> C5
    ESCA --> C5

    C5 --> TOTAL

    style C1 fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style C2 fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style C3 fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style C5 fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style TOTAL fill:#dbeafe,stroke:#3b82f6,color:#1e293b
    style SPREAD fill:#fef3c7,stroke:#d97706,color:#1e293b
    style NORM fill:#f0f4f8,stroke:#94a3b8,color:#1e293b
    style ESCA fill:#fef3c7,stroke:#d97706,color:#1e293b
```
