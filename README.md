# Mog Off

A retro 2D side-view fighting game for the browser, styled after the
Street Fighter / Mortal Kombat arcade era — punch, kick, block, jump, and
one signature special move per character, fought as a best-of-three match.
Eighteen elemental-powered fighters (all eighteen real friends this game
is about), a story mode with lore, save data, and two boss fights, local
and online multiplayer, one shared combat system. Built with Next.js +
Zustand + Canvas 2D, per `Mog_Off_PRD.md` / `Mog_Off_SRD.md` (both written
for an earlier 3D version of this project — see "History" below).

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Canvas 2D** — no 3D engine; fighters are procedurally drawn "paper
  doll" sprites (see below), not bitmap spritesheets, on a much larger
  stage with a camera that pans to follow the fighters
- **Zustand** — match state, combat resolver, AI opponent, story-mode
  ladder, best-of-three round tracking, local-multiplayer P2 input,
  online-multiplayer host/joiner state
- **Supabase Realtime (Broadcast + Presence)** — online multiplayer
  transport, join-code based, no database schema required
- **Howler.js** — music (theme, fight, stage-select, story prelude), SFX,
  per-arena ambience, voice lines (all carried over unchanged from the 3D
  version — audio is fully engine-agnostic)

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
```

Online multiplayer additionally needs a Supabase project — set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local` (Realtime Broadcast/Presence only, no tables or migrations
required) and restart the dev server, since `NEXT_PUBLIC_*` vars are
inlined at server-start time. Local multiplayer and everything else works
with no env vars at all.

`npm run build` / `npm run start` for a production build. Ships as static
output — no server runtime required, deploys as-is to Vercel.

## Project layout

- `lib/characters.ts` — the 18-fighter roster (stats, build, colors, arena, voice line, one special move each)
- `lib/arenas.ts` — one themed backdrop config per element
- `lib/story.ts` — the story-mode ladder (roster fights → Viraat gatekeeper → Overmog final boss)
- `lib/storySave.ts` — story-mode save data (localStorage), read/written by New Game / Load Game
- `lib/combat.ts` / `lib/store.ts` — combat resolver + Zustand game state machine (match phase, fighter FSM, best-of-three round tracking, 1D stage physics, projectile specials, AI opponent, story progression, local-multiplayer P2 actions, online role/phase state)
- `lib/online.ts` — Supabase Realtime transport for online multiplayer: join-code generation, host/joiner channel setup, presence-based peer detection, host state broadcast, joiner input relay
- `lib/fighterFrame2d.ts` — the `FighterFrame2D` shape (action/x/y/facing/etc.) every screen driving a `Fighter2D`/`Stage2D` conforms to
- `lib/sprite2d.ts` — the procedural fighter renderer: per-action pose definitions, per-character face/hair variants, and the actual canvas drawing code, shared by every screen that shows a fighter
- `lib/lore.ts` — world lore/copy, including the story-mode intro ("The Great Mog Off")
- `components/game/Stage2D.tsx` — the live fight's single canvas: a much larger scrolling arena with a camera that follows both fighters, photo backdrop + both fighters + projectiles, one draw pass
- `components/game/Fighter2D.tsx` — standalone single-fighter preview canvas (CharacterSelect, MatchupIntro)
- `components/game/PlayerInput2D.tsx` — single-player keyboard + mouse-click input (left-click punch, right-click kick)
- `components/game/LocalMultiplayerInput.tsx` — two-keyboard local co-op input (P1 arrows, P2 WASD)
- `components/game/OnlineJoinerInput.tsx` — joiner-side input that sends over the network instead of applying locally
- `components/game/GameLoop2D.tsx` — the match tick loop (host/single-player only; the online joiner never runs its own simulation)
- `components/screens/` — Home, StoryIntroScreen (New Game/Load Game), MultiplayerMenuScreen, OnlineLobbyScreen (host/join by code), CharacterSelect, FightScreen, ResultScreen (round transitions + final match result, branches for story mode)
- `components/ui/HUD.tsx`, `TutorialOverlay.tsx` — HUD overlay (with round-win pips) + first-fight controls tutorial

