# Mog Off

A third-person, anime-inspired FPS+melee fighting game for the browser.
Twelve elemental-powered fighters, twelve procedural arenas, a story mode
with two boss fights, one shared combat system. Built with Next.js + React
Three Fiber, per `Mog_Off_PRD.md` / `Mog_Off_SRD.md`.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **three.js / @react-three/fiber / @react-three/drei / @react-three/postprocessing** — rendering, camera, bloom/vignette/chromatic-aberration
- **Zustand** — match state, combat resolver, camera FSM, AI opponent, story-mode ladder
- **Howler.js** — theme music, SFX, per-arena ambience, voice lines

Arenas, the coliseum crowd, and the final boss (Overmog) are **procedural
low-poly + toon-shaded geometry** built directly in Three.js. Roster
fighters use an **imported, fully-animated Mixamo rig** (`public/models/`)
instead — see `components/game/MixamoFighter.tsx`. Two distinct
models/animation sets are available (Vanguard, Ely); the active roster is
currently scoped down to one fighter per model (see below) while both get
fully verified before scaling back up to all twelve.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
```

`npm run build` / `npm run start` for a production build. Ships as static
output — no server runtime required, deploys as-is to Vercel.

## Project layout

- `lib/characters.ts` — the 12-fighter roster (stats, build, model, colors, arena, voice line)
- `lib/arenas.ts` — one themed arena config per element
- `lib/story.ts` — the story-mode ladder (roster fights → Viraat gatekeeper → Overmog final boss)
- `lib/combat.ts` / `lib/store.ts` — combat resolver + Zustand game state machine (match phase, fighter FSM, camera FSM, ammo/reload, AI opponent, story progression)
- `lib/fighterFrame.ts` — the `FighterFrame` shape (action/position/facing/etc.) shared by every screen that drives a `MixamoFighter`
- `lib/lore.ts` — world lore/copy
- `components/game/MixamoFighter.tsx` — the 12 roster fighters' 3D body: imported rig + animation clips (locomotion/aim/fire/reload/hit/punch/death), recolored per character. Renders both the opponent AND the player's own body in third person
- `components/game/BossFighter.tsx` — Overmog's body, deliberately not the humanoid rig
- `components/game/` — the rest of the R3F scene: `Gun`, `GunTracer` (hitscan tracers/muzzle flash), `AimAssist` (drives the HUD reticle's lock-on color off the same cone a shot is actually checked against), `Coliseum` + `Crowd` (spectators), `Arena`, `Particles`, `DecalSystem`, `CameraRig` (third-person over-the-shoulder), `PostFX`
- `components/screens/` — Home, CharacterSelect (also used for story-mode fighter pick), FightScreen, ResultScreen (branches for story mode)
- `components/ui/HUD.tsx`, `TutorialOverlay.tsx` — HUD overlay + first-fight controls tutorial

## 3D character models

Two Mixamo characters, each with its own matching clip set:
`public/models/vanguard/` and `public/models/ely/` (base mesh + `anims/`:
locomotion/aim/fire from a "shooter" export, `punch.fbx`/`dying.fbx` sourced
from a second pack, and directional locomotion —
`fast-run`/`walking-backwards`/`strafe-left`/`strafe-right`/`run-start`
(Mixamo's "Standing Jump Running To Run Forward", used as the *running*
jump)/`jumping` (standing jump) — all against the same skeleton). Movement
direction is derived per-frame from the body's actual facing vs. its actual
position delta (`MixamoFighter.tsx`), so strafing/backpedaling plays the
correct clip instead of a forward-run no matter which way you're actually
moving. Assigned per character via `modelKey` in `lib/characters.ts`,
recolored to that character's palette in `MixamoFighter.tsx`.

`lib/characters.ts`'s `ROSTER_ORDER` is currently scoped down to 2 fighters
(one per model) while control/facing/animation get fully nailed down before
scaling back up to all twelve — the other 10 are still fully defined in
`CHARACTERS` (and still playable in story mode), so re-adding them to
`ROSTER_ORDER` (alternating `modelKey` between the two models) is enough to
bring them back into normal versus-mode selection.

Loading uses a **vendored, patched copy** of three.js's `FBXLoader`
(`lib/vendor/FBXLoader.js`, see its README) rather than the stock
`three/examples/jsm/loaders/FBXLoader.js` — Vanguard's file trips a real bug
in the stock loader's footer-parsing heuristic (throws `Unknown property
type` ~150 bytes before EOF, after the entire real scene has already parsed
successfully); the vendored copy tolerates that specific near-EOF failure
instead of discarding an otherwise-fully-valid parse.

## Audio assets

`public/audio/{voices,sfx,ambient}/*.mp3` and `public/audio/theme.mp3` are
committed static assets. The voice lines, SFX, and arena ambience beds were
generated **once, offline** via the ElevenLabs API (never called live during
gameplay). To regenerate:

```bash
export ELEVENLABS_API_KEY=...   # or set it in .env.local
node scripts/generate-audio.mjs # skips files that already exist; FORCE=1 to overwrite
```

Voice casting, SFX prompts, and ambience prompts live in
`scripts/audio-manifest.mjs`.

## Controls

Click the canvas to lock the mouse, then:

| Input | Action |
|---|---|
| Mouse | Free look — completely decoupled from the opponent |
| WASD | Move relative to where the camera is looking |
| Left click | Fire your gun — hitscan, long range, needs real aim (tight cone). Reticle turns red exactly when the shot would land — it's the same cone the hit check uses, not a looser assist that lies |
| R | Reload — magazine holds 8 rounds; dry-firing on empty just clicks |
| Right click | Punch — short range, forgiving aim cone. The gun lives in your right hand, so this is always a left hook |
| Shift (hold) | Block |
| Ctrl | Dodge sideways |
| Space | Jump |
| Hold E (meter full) | Charge → release for special |
| Esc | Pause |

Camera is third-person, over-the-shoulder — you see your own fighter's
body, not floating first-person arms.

The AI opponent's gun never misses (it has no camera to aim badly with),
so incoming AI damage is scaled down (`AI_DAMAGE_SCALE` in `lib/combat.ts`)
to compensate — the player's own damage output is untouched.

## Status vs. the PRD

Implemented: 12 arenas, third-person FPS+melee combat (gun with limited
ammo + reload, aim-assist reticle, punch, block, dodge, jump), combo meter,
charge-up special with cinematic camera + real ElevenLabs voice line, story
mode with a boss ladder, imported Mixamo character animation, coliseum
spectator crowds, hit-reactive decals/particles/lighting, AI opponent,
character select, HUD, tutorial, result screen, home screen with theme
music, original lore.

Not implemented (out of MVP scope per PRD §3/§9): online/local multiplayer,
true physics destruction, mobile touch controls.
