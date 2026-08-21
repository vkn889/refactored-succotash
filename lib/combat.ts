import { CHARACTERS } from "./characters";
import type { Build, CharacterConfig, MoveConfig } from "./types";

// Centralized combat resolver for the 2D retro fighter. Every character
// routes through these pure functions so balancing the roster is a data
// change, not a code change.
//
// Classic side-view fighting game rules: both fighters always face each
// other (no free camera/aim to worry about), movement is a single
// horizontal axis, and every attack resolves the instant the button is
// pressed against wherever things actually are right then — never
// re-checked after some animation delay, so a click can't whiff just
// because someone moved during the windup.

// A much bigger arena than a fixed-camera fighter needs — Stage2D's camera
// follows the midpoint between fighters within this range instead of
// showing the whole thing at once (see VIEW_WIDTH there), so the
// background visibly scrolls as you close or open distance.
export const STAGE = {
  width: 32, // playable x range is roughly [-15.4, 15.4]
  margin: 0.6,
  minSeparation: 0.9, // fighters can't fully overlap
};

export type AttackKind = "punch" | "kick";

/** Which stance a punch/kick was thrown from — the same button reads
 * differently depending on what the fighter is already doing, like a real
 * fighting game: a standing kick, a crouching sweep, and a jump-in kick are
 * three genuinely different moves (reach/damage/hitstun/recovery), not one
 * animation recolored three ways. Derived automatically from the fighter's
 * current crouch/airborne state at the moment the button is pressed — no
 * new input bindings needed. */
export type Stance = "stand" | "crouch" | "air";

export const RANGE = {
  reach: 1.35, // baseline melee reach — standing punch/kick, and the AI's own "am I in melee" distance check
  specialReach: 1.6, // close-range (non-projectile) specials get a little extra
  // units/sec — faster than the old fixed-camera stage's 3.4, so crossing
  // the bigger arena doesn't feel sluggish. The AI opponent, local
  // multiplayer's P2, and an online joiner's fighter all move at this same
  // speed as the player — there used to be a separate, slower `aiSpeed`
  // (4.4) just for the AI, which desynced its run-cycle animation from its
  // actual ground speed (the walk animation's stride was authored/tuned
  // against this speed) and read as a jerky, "off" run compared to the
  // player's own movement. One speed for every side, no exceptions.
  moveSpeed: 5.2,
};

export const JUMP = {
  velocity: 5.2,
  doubleJumpVelocity: 4.4, // the air-jump reads as a snappier second "flip" rather than matching the first jump's full arc
  gravity: 15,
};

/** Per-(kind, stance) attack data — damage/meter/reach/hitstun plus the raw
 * windup/active/recovery frames (scaled by BUILD_POWER's speed below). A
 * crouching kick is a long-reaching sweep with heavy hitstun but a slow,
 * punishable recovery; a jump kick trades a long committal windup for the
 * biggest damage and hitstun of any normal attack — the classic fighting-
 * game risk/reward shape. Crouching/aerial punches are quicker, lighter
 * pokes instead. Per-character feel still comes entirely from BUILD_POWER
 * (reusing each character's existing `build`), not a second per-character
 * table. */
export const ATTACKS: Record<AttackKind, Record<Stance, { damage: number; meterGain: number; reach: number; hitstun: number; windup: number; active: number; recovery: number }>> = {
  punch: {
    stand: { damage: 14, meterGain: 4, reach: 1.35, hitstun: 200, windup: 60, active: 70, recovery: 90 },
    crouch: { damage: 12, meterGain: 4, reach: 1.3, hitstun: 190, windup: 50, active: 60, recovery: 80 }, // quick low jab
    air: { damage: 15, meterGain: 5, reach: 1.45, hitstun: 230, windup: 90, active: 90, recovery: 130 }, // aerial jab
  },
  kick: {
    stand: { damage: 24, meterGain: 7, reach: 1.35, hitstun: 340, windup: 110, active: 90, recovery: 170 },
    crouch: { damage: 20, meterGain: 7, reach: 1.7, hitstun: 420, windup: 140, active: 100, recovery: 200 }, // sweeping low kick — long reach, big hitstun, slow to recover from if it whiffs
    air: { damage: 30, meterGain: 9, reach: 1.6, hitstun: 460, windup: 100, active: 110, recovery: 180 }, // jump kick — the flashiest, highest-payoff normal in the game
  },
};