## Character art

No real spritesheets exist yet — every fighter is drawn procedurally
(`lib/sprite2d.ts`): a small "paper doll" of rounded rectangles (head,
torso, two arms, two legs) posed per action with hand-authored angles.
Clothing (torso/legs) uses each character's existing `colors` palette;
skin is a warm brown tone picked deterministically per character (hashed
off their palette, no extra data field needed) with dark hair, small dot
eyes, and a visible hand/shoe at each limb's tip — every roster fighter is
named after one of the eighteen real friends this game is actually about,
so the roster is drawn to read as human and Indian, not a squad of
identical robots in colored armor. A small accessory accent (spikes,
crown, visor, ...) sits on top of the hair per character. On top of that,
each character is assigned one of 8 curated face variants (hair style,
eyebrow shape, optional facial hair) via a second, independently-seeded
hash off their `characterId` — so two fighters who happen to share a skin
tone still read as visually distinct people, not palette swaps of the
same face. Everything renders to a small fixed-resolution canvas
(384×216) scaled up with `image-rendering: pixelated`, which is what
actually produces the chunky retro look here — not real pixel art.
Overmog (the final boss) gets an entirely different non-humanoid draw
path (`drawBoss`) — a hovering fractured crystal core with orbiting
shards, matching its lore (not a 19th fighter, not a person at all).

Swapping in real bitmap spritesheets later, per character, is meant to be
straightforward: `Fighter2D`/`Stage2D` only care about the
`FighterFrame2D` contract (action/x/y/facing), not how a frame gets
drawn — replace the calls into `lib/sprite2d.ts` with a real
sheet/frame-index lookup without touching combat, input, or the store.

Fight backdrops are the same real arena renders used for arena-select
thumbnails (`public/images/arenas/*.jpg`, already 16:9 — no cropping
needed against the 384×216 canvas), not a flat gradient — `Stage2D` draws
each one full-bleed with a light color wash + bottom vignette so it reads
as one cohesive scene with the flat-shaded sprites standing on it, and
falls back to a plain gradient sky/floor if an image is still loading or
missing.

`lib/characters.ts`'s `ROSTER_ORDER` now includes all eighteen friends
(everyone in `CHARACTERS` except Overmog, who isn't one of them at all).

## Visual style

The UI leans into a Street Fighter / Mortal Kombat arcade cabinet look:
a chrome-and-skew "arcade logo" treatment (`.arcade-logo` in
`app/globals.css`, used for the Mog Off title and screen headers),
beveled gold/orange/purple panel buttons with a double-gradient border
trick (`.arcade-panel*`), a CRT scanline overlay across the whole app
(`.crt-overlay`), and keyframed "FIGHT!" / K.O. stinger text on round and
match transitions.

## Audio assets

`public/audio/{voices,sfx,ambient}/*.mp3` and `public/audio/theme.mp3` are
committed static assets, unchanged from the original 3D version. On top of
that, three original tracks drive the game's music (`lib/audio.ts`'s
`MUSIC_TRACKS`): a fight/battle track that plays during live matches, a
stage-select track for character/arena picking, and a story-mode prelude
that plays over the "The Great Mog Off" story intro screen. The voice
lines, SFX, and arena ambience beds were generated **once, offline** via
the ElevenLabs API (never called live during gameplay). To regenerate:

```bash
export ELEVENLABS_API_KEY=...   # or set it in .env.local
node scripts/generate-audio.mjs # skips files that already exist; FORCE=1 to overwrite
```

Voice casting, SFX prompts, and ambience prompts live in
`scripts/audio-manifest.mjs`.

## Controls

No aiming — both fighters always face each other, just like a real
side-view fighter. Punch and kick can also be thrown with the mouse
(left-click punch, right-click kick) in single-player and as the online
joiner.

