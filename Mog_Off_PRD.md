# Mog Off — Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Draft
**Platform:** Web (Next.js, deployed on Vercel)

---

## 1. Overview

Mog Off is a first-person, anime-inspired fighting game playable in the browser. Players see the fight through their character's eyes (fists, weapons, and elemental powers in view), face off against AI or other players across a roster of 12 elemental-powered fighters, and trigger cinematic camera moments during specials, weapon clashes, and finishers.

The tone is stylized and over-the-top rather than simulation-accurate, closer to an anime fight scene than a boxing sim.

---

## 2. Goals

- Deliver a playable, browser-based first-person fighting game deployed on Vercel with no install required.
- Support a 12-character roster, each with a unique element, weapon, and visual identity.
- Make specials and finishers feel cinematic through scripted camera and environment reactions, not just numeric damage.
- Ship an MVP that is fun with 2 characters and 1 arena before scaling to the full roster.

## 3. Non-Goals (for v1)

- Full online matchmaking / ranked ladder (local or simple peer connection only, if multiplayer is included at all in v1)
- True physics-based environment destruction (visual/decal-based reactivity only)
- Mobile touch controls (desktop keyboard + mouse only for v1)

---

## 4. Target Audience

- Players who enjoy stylized fighting games and anime combat aesthetics
- Friend group / community project audience initially (the roster is based on real people)
- Casual browser-game players who want something playable without downloads

---

## 5. Core Gameplay Loop

1. Player selects a fighter from the roster.
2. Match loads into that fighter's themed arena.
3. Player fights in first-person: strafing, punching/kicking, blocking, drawing weapons, and triggering elemental specials.
4. Landing combos builds a special meter; full meter unlocks a cinematic finisher.
5. Match ends on KO or time-out; winner/loser screen with stats.

---

## 6. Feature Requirements

### 6.1 Combat System
- First-person melee combat: light attack, heavy attack, block/parry, dodge/strafe.
- Weapon draw/holster toggle per character (fists ↔ signature weapon).
- Combo system with a visible meter that fills on successful hits.
- Special move triggers a scripted cinematic camera sequence (brief third-person or dramatic first-person zoom) before returning control to the player.
- Weapon-vs-weapon clashes trigger a short slow-motion "clash" beat.

### 6.1.1 Power Meter & Charge-Up Special
- Landing hits fills a per-match "Power Meter." Once full, the player can hold a dedicated input to enter a charge-up state.
- During charge-up: intensified elemental screen effects (heat shimmer, frost creep, static crackle, etc.), character is briefly vulnerable to interruption, camera pulls into a dramatic first-person zoom.
- On release: the special/finisher fires, synced to a signature voice line (see 6.7) and a scripted cinematic camera beat, then control returns to the player.
- This is the primary "anime power-up moment" of the game and should be the most polished single beat in the moveset.

### 6.2 Roster (12 Characters)
Gautham (fire), Garv (ice), Anvith (electric/monk), Ryan (brawler/grappler), Chandan (speed/trickster, daggers), Elango (earth/tank, stone mace), Dev (tech/gadgets, drone), Aadit (shapeshifter/mimic), Rishi (swordsman, blade), Ronith (wind/aerial), Tej (lightning kickboxer), Viraat (final boss / composite abilities).

Each character requires:
- A rigged first-person arm/hand model (and a full third-person model for use as the opponent)
- A signature weapon model (where applicable)
- A unique special move with a distinct visual effect
- A themed arena tied to their element

### 6.3 Environments
- One arena per character's element (fire, ice, tech, earth, wind, etc.), generated using AI 3D/environment tools and AI-generated textures.
- Environmental reactivity: decals, particle effects, and lighting shifts tied to hits and specials (e.g., frost spreading across the floor, scorch marks, cracked ground).
- Dynamic skybox and rim-lighting per arena to reinforce the anime tone.

### 6.4 Camera System
- Default first-person view during neutral gameplay.
- Scripted cinematic camera transitions for specials, finishers, and weapon clashes.
- Smooth return to first-person control after cinematic beats.

### 6.5 UI/UX
- Character select screen with roster grid.
- In-match HUD: health bar, special meter, timer.
- Post-match result screen.

### 6.6 Audio
- Per-character hit sounds, special sound effects, and voice-style impact barks (optional, stretch goal).
- Arena ambient audio matched to element theme.

### 6.7 Signature Voice Lines (AI-Generated, ElevenLabs)
Each character has one signature line delivered during their charge-up/special cinematic, generated once via the ElevenLabs API and shipped as a static audio asset (no live API calls during gameplay).

| Character | Line |
|---|---|
| Gautham (Fire) | "Burn with me!" |
| Garv (Ice) | "Everything ends in silence." |
| Anvith (Electric/Monk) | "Feel the current." |
| Ryan (Brawler) | "Down you go!" |
| Chandan (Trickster) | "Catch me if you can." |
| Elango (Earth) | "The ground remembers." |
| Dev (Tech) | "Running final sequence." |
| Aadit (Shapeshifter) | "I've already won this fight." |
| Rishi (Swordsman) | "One cut is enough." |
| Ronith (Wind) | "Try to keep up." |
| Tej (Lightning Kickboxer) | "Too fast, too late." |
| Viraat (Final Boss) | "I built this arena. I decide who leaves it." |

Each character should be assigned a distinct ElevenLabs voice matched to their personality (e.g., gravelly for Ryan, cold and measured for Garv, sharp and quick for Chandan) during asset production.

---

## 7. AI-Generated Asset Pipeline

All visual assets (character models, weapons, environments, textures) are intended to be AI-generated to keep production feasible for a small/solo team:

- **Character models & rigs:** AI 3D generation tools (e.g., Tripo AI, 3D AI Studio) from concept art, auto-rigged for Mixamo-compatible animation.
- **Animations:** Mixamo library as a base (punches, kicks, blocks, hit reactions), reused across the shared rig, with select custom specials via AI mocap or hand-keyframing.
- **Weapons:** AI 3D generation from reference prompts/images, matched stylistically to each character.
- **Environment geometry:** AI-assisted 3D environment generation, kept low-poly enough for real-time web rendering.
- **Textures:** Fully AI-generated (diffuse, normal, roughness maps) using AI texture/image generation tools, styled per-arena to match each character's element (embers/lava for Gautham, frost/crystal for Garv, circuitry for Dev, etc.).
- All AI-generated assets go through a manual pass for game-readiness (poly count, UV cleanup, file size) before import.

---

## 8. Success Metrics (MVP)

- Playable build deployed on Vercel with at least 2 selectable characters and 1 arena.
- Combat feels responsive (attack input to visual feedback under ~150ms perceived latency).
- At least one full special-move cinematic sequence implemented end-to-end as a template.
- Build runs at a stable frame rate in a modern browser on mid-range hardware.

---

## 9. Milestones

1. **M1 — Prototype:** First-person arena, movement, punch/block vs. a dummy opponent.
2. **M2 — Weapons & Specials:** Weapon draw system, one full special with cinematic camera.
3. **M3 — Environment Reactivity:** Decals/particles/lighting tied to hits and element.
4. **M4 — Roster Expansion:** Remaining 10 characters using the systems built in M1–M3.
5. **M5 — Polish & Deploy:** UI, audio, character select, final Vercel deployment.

---

## 10. Open Questions

- Single-player vs. AI opponents vs. local/online multiplayer (affects backend scope significantly).
- Story mode / ladder structure, or versus-only for v1.
- Whether Viraat is a playable character from the start or unlocked as a final boss.
