# ForwardCheck AI — Demo Video Reverse-Engineered Scene Script

> **Source video:** `forwardcheck-ai-final-v1-bad-audio.mp4`
> **Remotion project:** `/Users/ralph/Projects/hello-world-video/forwardcheck-video/`
> **Duration:** 180s (3:00) | **Resolution:** 1920×1080 | **FPS:** 30 | **Total frames:** 5400
> **Audio:** voiceover_full.mp3 (186.39s with trailing silence) + music_bed.mp3 + coldopen_music.mp3 + SFX
> **VO verified:** ElevenLabs Scribe v1 transcription (word-level timestamps, 347 words)

---

## Video Architecture

### Composition

```
Root.tsx → ForwardCheckVideo.tsx → 6 Scene Components
```

| Property | Value |
|----------|-------|
| Composition ID | `ForwardCheckAI` |
| Duration | 5400 frames |
| FPS | 30 |
| Width | 1920 |
| Height | 1080 |

### Scene Map

| # | Scene Name | Component | Frames | Time Code | Duration |
|---|-----------|-----------|--------|-----------|----------|
| 1 | ColdOpen | `ColdOpenScene` | f0–f390 | 0:00–0:13 | 390f (13s) |
| 2 | TheSpread | `TheSpreadScene` | f390–f930 | 0:13–0:31 | 540f (18s) |
| 3 | TheSolution | `TheSolutionScene` | f930–f1125 | 0:31–0:37.5 | 195f (6.5s) |
| 4 | TheNewsroom | `TheNewsroomScene` | f1125–f3175 | 0:37.5–1:45.8 | 2050f (68.3s) |
| 5 | TheReveal | `TheRevealScene` | f3175–f4935 | 1:45.8–2:44.5 | 1760f (58.7s) |
| 6 | TheClose | `TheCloseScene` | f4935–f5400 | 2:44.5–3:00 | 465f (15.5s) |

### Fonts

| Font | Use | CSS |
|------|-----|-----|
| Merriweather | Serif quotes (ColdOpen) | `"Merriweather", Georgia, serif` |
| Inter | Sans-serif body text, headlines | `"Inter", -apple-system, sans-serif` |
| Fira Code | Monospace — pipeline labels, data, code | `"Fira Code", "SF Mono", monospace` |

### Color Palette

| Token | Hex | Use |
|-------|-----|-----|
| bg | `#0a0a0f` | Navy-charcoal primary background |
| black | `#000000` | True black — cold open only |
| red | `#E53E3E` | Lies, DA, corrections |
| gold | `#D4A843` | Truth, judge, confidence |
| teal | `#06B6D4` | Pipeline, investigation, classifier |
| purple | `#8B5CF6` | Strategist, complexity |
| green | `#22C55E` | Verified, found |
| amber | `#F59E0B` | Attributions |
| orange | `#F97316` | Investigator 3 |
| indigo | `#6366f1` | Gradient base |

---

## Scene 1: ColdOpen (f0–f390, 0:00–0:13)