**Single player (P1 keys below) / online joiner:**

| Input | Action |
|---|---|
| A / D | Move left / right |
| W | Jump |
| S (hold) | Crouch |
| J or left-click | Punch — fast, light |
| K or right-click | Kick — slower, hits harder |
| L (hold) | Block — cuts incoming damage down a lot |
| U | Special, once your meter is full — either a close-range burst or a traveling elemental projectile, per character |
| Esc | Pause |

**Local multiplayer** splits the keyboard: Player 1 uses Arrow keys
(move/jump/crouch), `/` punch, `'` kick, right Shift block, Enter special;
Player 2 uses WASD, `F` punch, `G` kick, left Shift block, `E` special.

Matches are best of three rounds — first to 2 round wins takes the match;
health and position reset between rounds, score does not.

The AI opponent (single-player only — both local and online multiplayer
are human-vs-human) never whiffs a decision the way a human might, so
incoming AI damage is scaled down (`AI_DAMAGE_SCALE` in `lib/combat.ts`)
to compensate — the player's own damage output is untouched.

## Multiplayer

- **Local** — one keyboard, two players, split as above. Picked from the
  Home screen's MULTIPLAYER → LOCAL entry.
- **Online** — host/join via a 5-character code, over Supabase Realtime
  Broadcast + Presence (no database tables needed). The host runs the
  actual match simulation and broadcasts a state snapshot at ~20Hz; the
  joiner sends its input over the network and renders a pure mirror of
  whatever the host broadcasts, reusing the same P2 action set local
  multiplayer already uses. See the top comment in `lib/online.ts` for the
  full design and its explicit scoping (both players currently see the
  host's un-mirrored camera view — good enough for same-room-ish play,
  not a general netcode solution).

## Story mode

Story mode opens on its own title screen, "The Great Mog Off"
(`components/screens/StoryIntroScreen.tsx`), with the prelude track
playing and a choice of New Game or Load Game. Progress
(`lib/storySave.ts`) is saved to `localStorage` after every story fight —
resuming later picks back up at the next fighter in the ladder rather
than restarting. `lib/lore.ts`'s `STORY_INTRO` tells the framing lore
(the legendary fight between Gautham and Garv) shown on that title screen.

## History

This project started as a third-person 3D FPS+melee game (React Three
Fiber, imported Mixamo character rigs, a gun with ammo/reload, third-person
camera). That version is preserved and fully recoverable at the git tag
`archive/3d-fighting-game` — it was scrapped in favor of this simpler,
retro 2D approach per explicit request, not because it was broken. Lore,
roster data, story-mode structure, and every audio asset carried over
unchanged; only the rendering/combat/input engine is new.

## Status vs. the PRD

Implemented: retro 2D side-view combat (punch, kick, block, crouch, jump,
one elemental special per character — melee burst or traveling
projectile, mouse-click punch/kick), best-of-three matches, combo meter,
story mode with save data, lore intro, and a boss ladder, all eighteen
fighters selectable, a much larger scrolling stage with a camera that
follows both fighters, 8 curated face variants layered on top of the
per-character skin/palette system, 12 arena photo backdrops used both in
the live fight and selection thumbnails, AI opponent (single-player), a
Street Fighter/Mortal Kombat–styled retro UI (arcade logo, beveled
panels, CRT overlay, FIGHT!/K.O. stingers), local two-keyboard
multiplayer, online multiplayer via join codes (Supabase Realtime),
character select, HUD with round-win pips, tutorial, result screen,
static home screen with theme music, original lore.

Not implemented: real bitmap spritesheets (see "Character art" above),
mobile touch controls, joiner-side camera view (the online joiner
currently sees the host's camera framing rather than its own). The
original PRD/SRD describe the earlier 3D version's scope (FPS aiming,
coliseum crowds, etc.) and no longer fully match this build.
