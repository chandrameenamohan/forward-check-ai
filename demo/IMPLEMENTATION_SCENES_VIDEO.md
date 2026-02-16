# ForwardCheck AI — Scene Video Implementation Plan

> Each task is atomic. One task per Ralph Loop iteration.
> Remotion project: `/Users/ralph/Projects/hello-world-video/forwardcheck-video/`
> Scene spec: `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md`

---

## Phase 0: Infrastructure — Scene Isolation Architecture

### Task 0.1: Register 6 scene compositions in Root.tsx
- [x]
**Objective:** Add 6 new Remotion `<Composition>` entries to Root.tsx — one per scene — so each can be rendered independently.
**Details:**
- Keep the existing `ForwardCheckAI` composition (full video) untouched
- Add 6 new compositions with IDs: `Scene1_ColdOpen`, `Scene2_TheSpread`, `Scene3_TheSolution`, `Scene4_TheNewsroom`, `Scene5_TheReveal`, `Scene6_TheClose`
- Each composition uses the correct `durationInFrames` from the SCENES constant in `constants.ts`:
  - ColdOpen: 405 frames (390 + 15 crossfade overlap)
  - TheSpread: 540 frames
  - TheSolution: 195 frames
  - TheNewsroom: 2050 frames
  - TheReveal: 1760 frames
  - TheClose: 465 frames
- All at fps=30, width=1920, height=1080
- Each composition points to a new wrapper component (created in Task 0.2)
- Import SCENES from constants.ts — use it directly, don't hardcode frame counts
**Validation:**
- `npx remotion preview src/index.ts` shows 7 compositions in the sidebar (1 original + 6 scenes)
- Each composition loads without errors in preview

### Task 0.2: Create scene wrapper components
- [x]
**Objective:** Create 6 scene wrapper components at `src/compositions/` that each render ONE scene with its correct audio.
**Details:**
- Create directory: `src/compositions/`
- Create one file per scene: `Scene1ColdOpen.tsx`, `Scene2TheSpread.tsx`, `Scene3TheSolution.tsx`, `Scene4TheNewsroom.tsx`, `Scene5TheReveal.tsx`, `Scene6TheClose.tsx`
- Each wrapper component must:
  1. Render `<AbsoluteFill>` with the correct background color (COLORS.bg, or COLORS.black for ColdOpen)
  2. Include the Google Fonts `<style>` import (same as ForwardCheckVideo.tsx)
  3. Render the scene's visual component (e.g., `<ColdOpenScene />`)
  4. Include the voiceover audio track using `<Audio startFrom={SCENE_START_FRAME}>` where SCENE_START_FRAME is the scene's global start frame from SCENES constant — this seeks into voiceover_full.mp3 at the correct position
  5. Include the music bed using `<Audio startFrom={SCENE_START_FRAME} volume={sceneMusicVolume}>` — the volume function must be remapped from the global `musicVolume()` to scene-local frames (scene-local frame 0 = global SCENE_START_FRAME)
  6. Include scene-specific SFX at scene-relative frame positions (global SFX frame minus SCENE_START_FRAME)
- **Critical audio pattern — use `startFrom` to reuse global audio files:**
  ```tsx
  // Example for TheSpread (global start = f390):
  <Audio src={staticFile("audio/voiceover_full.mp3")} startFrom={390} volume={1} />
  <Audio src={staticFile("audio/music_bed.mp3")} startFrom={390} volume={spreadMusicVolume} />
  ```
- **SFX mapping per scene** (from ForwardCheckVideo.tsx — subtract scene start frame):
  - ColdOpen: coldopen_music.mp3 at f0 (already scene-relative)
  - TheSpread: phone_ping1-4 at f90/120/150/180, transition_woosh at f0
  - TheSolution: transition_woosh at f0
  - TheNewsroom: transition_woosh at f0, processing_hum at f0, classifier_ping at f325, strategist_ping at f588, triple_ping at f945, check_ticks at f325/588/945/1080/1197, bass_thud at f1725
  - TheReveal: transition_woosh at f0, check_tick at f560
  - TheClose: transition_woosh at f0
- Extract the `musicVolume()` function from ForwardCheckVideo.tsx into a shared utility `src/utils/music-volume.ts` so both the full video and scene wrappers can use it
- Each scene's wrapper remaps: `sceneMusicVolume = (f) => musicVolume(f + SCENE_START_FRAME)`
**Validation:**
- `npx remotion preview` — each of the 6 scene compositions renders with audio
- Visually spot-check: Scene2_TheSpread shows phone grid + VO starts immediately
- Visually spot-check: Scene4_TheNewsroom shows pipeline + VO in sync
- No TypeScript errors: `npx tsc --noEmit`

