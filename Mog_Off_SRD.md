# Mog Off — System Requirements Document (SRD)

**Version:** 1.0
**Status:** Draft
**Companion to:** Mog_Off_PRD.md

---

## 1. Purpose

This document defines the technical architecture, systems, and asset pipeline required to build and deploy Mog Off, a first-person anime-style fighting game, as a web application hosted on Vercel.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Deploys natively on Vercel, no config needed |
| 3D Rendering | Three.js via React Three Fiber | Web-native, good performance, large ecosystem |
| Physics | Rapier (via @react-three/rapier) or Cannon-es | Hit detection, knockback, ragdoll-lite reactions |
| State Management | Zustand | Match state, health, meter, input state |
| Animation | Mixamo-rigged skeletons + Three.js AnimationMixer | Shared rig across roster for reuse |
| Asset Format | .glb (Draco/Meshopt compressed) | Keeps file sizes web-friendly |
| Audio | Howler.js or native Web Audio API | SFX and ambient arena audio |
| Deployment | Vercel | Static/SSR hybrid via Next.js, CDN-served assets |

---

## 3. System Architecture

### 3.1 High-Level Structure
- **Client-only game loop** for v1: all combat logic, physics, and rendering run in-browser. No authoritative server required for single-player/local modes.
- If online multiplayer is added later: a lightweight WebSocket relay (e.g., via a separate Node service or a service like PartyKit) would be needed, since Vercel's serverless functions are not suited to persistent real-time connections. This is deferred per PRD open questions.

### 3.2 Core Modules

**Game State Manager**
- Zustand store holding: current character, opponent, health, special meter, match timer, match phase (select/fight/result).

**Input System**
- Keyboard (WASD movement/strafe) + mouse (aim, attack, block) mapped to an input abstraction layer so control schemes can be remapped later.

**Combat System**
- Hit detection via physics raycasts/colliders on attack animations.
- Damage, combo counter, and meter-fill logic centralized in one combat resolver function to keep character-specific balancing data-driven (see Section 5).
- Power Meter state machine: `CHARGING_METER (0–100%) → READY → CHARGE_UP (on input hold) → SPECIAL_RELEASE → COOLDOWN → CHARGING_METER`. `CHARGE_UP` triggers the cinematic camera sequence and voice-line playback in sync; character is flagged interruptible during this window per game design.

**Camera Controller**
- Default first-person rig attached to player character's head/eye bone.
- Cinematic camera state machine: `FIRST_PERSON → CINEMATIC_TRANSITION → SCRIPTED_SHOT → RETURN_TRANSITION → FIRST_PERSON`, triggered by special/finisher/clash events.

**Weapon System**
- Per-character weapon socket (bone attachment point) with draw/holster state.
- Swapping weapon state swaps the active moveset/animation set.

**Environment Reactivity System**
- Event-driven decal placement and particle emission tied to combat events (hit landed, special triggered, ground impact).
- Per-arena shader/material parameters (e.g., emissive intensity, frost spread mask) driven by match state.

**Animation System**
- Shared Mixamo-standard skeleton across all characters for reusable base animations (idle, walk, punch, kick, block, hit react, knockdown, victory).
- Character-specific specials layered on top as unique clips.

---

## 4. Asset Pipeline (AI-Generated)

### 4.1 Pipeline Stages
1. **Concept generation:** AI image generation (e.g., Midjourney/Flux) for character/weapon/arena concept art.
2. **3D model generation:** AI 3D tools (Tripo AI, 3D AI Studio, or similar) convert concept art to textured 3D meshes.
3. **Rigging:** Auto-rig via the same AI tool or Mixamo/AccuRig, targeting a shared humanoid skeleton standard across the roster.
4. **Animation:** Apply Mixamo animation library to the shared rig; custom specials via AI motion capture (e.g., DeepMotion) or manual keyframing (e.g., Cascadeur) where needed.
5. **Texturing:** AI-generated texture maps (diffuse/albedo, normal, roughness/metalness) styled per character/arena element. Textures generated at source resolution then downscaled/compressed for web delivery.
6. **Optimization pass (manual):** Retopology/poly reduction if needed, texture compression (KTX2/Basis), model export to `.glb` with Draco/Meshopt compression.
7. **Integration:** Import into the React Three Fiber scene graph, wire into animation and combat systems.