/** Bulkier builds hit harder and slower; slimmer builds hit lighter and
 * faster. Reuses each character's existing `build` field (also shown as
 * "Fighting Style" in CharacterSelect) rather than a second stat to keep
 * in sync. */
export const BUILD_POWER: Record<Build, { damage: number; speed: number }> = {
  slim: { damage: 0.85, speed: 1.25 },
  normal: { damage: 1, speed: 1 },
  bulky: { damage: 1.15, speed: 0.9 },
  tank: { damage: 1.3, speed: 0.8 },
};

export const TIMING = {
  specialWindup: 500,
  cooldown: 550,
  specialHitstun: 340, // flat, independent of the punch/kick stance tables above
};

/** Everything resolveAttack (lib/store.ts) needs for one thrown punch/kick,
 * already scaled by the attacker's build — computed once at the moment the
 * attack is thrown and reused for both the animation timer and the hit
 * resolution a moment later, so the two can never disagree with each other. */
export interface AttackProfile {
  damage: number;
  meterGain: number;
  reach: number;
  hitstun: number;
  totalMs: number;
}

export function getAttackMove(characterId: string, kind: AttackKind, stance: Stance): AttackProfile {
  const base = ATTACKS[kind][stance];
  const power = BUILD_POWER[getCharacter(characterId).build];
  return {
    damage: Math.round(base.damage * power.damage),
    meterGain: base.meterGain,
    reach: base.reach,
    hitstun: base.hitstun,
    totalMs: Math.round((base.windup + base.active + base.recovery) / power.speed),
  };
}

/** Traveling projectile specials — see fireSpecial in lib/store.ts. */
export const PROJECTILE = {
  speed: 6.5, // units/sec
  hitRadius: 0.55,
};

/** Named 3-hit combo strings — punch/kick sequences that, thrown in order
 * within COMBO_WINDOW_MS of each other and each one actually connecting
 * (see resolveAttack in lib/store.ts), turn the 3rd hit into a bonus
 * "finisher": extra damage/meter plus a bigger hit-stop/screen-shake
 * flourish and an on-screen callout. Available to BOTH sides through the
 * same shared resolveAttack call site — the AI throws these too (see
 * runAI), not just a player-only flourish. Kept to kind-only sequences
 * (not stance-specific) so a player doesn't have to think about crouch/air
 * state to land one, just the rhythm of the buttons. */
export interface ComboDef {
  id: string;
  label: string; // HUD callout, e.g. "RUSH COMBO!"
  sequence: AttackKind[];
  damageMult: number; // applied to the finishing hit only
  meterMult: number;
}

export const COMBOS: ComboDef[] = [
  { id: "rush", label: "RUSH COMBO!", sequence: ["punch", "punch", "kick"], damageMult: 1.5, meterMult: 1.6 },
  { id: "overhead", label: "OVERHEAD SMASH!", sequence: ["kick", "kick", "punch"], damageMult: 1.6, meterMult: 1.6 },
  { id: "flurry", label: "FLURRY FINISH!", sequence: ["punch", "kick", "punch"], damageMult: 1.55, meterMult: 1.6 },
];

export const COMBO_WINDOW_MS = 700; // max gap between consecutive connecting hits for them to still chain

export function getCharacter(id: string): CharacterConfig {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}

export function getSpecial(characterId: string): MoveConfig {
  return getCharacter(characterId).moves.special;
}

/** Damage actually applied after block mitigation (chip damage still gets
 * through) and, for a genuinely AI-controlled attacker only, the current
 * difficulty tier's damage scale (see lib/difficulty.ts) — the AI opponent
 * always faces the player and never whiffs a decision the way a badly-aimed
 * human might, so incoming AI damage is scaled to compensate, same idea as
 * the old 3D version's gun-accuracy asymmetry. `aiDamageScale` is `null`
 * for a human attacker (the player, local-multiplayer P2, or an online
 * joiner) — those always deal full damage regardless of which "side" of
 * the store they happen to occupy. */
export function resolveDamage(rawDamage: number, defenderBlocking: boolean, aiDamageScale: number | null = null): number {
  const mitigated = defenderBlocking ? rawDamage * 0.18 : rawDamage;
  return Math.round(aiDamageScale != null ? mitigated * aiDamageScale : mitigated);
}

export function meterAfterHit(current: number, gain: number): number {
  return Math.min(100, current + gain);
}