### Task 0.3: Create render-scenes.sh script
- [x]
**Objective:** Create a shell script that renders all 6 scene videos individually.
**Details:**
- Create `render-scenes.sh` in the Remotion project root
- Script renders each composition to `/Users/ralph/Projects/forward-check-ai/demo/scenes/scene1_coldopen.mp4`, etc.
- Use `npx remotion render src/index.ts <CompositionId> <output> --codec h264 --crf 18`
- Render in sequence (not parallel — avoids OOM)
- Print timing per scene and total
- Create `/Users/ralph/Projects/forward-check-ai/demo/scenes/` directory if it doesn't exist
- Also create `/Users/ralph/Projects/forward-check-ai/demo/scenes/concat.txt` — an ffmpeg concat list file:
  ```
  file 'scene1_coldopen.mp4'
  file 'scene2_thespread.mp4'
  file 'scene3_thesolution.mp4'
  file 'scene4_thenewsroom.mp4'
  file 'scene5_thereveal.mp4'
  file 'scene6_theclose.mp4'
  ```
- Add a `--concat` flag that also runs ffmpeg to join all scenes:
  ```bash
  ffmpeg -f concat -safe 0 -i /Users/ralph/Projects/forward-check-ai/demo/scenes/concat.txt -c copy /Users/ralph/Projects/forward-check-ai/demo/scenes/forwardcheck-ai-scenes-joined.mp4
  ```
**Validation:**
- `chmod +x render-scenes.sh && ./render-scenes.sh` completes without error
- 6 MP4 files exist in `/Users/ralph/Projects/forward-check-ai/demo/scenes/`
- Each file plays and has correct duration (within 0.5s of expected)
- `./render-scenes.sh --concat` produces a single joined video

---

## Phase 1: Scene-by-Scene Validation & Polish

### Task 1.1: Validate and fix ColdOpen scene (Scene 1)
- [x]
**Objective:** Render Scene1_ColdOpen independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene1_ColdOpen /Users/ralph/Projects/forward-check-ai/demo/scenes/scene1_coldopen.mp4 --codec h264 --crf 18`
- Verify against spec (`IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md` Scene 1):
  - Duration: ~13s (405 frames with crossfade)
  - Audio: coldopen_music.mp3 fades in/out, music_bed at 0.03, NO voiceover
  - Visual: Black bg → "A FORWARDCHECK INVESTIGATION" → typewriter quote → misattribution twist → crossfade
- Check: coldopen_music.mp3 plays correctly (fade in f0→f30, hold, fade out f330→f390)
- Check: Timer "00:00" visible bottom-right
- Fix any sync issues between audio and visuals
**Validation:**
- Rendered MP4 plays correctly in QuickTime
- Audio: Cold open music audible, no VO
- Visual: All keyframes match spec timing

### Task 1.2: Validate and fix TheSpread scene (Scene 2)
- [x]
**Objective:** Render Scene2_TheSpread independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene2_TheSpread /Users/ralph/Projects/forward-check-ai/demo/scenes/scene2_thespread.mp4 --codec h264 --crf 18`
- Verify against spec (Scene 2):
  - Duration: 18s (540 frames)
  - VO starts immediately (scene-relative f10 = global f400): "This message has been forwarded 600,000 times."
  - Phone ping SFX at scene-relative f90, f120, f150, f180
  - Music: 0.05 → fade to 0.00 (POWER SILENCE at grandmother)
  - Visual: Section label → phone grid → 600K stat → speed bars → grandmother → gold text
- Check: VO sync — first words align with scene-relative ~f10 (global f400)
- Check: Phone pings align with card multiplication visuals
**Validation:**
- VO clearly audible starting within first 1s
- Phone pings sync with card appearances
- Music fades to silence before grandmother zoom

