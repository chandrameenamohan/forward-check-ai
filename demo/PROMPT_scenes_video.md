# Build Prompt — ForwardCheck-AI Scene Videos

You are isolating the ForwardCheck-AI demo video into 6 independently renderable scene compositions using Remotion. Follow these instructions precisely.

## Working Directories

- **Remotion project:** `/Users/ralph/Projects/hello-world-video/forwardcheck-video/`
- **Scene spec:** `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md`
- **Plan file:** `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_SCENES_VIDEO.md`

All code changes happen in the Remotion project. Plan and spec files are read-only references.

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_SCENES_VIDEO.md` — the task list. Find the first task marked `- [ ]` (not started).
2. `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md` — **the scene bible.** Frame-accurate breakdown of every scene: VO timestamps (ElevenLabs verified), visual keyframes, music volume curve, SFX placement, component library. Use this as ground truth for all sync decisions.
3. Read the existing Remotion source files to understand current architecture:
   - `src/Root.tsx` — current composition registration
   - `src/ForwardCheckVideo.tsx` — main composition with audio layering and `musicVolume()` function
   - `src/constants.ts` — SCENES frame ranges, colors, fonts, claim data
   - The relevant scene file in `src/scenes/` for the task you're working on

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_SCENES_VIDEO.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement

### Core Architecture Pattern — Scene Isolation via `startFrom`

Each scene composition reuses the global audio files (voiceover_full.mp3, music_bed.mp3) by seeking into them with Remotion's `startFrom` prop. **Do NOT extract or split audio files.** This keeps the source of truth as a single audio track.

```tsx
// Pattern: Scene wrapper for TheSpread (global start = SCENES.THE_SPREAD.start = 390)
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { COLORS, SCENES } from "../constants";
import { TheSpreadScene } from "../scenes/TheSpread";
import { musicVolume } from "../utils/music-volume";

const SCENE_START = SCENES.THE_SPREAD.start; // 390

export const Scene2TheSpread: React.FC = () => {
  // Remap global music volume to scene-local frames
  const localMusicVolume = (f: number) => musicVolume(f + SCENE_START);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <style>{`@import url('...');`}</style>

      {/* VO — seek into global voiceover at scene start */}
      <Audio src={staticFile("audio/voiceover_full.mp3")} startFrom={SCENE_START} volume={1} />

      {/* Music bed — seek + remap volume */}
      <Audio src={staticFile("audio/music_bed.mp3")} startFrom={SCENE_START} volume={localMusicVolume} />

      {/* SFX — scene-relative positions (global frame - SCENE_START) */}
      <Sequence from={90} durationInFrames={2}>
        <Audio src={staticFile("audio/sfx_phone_ping1.mp3")} volume={0.15} />
      </Sequence>

      {/* Visual */}
      <TheSpreadScene />
    </AbsoluteFill>
  );
};
```

### Key Rules

1. **Never modify the original ForwardCheckVideo.tsx composition** — it must continue working as-is.
2. **Extract `musicVolume()` to a shared utility** (`src/utils/music-volume.ts`) if it doesn't exist yet. Both the original composition and scene wrappers import from there.
3. **Use SCENES constants for all frame calculations** — never hardcode frame numbers.
4. **Scene SFX mapping** — refer to the "SFX" section under each scene in `IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md`. Convert global frame positions to scene-relative: `sceneRelativeFrame = globalFrame - SCENES.{SCENE}.start`.
5. **ColdOpen is special** — uses COLORS.black background (not COLORS.bg), has coldopen_music.mp3 in addition to music bed, and extends 15 frames for crossfade overlap (total 405 frames).
6. **TheNewsroom is the complex one** — longest scene (2050 frames), most SFX (12+ events), dynamic music volume changes. Take extra care with SFX frame mapping.

### Validation Approach

For infrastructure tasks (Phase 0):
- `npx tsc --noEmit` passes
- `npx remotion preview src/index.ts` loads without errors
- Each new composition appears in the Remotion preview sidebar

For scene validation tasks (Phase 1):
- Render the specific scene: `npx remotion render src/index.ts Scene{N}_{Name} /Users/ralph/Projects/forward-check-ai/demo/scenes/scene{n}_{name}.mp4 --codec h264 --crf 18`
- Verify the rendered MP4:
  - Correct duration (within 0.5s of expected)
  - VO audible and synced to visuals
  - Music volume follows the spec's curve
  - SFX play at correct moments
  - Visual keyframes match the spec's breakdown

For assembly tasks (Phase 2):
- All 6 scene MP4s exist and play correctly
- Concatenated video matches original duration
- No audio seams or visual glitches at boundaries

### Code Quality Gates

- [ ] **No modifications to ForwardCheckVideo.tsx** (except extracting musicVolume to shared util)
- [ ] **No hardcoded frame numbers** — derive from SCENES constants
- [ ] **No duplicate audio files** — reuse existing public/audio/ files via startFrom
- [ ] **TypeScript clean** — `npx tsc --noEmit` passes
- [ ] **Each scene renders independently** — `npx remotion render src/index.ts Scene{N}_{Name}` works

## Step 4: Validate

Run type checking:
```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video && npx tsc --noEmit
```

For scene tasks, render the scene:
```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video
npx remotion render src/index.ts Scene{N}_{Name} /Users/ralph/Projects/forward-check-ai/demo/scenes/scene{n}_{name}.mp4 --codec h264 --crf 18
```

Verify the rendered video plays correctly and matches the spec.

## Step 5: Update plan

In `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_SCENES_VIDEO.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Commit

Commit changes in the **Remotion project** directory:
```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video
git add -A && git commit -m "Scene Video Task X.Y: <short description>"
```

Also commit the plan update in the **forward-check-ai** directory:
```bash
cd /Users/ralph/Projects/forward-check-ai
git add demo/IMPLEMENTATION_SCENES_VIDEO.md && git commit -m "Scene Video Task X.Y: mark complete"
```

## Step 7: Exit

You are done. Do NOT start another task. Exit immediately after committing.
