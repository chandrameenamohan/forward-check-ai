# ForwardCheck AI — Demo Video Scene Editing

## Context
I have a 3-minute demo video for ForwardCheck AI (a Telegram fact-checking bot) built with Remotion. The video has been reverse-engineered and split into 6 independently renderable scenes. All scenes are rendered as individual MP4s. Now I need to edit specific scenes.

## What's Been Done
1. Reverse-engineered the full video into a 630-line scene spec with ElevenLabs-verified VO timestamps
2. Created 6 standalone Remotion compositions (one per scene) with isolated audio
3. All 6 scenes rendered to individual MP4s
4. Concatenation script works to rejoin edited scenes

## The 6 Scenes
| # | Name | Duration | Composition ID |
|---|------|----------|---------------|
| 1 | ColdOpen | 13s | Scene1_ColdOpen |
| 2 | TheSpread | 18s | Scene2_TheSpread |
| 3 | TheSolution | 6.5s | Scene3_TheSolution |
| 4 | TheNewsroom | 68s | Scene4_TheNewsroom |
| 5 | TheReveal | 59s | Scene5_TheReveal |
| 6 | TheClose | 15.5s | Scene6_TheClose |

## Key Files (READ THESE FIRST)

### Scene Spec & Plans (in forward-check-ai project)
- `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_DEMO_REVERSE_ENGINEERED.md` — **Scene bible.** Frame-accurate breakdown of every scene: VO timestamps, visual keyframes, music volume curve, SFX, 27-component library. Ground truth for all editing.
- `/Users/ralph/Projects/forward-check-ai/demo/IMPLEMENTATION_SCENES_VIDEO.md` — Task plan for scene isolation (all tasks complete)

### Remotion Project (where code lives)
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/Root.tsx` — 7 compositions (1 full + 6 scenes)
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/ForwardCheckVideo.tsx` — Main composition with audio layering + musicVolume()
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/constants.ts` — Scene frame ranges, colors, fonts, claim data, agent metadata
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/compositions/` — 6 scene wrapper components with isolated audio
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/scenes/` — 6 visual scene components (ColdOpen.tsx, TheSpread.tsx, etc.)
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/components/` — 27 shared React components
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/src/utils/music-volume.ts` — Shared music volume curve
- `/Users/ralph/Projects/hello-world-video/forwardcheck-video/public/audio/` — All audio files (VO, music, SFX)

### Rendered Scene Videos
- `/Users/ralph/Projects/forward-check-ai/demo/scenes/` — 6 individual MP4s + concat script

### ElevenLabs API (for VO regeneration)
- API key in `~/.zshrc` as `ELEVENLABS_API_KEY`
- Used Scribe v1 for transcription; can use for TTS to re-record VO lines

## Rendering a Single Scene
```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video
npx remotion render src/index.ts Scene5_TheReveal /Users/ralph/Projects/forward-check-ai/demo/scenes/scene5_thereveal.mp4 --codec h264 --crf 18
```

## Rejoining After Edits
```bash
cd /Users/ralph/Projects/hello-world-video/forwardcheck-video
./render-scenes.sh --concat
```

## What I Want To Do Now
Edit specific scenes in the demo video. I'll tell you which scenes and what changes.