### Task 1.3: Validate and fix TheSolution scene (Scene 3)
- [ ]
**Objective:** Render Scene3_TheSolution independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene3_TheSolution /Users/ralph/Projects/forward-check-ai/demo/scenes/scene3_thesolution.mp4 --codec h264 --crf 18`
- Verify against spec (Scene 3):
  - Duration: 6.5s (195 frames)
  - VO: "We built something that checks it in minutes, not days." then "This is Forward Check AI."
  - Music: Entrance ramp 0.00→0.35, then steady
  - Visual: Telegram Desktop → bot response → transition to web
- Check: Music ramp feels correct (silence → energy)
- Check: VO matches visual transitions
**Validation:**
- Telegram Desktop UI visible
- Music entrance ramp audible
- VO plays through both lines

### Task 1.4: Validate and fix TheNewsroom scene (Scene 4)
- [ ]
**Objective:** Render Scene4_TheNewsroom independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene4_TheNewsroom /Users/ralph/Projects/forward-check-ai/demo/scenes/scene4_thenewsroom.mp4 --codec h264 --crf 18`
- Verify against spec (Scene 4 — longest scene, 68.3s):
  - Duration: 68.3s (2050 frames)
  - VO covers: "You forward it a message" through "We show you how to think"
  - SFX: Processing hum, classifier ping (f325), strategist ping (f588), triple ping (f945), check ticks, bass thud (f1725)
  - Music: Steady 0.35 → minor key 0.37 → tension fade → bass thud drop → post-verdict quiet → fade to silence
  - Visual: Web chat → pipeline diagram builds → all agents activate → verdict badge drop → verdict display
- **Critical check:** Bass thud at scene-relative f1725 aligns with verdict badge visual
- **Critical check:** Pipeline agent pings align with card activation visuals
- Check: Log stream entries appear at correct times
**Validation:**
- All 6 pipeline agent cards appear in sequence
- Bass thud lands on verdict badge drop
- VO continuous from start to end (no dead air beyond natural pauses)
- Verdict "LIKELY FALSE" badge visible near end

### Task 1.5: Validate and fix TheReveal scene (Scene 5)
- [ ]
**Objective:** Render Scene5_TheReveal independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene5_TheReveal /Users/ralph/Projects/forward-check-ai/demo/scenes/scene5_thereveal.mp4 --codec h264 --crf 18`
- Verify against spec (Scene 5 — analytical climax, 58.7s):
  - Duration: 58.7s (1760 frames)
  - VO: Manipulation analysis → falsification criteria → DA thinking → "Read it. It tried. It failed." → confidence signal → nuance transition
  - Music: EXTENDED SILENCE (0.00) through DA section → sunrise rebuild at ~f1451 → warm return 0.35
  - Visual: Differentiator headline → manipulation annotations → falsification card → DA thinking reveal → conditional verdict → confidence bars → extended hold
- **Critical check:** "Read it." moment aligns with check tick SFX at scene-relative f560
- Check: DA thinking typewriter animation syncs with VO pacing
- Check: Music sunrise rebuild feels emotionally correct (silence → warmth after DA resolution)
**Validation:**
- DA thinking text animates during VO
- Confidence bars animate with spring physics
- Music transition from silence to rebuild is smooth
- "And it handles nuance" is the last VO line

### Task 1.6: Validate and fix TheClose scene (Scene 6)
- [ ]
**Objective:** Render Scene6_TheClose independently, verify audio/visual sync, fix any issues.
**Details:**
- Render: `npx remotion render src/index.ts Scene6_TheClose /Users/ralph/Projects/forward-check-ai/demo/scenes/scene6_theclose.mp4 --codec h264 --crf 18`
- Verify against spec (Scene 6 — 15.5s):
  - Duration: 15.5s (465 frames)
  - VO: "This health claim isn't false." → second investigation → "Forward Check catches the distortion." → "We use Opus three times..."
  - Music: Steady 0.35 → duck 0.15 → rise 0.25 → drop → gentle fade → silence
  - Visual: Confidence card → bars → parallel timeline → TechShowcase speed-run → tagline build → brand card with QR codes
- Check: Brand card is final visible element
- Check: QR codes readable
- Check: Music fades to true silence by final frame
**Validation:**
- "ForwardCheck AI" brand card visible at end
- QR codes render correctly
- Audio ends cleanly (no click/pop at cutoff)
- Last word "judging" ends at or near final frame

---

## Phase 2: Assembly & Final Output

### Task 2.1: Render all scenes and concatenate final video
- [ ]
**Objective:** Run the full render pipeline and produce a single concatenated video from all 6 scenes.
**Details:**
- Run: `./render-scenes.sh --concat`
- Verify the concatenated video `/Users/ralph/Projects/forward-check-ai/demo/scenes/forwardcheck-ai-scenes-joined.mp4`:
  - Total duration: ~180s (3:00)
  - All 6 scenes play in order without gaps or glitches
  - Audio transitions between scenes are smooth (no pops, clicks, or volume jumps)
  - Compare against original `forwardcheck-ai-final-v1-bad-audio.mp4` — visuals should match, audio should match
- If there are audio seam issues at scene boundaries, add 1-frame overlap or crossfade in the concat step
**Validation:**
- Concatenated video plays start to finish
- Total duration within 0.5s of 180s
- No visible or audible glitches at scene boundaries
- Side-by-side comparison with original video shows matching content