**File:** `src/scenes/ColdOpen.tsx`
**VO:** None (silence + ambient)
**Music:** coldopen_music.mp3 — BBC news-style tension bed, fades in f0→f30 (0→0.15), holds, fades out f330→f390 (0.15→0)
**Music bed:** Sub-bass room tone at 0.03

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f0–f30 | 0:00–0:01 | `A FORWARDCHECK INVESTIGATION` | Top-left, monospace (Fira Code), uppercase, muted gray. Fades in then out. Timer `00:00` bottom-right (running timestamp counter, monospace gray). True black (#000000) background. |
| f30–f60 | 0:01–0:02 | Black hold | Title faded out, black holds. Ambient tension. |
| f60–f120 | 0:02–0:04 | Quote line 1 fades in | "A lie gets halfway around the world" — Merriweather serif, white85, typewriter animation (character by character). Centered left-aligned block. |
| f120–f180 | 0:04–0:06 | Quote line 2 fades in | "before the truth has a chance to get its pants on." — continues typewriter. |
| f180–f210 | 0:06–0:07 | Mark Twain attribution | "— attributed to Mark Twain" in muted amber/gray. |
| f210–f231 | 0:07–0:07.7 | Churchill slides in | "*And Churchill.*" — italic amber, slides in below Twain attribution. |
| f231–f255 | 0:07.7–0:08.5 | Swift slides in | "*And Jonathan Swift.*" — italic amber, slides in below Churchill. |
| f255–f315 | 0:08.5–0:10.5 | Red twist **CUTS IN** (instant) | **"No one actually knows who said it."** — red (#E53E3E), bold, appears INSTANTLY (no fade). Attributions dim to 15% opacity simultaneously. This IS the meta-commentary — the quote itself is misinformation. |
| f315–f350 | 0:10.5–0:11.7 | Kicker appears | "Which is exactly the point." — prior text dims. Gold (#D4A843) subtle kicker. Subtitle: "Minutes, not days" in gray below. |
| f350–f405 | 0:11.7–0:13.5 | Crossfade to TheSpread | Everything fades out over 40 frames. **Extended 15 frames** (to f405) for crossfade overlap into TheSpread. |

### Key Design Notes
- Pure black background (#000000), not navy-charcoal — only scene with true black
- Typewriter effect on the quote: characters appear sequentially
- The misattribution twist is the first "fact-check" — the video fact-checks its own opening quote
- Particle effects (subtle, gold-tinted) visible faintly

---

## Scene 2: TheSpread (f390–f930, 0:13–0:31)

**File:** `src/scenes/TheSpread.tsx`
**VO starts at f391** (13.02s) — first speech in the video

### Voiceover Lines (ElevenLabs verified)

| Frame | Time | VO Text |
|-------|------|---------|
| f400–f503 | 0:13.4–0:16.8 | "This message has been forwarded 600,000 times." |
| f504–f563 | 0:16.8–0:18.8 | "It takes four seconds to forward." |
| f564–f672 | 0:18.8–0:22.4 | "It takes a journalist four days to fact-check." |
| f675–f913 | 0:22.5–0:30.5 | "By then, 600,000 people have already believed it, already shared it, already told their **mother**." |

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f390–f420 | 0:13–0:14 | Section label | `THE CLAIM` — Fira Code 14px, red (#E53E3E) at 60%, uppercase, letter-spacing 2, top-left. Establishes "the claim's world" perspective. |
| f420–f480 | 0:14–0:16 | Dark with warm glow | Transition from black background to navy-charcoal (#0a0a0f) with subtle warm center glow. Particles appear. |
| f480–f600 | 0:16–0:20 | Phone multiplication grid | 9 Telegram "Forwarded Message" cards in a 3×3 grid, appearing with staggered animation. Each card: teal header bar "Forwarded Message", body text "Elon Musk just said 'AI will replace all programmers within 2 years.' He's already firing all Tesla engineers." Time: 2:34 PM. |
| f480,f510,f540,f570 | — | Phone ping SFX | `sfx_phone_ping1-4.mp3` at 0.15–0.20 volume, staggered with card appearances |
| f600–f700 | 0:20–0:23.3 | 600,000 forwards stat | Large centered text: **"600,000 forwards"** — massive white font (Inter, ~100px). Fades in with weight. |
| f700–f760 | 0:23.3–0:25.3 | Speed comparison card | Below the stat: "**4 seconds** to forward." (red accent on "4 seconds") / "**4 days** to fact-check." (gray on "4 days"). Small data overlay card, bottom-right: dark glass bg (rgba(18,18,26,0.85)), Fira Code 14px. |
| f760–f820 | 0:25.3–0:27.3 | Speed comparison bars | Two horizontal bars: Red long bar "4 sec" (animates to full width over 20f) / Gold tiny bar "4 days" (pops in with spring, 1/5760th width). Visual speed difference. |
| f810–f870 | 0:27–0:29 | Grandmother zoom | Single forwarded message card zooms to center. Below: avatar "Amma" with "reading" status. Grandmother character — makes it personal. |
| f870–f930 | 0:29–0:31 | Gold thesis text | "**sixty seconds**" in gold (#D4A843) — the promise. Or transition text. |

### Music
- f390–f600: Slight presence rise (0.05)
- f600–f810: Fade toward silence (0.05→0.00) — grandmother hold approach
- f810–f930: **POWER SILENCE #1** — grandmother + thesis (0.00)

### SFX
- f480, f510, f540, f570: Phone notification pings (staggered)
- f390: Transition whoosh (0.10 volume)

---

## Scene 3: TheSolution (f930–f1125, 0:31–0:37.5)

**File:** `src/scenes/TheSolution.tsx`

### Voiceover Lines (ElevenLabs verified)

| Frame | Time | VO Text |
|-------|------|---------|
| f915–f979 | 0:30.5–0:32.7 | "We built something that checks it in minutes, not days." |
| — | — | *2.4s silence gap* |
| f1051–f1113 | 0:35.1–0:37.1 | "This is Forward Check AI." |

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f930–f960 | 0:31–0:32 | Transition | Whoosh SFX. Music bed ENTERS — ramp from 0.00→0.35. Dramatic shift from silence to energy. |
| f960–f1000 | 0:32–0:33.3 | Telegram Desktop UI | ForwardCheck AI bot in Telegram Desktop. Left sidebar shows "ForwardCheck AI" chat. Right panel: The claim text as a sent message (blue bubble). Bot responds: "🔍 Investigating your claim..." / "Analysis in progress • • •" |
| f1000–f1060 | 0:33.3–0:35.3 | Bot response | Telegram Desktop view stays. "Investigating your claim..." with animated dots. This is the "how you use it" moment — paste a message, get an investigation. |
| f1060–f1125 | 0:35.3–0:37.5 | Transition to web | Fade/morph from Telegram Desktop view into the web chat interface. Establishes dual-interface (Telegram + Web). |

### Music
- f930–f990: Full music entrance ramp (0.00→0.35)
- f990–f1125: Steady under VO (0.35)

### SFX
- f930: Transition whoosh (0.10)

---

## Scene 4: TheNewsroom (f1125–f3175, 0:37.5–1:45.8)

**File:** `src/scenes/TheNewsroom.tsx`
**This is the longest scene** — 68.3 seconds covering the entire pipeline investigation.

### Voiceover Lines (ElevenLabs verified)

| Frame | Time | VO Text | Pipeline Phase |
|-------|------|---------|---------------|
| f1115–f1161 | 0:37.2–0:38.7 | "You forward it a message." | THE SEND |
| f1162–f1357 | 0:38.7–0:45.3 | "Behind it, six AI agents run an investigation, not one model answering a question." | |
| f1359–f1398 | 0:45.3–0:46.6 | "A newsroom." | |
| f1399–f1521 | 0:46.6–0:50.7 | "A desk editor reads the message, routes it, half a second." | CLASSIFIER |
| f1522–f1674 | 0:50.8–0:55.8 | "Then an Opus strategist plans the investigation, not search and summarize." | STRATEGIST |
| f1676–f1901 | 0:55.9–1:03.4 | "It defines what specific evidence would prove this true and what would prove it false before anyone searches anything." | |
| f1902–f2000 | 1:03.4–1:06.7 | "Three investigators fan out in parallel." | INVESTIGATORS |
| f2002–f2198 | 1:06.8–1:13.3 | "Source verification, domain expertise, pattern matching, each using Sonnet for speed." | |
| f2200–f2285 | 1:13.3–1:16.2 | "Now, the part no other system does." | DA + JUDGE |
| f2286–f2358 | 1:16.2–1:18.6 | "A devil's advocate receives every finding." | |
| f2358–f2443 | 1:18.6–1:21.4 | "Its only job: prove the investigation wrong." | |
| f2445–f2550 | 1:21.5–1:25.0 | "Opus, extended thinking, maximum effort." | |
| f2552–f2642 | 1:25.1–1:28.1 | "Finally, a judge, also Opus." | |
| f2659–f2801 | 1:28.7–1:33.4 | "It weighs the evidence, considers the challenge, and renders the verdict." | |
| — | 1:33.4–1:35.2 | *1.8s silence (verdict badge drop)* | |
| f2856–f3018 | 1:35.2–1:40.6 | "8% likely false, but that number alone isn't the point." | VERDICT |
| f3021–f3074 | 1:40.7–1:42.5 | "Most fact-checkers tell you what to think." | DIFFERENTIATOR |
| f3088–f3146 | 1:43.0–1:44.9 | "We show you how to think." | |

> **CRITICAL NOTE:** The actual VO has NO 28.4s silence gap. DA/Judge/Verdict VO all play during TheNewsroom scene (f1125–f3175). The Remotion code and VO_TIMESTAMP_ANALYSIS.md reference a gap that doesn't exist in the rendered video's audio.

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f1125–f1215 | 0:37.5–0:40.5 | Web chat + claim | Section label "THE INVESTIGATION" (teal, top area). Web chat interface: ForwardCheck header, claim text in input area, "Investigate This" button (green). Pipeline sidebar appears on right: INVESTIGATION checklist (Classify claim ✓, Write test criteria, Search sources (3), Challenge conclusion, Render verdict). LIVE badge (red) top-right with "Investigation: 00:03" timer. Bottom: step indicator "1/7 — Classifier reads the claim". Status log at bottom: `[00:03] Classifier → Claim categorized: TECH/AI PREDICTION` |
| f1215–f1450 | 0:40.5–0:48.3 | Pipeline diagram builds | "INVESTIGATION PIPELINE" header. Classifier card appears: icon + "Classifier" / "Reads the message. Routes it. Half a second." / `Haiku` badge (teal). Below: Strategist card: "Strategist" / "Writes the test before anyone searches." / `Opus 4.6` badge (purple). Step indicator: "2/7 — Strategist writes test criteria". Status log updates with timestamps. |
| f1450–f1700 | 0:48.3–0:56.7 | Classifier + Strategist activate | Pipeline checklist progresses: Classify claim ✓✓, Write test criteria ✓✓, Search sources (3) highlighted yellow. Right sidebar shows "Classifying claim..." → "Planning investigation..." → "Searching 3 sources...". Classifier ping SFX at f1450. |
| f1700–f1850 | 0:56.7–1:01.7 | 3 Investigators appear | Below Strategist in pipeline: "3 INVESTIGATORS — IN PARALLEL" label. Three cards side by side: Source Verification (Sonnet, teal), Domain Expertise (Sonnet, teal), Pattern Matching (Sonnet, orange). Each with icon + description. Right sidebar shows source search details: "Source Verification: Musk interviews & X posts" / "Domain Expertise: Tesla workforce records" / "Pattern Matching: Prior debunk databases". Strategist ping SFX at f1713. Triple ping SFX at f2070. |
| f1850–f2050 | 1:01.7–1:08.3 | DA + Judge appear | Devil's Advocate card: red border, "Devil's Advocate" / "Its only job: prove the investigation wrong." / `Opus 4.6` badge (red). Below: Judge card: gold border, "Judge" / "Weighs evidence against the challenge. Renders the verdict." / `Opus 4.6` badge (gold). Step indicator: "6/7 — Devil's Advocate challenges". Status log: `[00:20] Devil's Advocate → Challenging conclusion...` / `[00:23] Devil's Advocate → Counter-hypothesis: context stripping?` |
| f2050–f2115 | 1:08.3–1:10.5 | "Surface check" false security | **THE TURN moment**: Brief green text "SURFACE CHECK / Claim appears credible" overlays the pipeline — showing what a superficial check would say. This is quickly overridden by the real investigation results. |

### TheNewsroom Log Stream Entries

The `LogStream` component shows monospace scrolling investigation output at the bottom of the screen:

| Scene Frame | Global Frame | Log Entry |
|-------------|-------------|-----------|
| f330 | f1455 | `[00:03] Classifier → Claim categorized: TECH/AI PREDICTION` |
| f380 | f1505 | `[00:04] Classifier → Confidence: manipulative exaggeration pattern detected` |
| f600 | f1725 | `[00:06] Strategist → Generating falsification criteria...` |
| f680 | f1805 | `[00:08] Strategist → Test: "Find direct Musk quote matching claim"` |
| f750 | f1875 | `[00:09] Strategist → Test: "Verify Tesla engineering workforce data"` |
| f955 | f2080 | `[00:12] Source Verification → Searching Musk interviews and X posts...` |
| f990 | f2115 | `[00:15] Domain Expertise → Checking Tesla workforce records...` |
| f1020 | f2145 | `[00:17] Pattern Matching → Scanning prior debunk databases...` |
| f1090 | f2215 | `[00:20] Devil's Advocate → Challenging conclusion...` |
| f1130 | f2255 | `[00:23] Devil's Advocate → Counter-hypothesis: context stripping?` |
| f1170 | f2295 | `[00:25] Devil's Advocate → Finding: quote distorted from original` |
| f1210 | f2335 | `[00:30] Judge → Weighing evidence from 5 agents...` |
| f1280 | f2405 | `[00:32] Judge → Verdict rendered: LIKELY FALSE — 8% confidence` |
| f2115–f2322 | 1:10.5–1:17.4 | Pipeline completes | All checklist items checked. "Challenging findings..." → "Rendering verdict..." in sidebar. Judge renders: `[00:32] Judge → Verdict rendered: LIKELY FALSE — 8% confidence`. Pipeline holds with all nodes visible. **Note:** VO continues through this section (DA/Judge lines play during pipeline visuals). |
| f2322–f2835 | 1:17.4–1:34.5 | Pipeline hold → Verdict build | Full pipeline visible, all steps complete. VO continues with verdict/differentiator lines. Music tension slowly fades (0.30→0.25). Pipeline fading begins as verdict badge prepares to drop. |
| f2835–f2870 | 1:34.5–1:35.7 | **VERDICT BADGE DROP** | **Bass thud SFX** (sfx_bass_thud.mp3 at 0.5). Music drops to 0.05. |
| f2870–f3000 | 1:35.7–1:40 | Verdict result display | Web chat verdict page scrolls into view: "ForwardCheck AI" header. **"LIKELY FALSE"** — large red badge. **"TRUTH SCORE: 8"** — large red number in circular gauge. Below: "Eight percent. Likely false." / "But that number alone isn't the point." Evidence data cards appear staggered: "3 sources searched" (teal), "12 evidence fragments" (purple), "1 counter-hypothesis tested" (red). |
| f3000–f3175 | 1:40–1:45.8 | Verdict hold + transition | Verdict page remains visible. Music fades to silence (0.10→0.00). Transition whoosh at f3175 into TheReveal. |

### Music
- f1125–f1700: Steady under VO (0.35)
- f1700–f1850: Minor key shift (0.37) — investigators section
- f1850–f2322: Steady (0.35) — last VO before gap
- f2322–f2835: Tension during silence gap (0.30→0.25)
- f2835–f2870: Bass thud moment — drop to near-silence (0.05)
- f2870–f3000: Post-verdict quiet (0.10)
- f3000–f3175: Fade to silence (0.10→0.00)

### SFX
- f1125: Transition whoosh (0.10)
- f1125–f2850: Processing hum (0.03) — continuous ambient
- f1450: Classifier ping + check tick
- f1713: Strategist ping + check tick
- f2070: Triple ping + check tick (investigators)
- f2205, f2322: Check ticks (progress)
- f2850: **Bass thud** (0.5) — verdict drop

---

## Scene 5: TheReveal (f3175–f4935, 1:45.8–2:44.5)

**File:** `src/scenes/TheReveal.tsx`
**This is the analytical/emotional climax** — shows WHY the verdict is what it is.

### Voiceover Lines (ElevenLabs verified)

> **NOTE:** TheReveal scene starts at f3175 (1:45.8) — the VO is mid-sentence at this point, crossing the scene boundary.

| Frame | Time | VO Text | Content |
|-------|------|---------|---------|
| f3147–f3459 | 1:44.9–1:55.3 | "This message uses authority impersonation, urgency tactics, emotional manipulation, financial hope designed to bypass your critical thinking." | MANIPULATION ANALYSIS |
| f3462–f3546 | 1:55.4–1:58.2 | "This message exaggerates real statements." | |
| f3548–f3621 | 1:58.3–2:00.7 | "It manufactures false urgency." | |
| f3622–f3694 | 2:00.7–2:03.2 | "It strips context to shut off your brain." | |
| f3717–f3842 | 2:03.9–2:08.1 | "The falsification criteria, written before anyone searched." | FALSIFICATION |
| f3843–f3948 | 2:08.1–2:11.6 | "An official government gazette announcing this scheme." | |
| f3950–f3982 | 2:11.7–2:12.7 | "We looked." | |
| f3982–f4026 | 2:12.8–2:14.2 | "It doesn't exist." | |
| f4033–f4089 | 2:14.4–2:16.3 | "Find the original Musk quote matching the claim." | |
| f4095–f4303 | 2:16.5–2:23.5 | "This is Opus's actual thinking, the devil's advocate trying to argue the investigators got it wrong." | THINKING REVEAL |
| f4306–f4326 | 2:23.5–2:24.2 | "Read it." | |
| f4327–f4354 | 2:24.3–2:25.1 | "It tried." | DA CHALLENGE |
| f4355–f4385 | 2:25.2–2:26.2 | "It failed." | |
| f4387–f4441 | 2:26.2–2:28.0 | "Counterargument failed." | |
| f4443–f4540 | 2:28.1–2:31.3 | "That failure is our highest confidence signal." | CONFIDENCE |
| f4541–f4618 | 2:31.4–2:33.9 | "Not because a model said, 'I'm sure,'" | |
| f4619–f4729 | 2:34.0–2:37.7 | "because a model genuinely tried to prove itself wrong and couldn't." | |
| f4755–f4862 | 2:38.5–2:42.1 | "That's a fundamentally different kind of confidence." | |
| f4889–f4941 | 2:43.0–2:44.7 | "And it handles nuance." | NUANCE TRANSITION |

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f3175–f3300 | 1:45.8–1:50 | Differentiator headline | **"Most fact-checkers tell you what to think."** (white, Inter, bold, large) / **"We show you how to think."** (gold #D4A843, Inter, bold). Centered on dark background. Powerful statement of purpose. |
| f3300–f3600 | 1:50–2:00 | Manipulation annotation | Verdict page scrolling view. **"MANIPULATION TECHNIQUES DETECTED"** header. The original claim text displayed with red/orange annotation overlays: "MANIPULATIVE EXAGGERATION" circled around "AI will replace all programmers" / "APPEAL TO FEAR" circled around "nothing anyone can do about it" / "CONTEXT STRIPPING" circled around "He's already firing all Tesla engineers." Below: "It shows you **the machinery of the lie.**" (gold highlight). |
| f3600–f3800 | 2:00–2:06.7 | Falsification criteria | **"WHAT WOULD PROVE THIS WRONG"** header (purple). Card: "Opus 4.6 Strategist — pre-investigation criteria" label. Quote: *"Find the original Elon Musk statement where he says 'replace all programmers' — a verified interview, X post, or earnings call transcript matching the claim."* Below: "We looked. It doesn't exist." (muted gray). |
| f3800–f3860 | 2:06.7–2:08.7 | "THE TURN" label | Section label "THE TURN" in red (#E53E3E), 14px Fira Code, uppercase. Signals the DA challenge moment. |
| f3860–f4100 | 2:08.7–2:16.7 | DA thinking reveal | **"DEVIL'S ADVOCATE — EXTENDED THINKING"** header (red, with red dot indicator). Code-style card: "opus-4.6 / extended-thinking / max-tokens" label. Typewriter-animated text: "Let me challenge the conclusion that this claim is distorted." / "Could Musk have actually said 'replace all programmers'?" / "Checking: X posts, podcast appearances, Tesla earnings calls, any statement matching 'within 2 years'..." / "The word 'replace' is fabricated. Musk said 'things will move maybe more' — a qualified prediction, not a termination threat." / **"Counter-argument failed. The investigation stands."** (red, bold). |
| f4100–f4250 | 2:16.7–2:21.7 | DA kicker + conditional verdict | Below DA text: **"It tried to prove itself wrong. And couldn't."** (large text, "And couldn't." highlighted in gold/red). Conditional verdict card overlay: "What would need to be true?" (gold) / "→ Direct Musk quote matching claim — not found" (red) / "→ Tesla press release — not confirmed" (red) / "→ Counter-hypothesis tested — viral fabrication" (red). |
| f4250–f4500 | 2:21.7–2:30 | Confidence bars (small + large) | Top: Small confidence bars (Evidence Strength, Source Reliability, Claim Complexity, Counter-Argument Resilience) — thin horizontal bars. Center zoom: **"ANALYSIS CONFIDENCE"** with larger animated bars: Evidence Strength 93%→92%, Source Reliability 82%→88%, Claim Complexity (partial view)→95%, Counter-Argument Resilience→96%. Red (#E53E3E) bars. Right side: circular gauge "93% SYSTEM". Below: "Every score visible. Every score **you can check yourself.**" |
| f4500–f4626 | 2:30–2:34.2 | Confidence hold | Full confidence decomposition visible. 4 bars + system aggregate. Fading slightly. |
| f4626–f4935 | 2:34.2–2:44.5 | **EXTENDED SILENCE** | 10.23s of silence. Music rebuilds from 0.00→0.35 starting at f4626 ("sunrise rebuild"). The audience processes what they've seen. Visual may hold on confidence bars or slowly transition. |

### Music
- f3175–f4626: **EXTENDED SILENCE** (0.00) — VO is active but DA section demands zero music for weight
- f4626–f4720: Sunrise rebuild (0.00→0.35)
- f4720–f4935: Warm return (0.35)

### SFX
- f3175: Transition whoosh (0.08)
- f3735: Subtle check tick at "Read it." moment (0.04)

---

## Scene 6: TheClose (f4935–f5400, 2:44.5–3:00)

**File:** `src/scenes/TheClose.tsx`

### Voiceover Lines (ElevenLabs verified)

| Frame | Time | VO Text | Content |
|-------|------|---------|---------|
| f4942–f5001 | 2:44.7–2:46.7 | "This health claim isn't false." | NUANCE / SECOND INVESTIGATION |
| f5002–f5160 | 2:46.8–2:52.0 | "A real study exists, but the viral message turned possibly into definitely." | |
| f5163–f5238 | 2:52.1–2:54.6 | "Forward Check catches the distortion." | |
| f5239–f5400 | 2:54.7–3:00.0 | "We use Opus three times per investigation: planning, challenging, judging." | ARCHITECTURE |

> **NOTE:** The actual VO for TheClose is different from VOICEOVER_SCRIPT.md. Instead of confidence/architecture/dynamic reasoning/tagline, it covers nuance handling, a second investigation example, and the Opus architecture. The tagline "A lie gets halfway around the world in four seconds. We just gave truth a fighting chance." is **not present** in the actual audio.

### Visual Breakdown

| Frame Range | Time | On-Screen | Description |
|-------------|------|-----------|-------------|
| f4935–f4975 | 2:44.5–2:45.8 | Aggregate confidence card | Spring-entrance card: "System Confidence" label (gray, uppercase) / **"87%"** (gold, 48px, Fira Code) / "in analysis accuracy" (gray). Dark glass bg. Fades out by f4975. |
| f4945–f5130 | 2:44.8–2:51 | Confidence bars (full) | `ConfidenceBars` component with spring physics. 4 bars animated with stagger. Fades out at f5130. |
| f5060–f5100 | 2:48.7–2:50 | Parallel timeline recap | Two side-by-side cards: Left: "THE LIE / **4 seconds to forward**" (red text) / Right: "THE TRUTH / **Minutes to verify**" (gold text). Dark glass bg. Fira Code 14px. |
| f5130–f5305 | 2:51–2:56.8 | Tech architecture showcase | `TechShowcase` component. Second investigation speed-run: **"SECOND INVESTIGATION"** header. Claim: "WHO declares green tea cures cancer." Pipeline visualization: 7 agent icons in a row (Classify/Haiku → Plan/Opus → Search/Sonnet × 3 → Challenge/Opus → Judge/Opus) with `8× SPEED` badge. Progress bar: "60s / 60s". Verdict: **"PARTIALLY TRUE 45%"** (amber badge) + "EXAGGERATED" tag. Below: "A real study exists. But the viral message turned **'possibly'** into **'definitely.'**" / "ForwardCheck catches the distortion." |
| f5275–f5340 | 2:55.8–2:58 | Tagline build | **"ForwardCheck AI"** (72px, white, Inter bold). Rainbow gradient line below. **"Three Opus 4.6 calls per investigation."** (gold, 28px, typewriter). **"A lie travels in four seconds."** (white60, 30px). **"We gave truth a sixty-second head start."** (gold, 34px, bold). Below: "Every source cited. Every score visible. Built for you to verify." (gray, small). |
| f5325–f5400 | 2:58.8–3:00 | Brand card (final) | **"ForwardCheck AI"** (80px, white, spring entrance). Rainbow gradient line. **"@forward_check_opus_bot"** (teal, Fira Code). **"tinyurl.com/2akngqt7"** (gray). **"Built with Opus 4.6"** badge (gold border, glowing pulse). Two QR codes side by side: "WEB CHAT" (tinyurl.com/2akngqt7) + "TELEGRAM BOT" (@forward_check_opus_bot). Footer: "ID: x2fDe...w57rT | 242.8s processing | $1.47 cost" / "Demo investigation. Real pipeline." (gray, tiny). |

### Music
- f4935–f5100: Steady (0.35)
- f5100–f5140: Duck for Opus spotlight (0.35→0.15)
- f5140–f5220: DUCK — architecture VO (0.15)
- f5220–f5250: Rise for tagline (0.15→0.25)
- f5250–f5280: Post-tagline drop (0.25→0.10)
- f5280–f5395: Gentle fade (0.10→0.00)
- f5395–f5400: True silence (0.00)

### SFX
- f4935: Transition whoosh (0.10)

---

## Audio Architecture

### Audio Tracks (layered)

| Track | File | Start Frame | Duration | Role |
|-------|------|-------------|----------|------|
| Voiceover | `voiceover_full.mp3` | f0 | Full (186.39s, 347 words, speech at 13.4–180.0s) | Primary — always volume 1.0 |
| Cold open music | `coldopen_music.mp3` | f0 | f0–f390 | BBC tension bed, fades in/out |
| Music bed | `music_bed.mp3` | f0 | Full | Background, dynamically ducked |
| Bass thud | `sfx_bass_thud.mp3` | f2850 | 9 frames | Verdict badge impact |
| Phone pings 1-4 | `sfx_phone_ping1-4.mp3` | f480,510,540,570 | 2 frames each | Card multiplication |
| Classifier ping | `sfx_classifier_ping.mp3` | f1450 | 5 frames | Pipeline activation |
| Strategist ping | `sfx_strategist_ping.mp3` | f1713 | 6 frames | Pipeline activation |
| Triple ping | `sfx_triple_ping.mp3` | f2070 | 15 frames | Investigators activate |
| Check ticks | `sfx_check_tick.mp3` | f1450,1713,2070,2205,2322,3735 | 2 frames each | Progress markers |
| Processing hum | `sfx_processing_hum.mp3` | f1125 | 1725 frames | Ambient during investigation |
| Transition whoosh | `sfx_transition_woosh.mp3` | f390,930,1125,3175,4935 | 12 frames each | Scene transitions |

### Music Volume Curve (Key Points)

```
f0-390     (0:00-0:13)   0.03  — Sub-bass room tone (cold open)
f390-600   (0:13-0:20)   0.05  — Slight presence (VO begins)
f600-810   (0:20-0:27)   0.05→0.00  — Fade to silence
f810-930   (0:27-0:31)   0.00  — POWER SILENCE #1 (grandmother)
f930-990   (0:31-0:33)   0.00→0.35  — Full music entrance ramp
f990-1700  (0:33-0:57)   0.35  — Steady under VO
f1700-1850 (0:57-1:02)   0.37  — Minor key shift (investigators)
f1850-2322 (1:02-1:17)   0.35  — Steady
f2322-2835 (1:17-1:35)   0.30→0.25  — Tension during silence gap
f2835-2870 (1:35-1:36)   0.25→0.05  — Bass thud moment
f2870-3000 (1:36-1:40)   0.10  — Post-verdict quiet
f3000-3175 (1:40-1:46)   0.10→0.00  — Fade to silence
f3175-4626 (1:46-2:34)   0.00  — EXTENDED SILENCE (DA + reveal)
f4626-4720 (2:34-2:37)   0.00→0.35  — Sunrise rebuild
f4720-5100 (2:37-2:50)   0.35  — Warm return + confidence
f5100-5220 (2:50-2:54)   0.15  — Duck for architecture VO
f5220-5280 (2:54-2:56)   0.25→0.10  — Rise + drop
f5280-5395 (2:56-3:00)   0.10→0.00  — Gentle fade
f5395-5400 (3:00)         0.00  — True silence
```

---

## Known Issues (verified via ElevenLabs transcription)

### 1. NO 28.4s Silence Gap — VO is Continuous
**The VO_TIMESTAMP_ANALYSIS.md is wrong.** ElevenLabs transcription confirms the actual audio has no massive silence gap. The largest gap is 2.4s (after "not days." before "This is Forward Check AI" at f979–f1051). The gap between "verdict" and "8% likely false" is only 1.8s (f2801–f2856).

The Remotion code's `musicVolume()` function and scene boundaries were designed for a VO with a gap, but the actual rendered audio doesn't have one. This causes a **VO-to-visual sync mismatch**: DA/Judge VO plays during TheNewsroom pipeline visuals, while TheReveal visuals show without the VO the code expected.

### 2. VO Differs from VOICEOVER_SCRIPT.md
The actual spoken audio differs from the script in several ways:
- **"forward"** not "share" → "It takes four seconds to **forward**."
- **"checks it"** not "closes that gap" → "We built something that **checks it** in minutes, not days."
- **"mother"** not "grandmother" → "Already told their **mother**."
- **Extra content** not in script: "This message exaggerates real statements. It manufactures false urgency. It strips context to shut off your brain."
- **Missing content** from script: Tagline ("A lie gets halfway around the world in four seconds. We just gave truth a fighting chance.") is absent
- **Reordered scenes:** Actual VO order differs from script's 18-scene structure (manipulation analysis comes before falsification criteria, not after)

### 3. VO-to-Scene Boundary Mismatch
The actual VO crosses scene boundaries:
- DA/Judge VO (f2200–f2801) plays during **TheNewsroom** visuals, not TheReveal
- "8% likely false" verdict VO (f2856) also plays during TheNewsroom
- TheReveal starts at f3175 mid-sentence ("This message uses authority impersonation...")
- TheClose VO covers nuance/second investigation, not the scripted confidence/architecture/tagline

### 4. "Bad Audio" Label
The filename (`v1-bad-audio`) confirms audio quality issues. The VO was likely re-recorded with different content/pacing than the original script, creating sync mismatches with the visual scene boundaries.

---

## Shared Components Library (29 components)

Located in `src/components/`:

| Component | File | Purpose |
|-----------|------|---------|
| AgentIcons | AgentIcons.tsx | Pipeline agent visual representations |
| ConditionalVerdictCard | ConditionalVerdictCard.tsx | IF/THEN falsification logic display |
| ConfidenceBars | ConfidenceBars.tsx | 4-metric confidence decomposition with spring physics |
| DarkBg | DarkBg.tsx | Dark background wrapper with colored glow effects |
| DataCard | DataCard.tsx | Source extraction data display (glass morphism) |
| DevilsAdvocateThinking | DevilsAdvocateThinking.tsx | Multi-screen DA reasoning animation |
| ElapsedTimer | ElapsedTimer.tsx | Investigation elapsed time counter (1.7x speed) |
| GrandmotherZoom | GrandmotherZoom.tsx | Grandmother photo zoom sequence |
| HighlightSlide | HighlightSlide.tsx | Text highlight animation effect |
| InvestigationProgress | InvestigationProgress.tsx | Multi-stage progress tracker (top-right card) |
| LogStream | LogStream.tsx | Monospace scrolling investigation logs (12 entries) |
| ManipulationAnnotations | ManipulationAnnotations.tsx | Manipulation technique overlays with annotations |
| Particles | Particles.tsx | Floating particle effects (colored, freezable) |
| PhoneGrid | PhoneGrid.tsx | 1→3→9 phone multiplication animation |
| PipelineDiagram | PipelineDiagram.tsx | 6-agent architecture visualization |
| PipelineNodes | PipelineNodes.tsx | Individual node components for pipeline |
| QRCode | QRCode.tsx | QR code variants (web/telegram) |
| ScreenshotOverlay | ScreenshotOverlay.tsx | Dimmed real UI screenshot backgrounds |
| SectionLabel | SectionLabel.tsx | Scene labels ("THE PROBLEM", "THE INVESTIGATION", etc.) |
| SpeedComparisonBar | SpeedComparisonBar.tsx | Visual time comparison bars |
| SpeedRunPipeline | SpeedRunPipeline.tsx | Rapid pipeline visualization (8x speed) |
| TechShowcase | TechShowcase.tsx | 3-tier architecture + metrics display |
| TelegramDesktop | TelegramDesktop.tsx | Telegram bot conversation UI (desktop) |
| TelegramPhone | TelegramPhone.tsx | Telegram mobile phone UI |
| TypewriterText | TypewriterText.tsx | Character-by-character text reveal |
| VerdictCard | VerdictCard.tsx | Verdict badge ("LIKELY FALSE — 10%") |
| WebChatInterface | WebChatInterface.tsx | ForwardCheck web chat input/response UI |

---

## Screenshot Assets (19 UI overlays)

Used as dimmed background overlays (0.06–0.15 opacity) behind animated content:

| File | Used In Scene | Frame Range (scene-relative) |
|------|--------------|------------------------------|
| 01-chat-input.png | TheNewsroom | f0–f100 |
| 02-investigation-started.png | TheNewsroom | f100–f300 |
| 03-classifier-done.png | TheNewsroom | f325–f588 |
| 04-strategist-done.png | TheNewsroom | f588–f945 |
| 06-investigators-complete.png | TheNewsroom | f945–f1100 |
| 07-da-challenge-done.png | TheNewsroom | f1100–f1700 |
| 13-verdict-fullpage.png | TheNewsroom | f1700–f1950 |
| 17-verdict-page-reasoning.png | TheReveal | f0–f680 |
| 16-verdict-page-manipulation.png | TheReveal | f1200–f1460 |
| 15-verdict-page-decomposition.png | TheReveal | f1460–f1760 |

---

## File Map (Remotion Project)

```
/Users/ralph/Projects/hello-world-video/forwardcheck-video/
├── src/
│   ├── index.ts                    # Remotion root registration
│   ├── Root.tsx                    # Composition definition (5400f, 30fps, 1920x1080)
│   ├── ForwardCheckVideo.tsx       # Main composition + audio layering + music volume curve
│   ├── constants.ts                # Colors, fonts, scene frames, claim data, agent metadata
│   ├── scenes/
│   │   ├── ColdOpen.tsx            # Scene 1: Quote + misattribution twist
│   │   ├── TheSpread.tsx           # Scene 2: Phone multiplication + stats + grandmother
│   │   ├── TheSolution.tsx         # Scene 3: Telegram bot introduction
│   │   ├── TheNewsroom.tsx         # Scene 4: Full pipeline investigation (longest scene)
│   │   ├── TheReveal.tsx           # Scene 5: DA + manipulation + confidence
│   │   └── TheClose.tsx            # Scene 6: Architecture + tagline + brand card
│   └── components/                 # 29 shared React components
├── public/
│   ├── audio/                      # 20 audio files
│   │   ├── voiceover_full.mp3      # Main VO track (186.39s with trailing silence)
│   │   ├── voiceover_full_elon.mp3 # Alternate VO (Elon claim version)
│   │   ├── coldopen_music.mp3      # BBC news-style cold open tension bed
│   │   ├── music_bed.mp3           # Background music (dynamically ducked)
│   │   ├── seg1-4_fast.mp3         # Individual segment recordings
│   │   ├── sfx_bass_thud.mp3       # Verdict impact thud
│   │   ├── sfx_phone_ping1-4.mp3   # Phone notification sounds (4 variants)
│   │   ├── sfx_classifier_ping.mp3 # Classifier activation ping
│   │   ├── sfx_strategist_ping.mp3 # Strategist activation ping
│   │   ├── sfx_triple_ping.mp3     # 3-investigator simultaneous activation
│   │   ├── sfx_check_tick.mp3      # Progress check tick (reused 6x)
│   │   ├── sfx_processing_hum.mp3  # Low ambient hum during investigation
│   │   └── sfx_transition_woosh.mp3 # Scene transition whoosh (reused 5x)
│   └── screenshots/                # 19 UI overlay PNGs from live app
├── VOICEOVER_SCRIPT.md             # Original VO script (18 scenes, ~268 words)
├── VO_TIMESTAMP_ANALYSIS.md        # Actual audio timing analysis (44 segments mapped)
├── MUSIC_CUE_SHEET.md              # Music cue details
├── SCENE_STRUCTURE_AUDIT.md        # Scene structure analysis
├── VOICE_GENERATION_PLAN.md        # VO generation details
├── VOICE_INTEGRATION_NOTES.md      # VO integration technical notes
├── SYNC_FIX_PLAN.md                # Sync fix strategy
├── SCREENSHOT_MAP.md               # Screenshot overlay mapping
├── package.json                    # remotion@^4.0.422, react@^19.2.4
├── tsconfig.json
└── out/                            # Render output directory
```

### Dependencies
- `remotion@^4.0.422`
- `react@^19.2.4` / `react-dom@^19.2.4`
- `qrcode@^1.5.4`
- `TypeScript@^5.9.3`

---

## Full VO Transcript (ElevenLabs Scribe v1 — Word-Level Verified)

347 words | 13.4s initial silence | 2 gaps > 1.5s | Last word at 3:00.0

```
         ████████████ 13.4s COLD OPEN SILENCE ████████████

[0:13.4] This message has been forwarded 600,000 times.
[0:16.8] It takes four seconds to forward.
[0:18.8] It takes a journalist four days to fact-check.
[0:22.5] By then, 600,000 people have already believed it, already
         shared it, already told their mother.

[0:30.5] We built something that checks it in minutes, not days.

         ··· 2.4s gap ···

[0:35.1] This is Forward Check AI.

[0:37.2] You forward it a message.
[0:38.7] Behind it, six AI agents run an investigation, not one model
         answering a question.
[0:45.3] A newsroom.
[0:46.6] A desk editor reads the message, routes it, half a second.
[0:50.8] Then an Opus strategist plans the investigation, not search
         and summarize.
[0:55.9] It defines what specific evidence would prove this true and what
         would prove it false before anyone searches anything.

[1:03.4] Three investigators fan out in parallel.
[1:06.8] Source verification, domain expertise, pattern matching, each
         using Sonnet for speed.

[1:13.3] Now, the part no other system does.
[1:16.2] A devil's advocate receives every finding.
[1:18.6] Its only job: prove the investigation wrong.
[1:21.5] Opus, extended thinking, maximum effort.
[1:25.1] Finally, a judge, also Opus.
[1:28.7] It weighs the evidence, considers the challenge, and renders
         the verdict.

         ··· 1.8s gap (bass thud at f2850) ···

[1:35.2] 8% likely false, but that number alone isn't the point.
[1:40.7] Most fact-checkers tell you what to think.
[1:43.0] We show you how to think.

[1:44.9] This message uses authority impersonation, urgency tactics,
         emotional manipulation, financial hope designed to bypass your
         critical thinking.
[1:55.4] This message exaggerates real statements.
[1:58.3] It manufactures false urgency.
[2:00.7] It strips context to shut off your brain.

[2:03.9] The falsification criteria, written before anyone searched.
[2:08.1] An official government gazette announcing this scheme.
[2:11.7] We looked.
[2:12.8] It doesn't exist.
[2:14.4] Find the original Musk quote matching the claim.

[2:16.5] This is Opus's actual thinking, the devil's advocate trying to
         argue the investigators got it wrong.
[2:23.5] Read it.
[2:24.3] It tried.
[2:25.2] It failed.
[2:26.2] Counterargument failed.
[2:28.1] That failure is our highest confidence signal.
[2:31.4] Not because a model said, "I'm sure,"
[2:34.0] because a model genuinely tried to prove itself wrong and couldn't.
[2:38.5] That's a fundamentally different kind of confidence.

[2:43.0] And it handles nuance.
[2:44.7] This health claim isn't false.
[2:46.8] A real study exists, but the viral message turned possibly
         into definitely.
[2:52.1] Forward Check catches the distortion.
[2:54.7] We use Opus three times per investigation: planning,
         challenging, judging.

         [3:00.0 — LAST WORD ENDS AT EXACT VIDEO END]
```

---

## Editing Guide

To edit specific scenes or audio, modify the corresponding files:

| What to Change | File(s) to Edit |
|----------------|----------------|
| Scene timing/order | `src/constants.ts` (SCENES object) + `src/ForwardCheckVideo.tsx` (Sequence from/duration) |
| VO text on screen | `src/constants.ts` (claim data, verdicts) + individual scene files |
| VO audio | Replace `public/audio/voiceover_full.mp3` (or individual segments) |
| Music volume curve | `src/ForwardCheckVideo.tsx` → `musicVolume()` function |
| SFX placement | `src/ForwardCheckVideo.tsx` → Sequence elements with Audio |
| Visual animations | Individual scene files in `src/scenes/` |
| Colors/fonts | `src/constants.ts` (COLORS, FONT_* constants) |
| Pipeline agent data | `src/constants.ts` (AGENTS object) |
| Claim content | `src/constants.ts` (NEW_CLAIM_TEXT, NEW_VERDICT, etc.) |

### Rendering

```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video
npx remotion render ForwardCheckAI out/forwardcheck-ai.mp4
```