### 4.2 Texture Requirements
- All textures AI-generated, targeting PBR-compatible maps (albedo, normal, roughness, optional emissive for elemental glow effects).
- Texture resolution capped per asset type to control load size: characters up to 2K, environments up to 2K per tiled material, UI/effects textures smaller (512–1K).
- Emissive maps required for any element with a glow component (fire, ice crystal shine, tech circuitry, lightning).

### 4.3 Voice Line Pipeline (ElevenLabs)
- Each character's signature line (see PRD 6.7) is generated **once, offline, during production** via the ElevenLabs API — never called live during gameplay, to avoid runtime latency and per-play API cost.
- Process: assign each character a distinct ElevenLabs voice matching their personality → generate the line → export as compressed `.mp3`/`.ogg` → store as a static asset (`public/audio/voices/<character-id>.mp3`) served from Vercel's CDN.
- Playback triggered client-side (Howler.js or Web Audio API) at the start of the `CHARGE_UP` state, timed to sync with the cinematic camera sequence and any charge-up VFX.
- Target file size per line: under ~150KB (short line, compressed) to keep total roster voice payload small.

### 4.4 Asset Budget (Performance Targets)
- Character model: target under 15K triangles per fighter (first-person arm view can use a simplified high-detail mesh separate from the full-body third-person opponent model).
- Arena environment: target under 100K triangles total per scene, with texture atlasing where possible.
- Total scene asset payload per match: target under ~25MB compressed, to keep load times reasonable on Vercel's CDN.

---

## 5. Data-Driven Character Design

Character stats and moves should be defined in structured data (JSON/TS config) rather than hardcoded, so the same combat resolver works for all 12 characters:

```
{
  "id": "gautham",
  "element": "fire",
  "health": 1000,
  "weapon": "chain-spear",
  "moves": {
    "light": { "damage": 20, "animation": "gautham_punch_light", "meterGain": 5 },
    "heavy": { "damage": 40, "animation": "gautham_punch_heavy", "meterGain": 10 },
    "special": { "damage": 150, "animation": "gautham_special_chainpull", "cinematic": true }
  }
}
```

This keeps roster expansion (M4 in the PRD) a matter of adding data + assets rather than new code paths.

---

## 6. Non-Functional Requirements

- **Performance:** Stable 60fps target on mid-range desktop hardware; degrade gracefully (reduced particle density, lower texture resolution) on lower-end devices.
- **Load time:** Initial playable state under ~10s on a typical broadband connection, with progressive asset loading (character select loads low-res previews, full assets stream in on match start).
- **Browser support:** Modern evergreen browsers with WebGL2 support (Chrome, Edge, Firefox, Safari).
- **Deployment:** Fully deployable via `vercel deploy` / Git integration with no custom server required for v1 scope.

---

## 7. Risks

- AI-generated 3D assets may need significant manual cleanup for game-ready use (topology, rigging edge cases) — budget time for this per character.
- Cinematic camera system is technically the highest-complexity piece and should be proven on one character (per PRD M2) before scaling to all 12.
- If multiplayer is added later, real-time networking is a substantial scope addition not covered by this v1 architecture.

---

## 8. Open Technical Decisions

- Physics engine choice (Rapier vs. Cannon-es) — pending prototype testing for performance with 12 unique movesets.
- Whether third-person opponent models are simplified LOD versions of the same asset as the first-person arms, or separate models entirely.
- Texture compression pipeline tooling (manual vs. automated build step).
