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

export const RANGE = {
  reach: 1.35, // melee reach for both punch and kick — forgiving, Minecraft-attack-range style
  specialReach: 1.6, // close-range (non-projectile) specials get a little extra
  moveSpeed: 5.2, // units/sec — faster than the old fixed-camera stage's 3.4, so crossing the bigger arena doesn't feel sluggish
  aiSpeed: 4.4,
};

export const JUMP = {
  velocity: 5.2,
  gravity: 15,
};

/** Shared base punch/kick damage — per-character feel comes from
 * BUILD_POWER below (reusing each character's existing `build`), not a
 * second set of per-character numbers to maintain. */
export const ATTACK: Record<AttackKind, { damage: number; meterGain: number }> = {
  punch: { damage: 14, meterGain: 4 },
  kick: { damage: 24, meterGain: 7 },
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
  punch: { windup: 60, active: 70, recovery: 90 },
  kick: { windup: 110, active: 90, recovery: 170 },
  hitstun_punch: 200,
  hitstun_kick: 340,
  specialWindup: 500,
  cooldown: 550,
};

/** Traveling projectile specials — see fireSpecial in lib/store.ts. */
export const PROJECTILE = {
  speed: 6.5, // units/sec
  hitRadius: 0.55,
};

// The AI opponent always faces the player and never whiffs a decision the
// way a badly-aimed human might — incoming AI damage is scaled down to
// compensate, same idea as the old 3D version's gun-accuracy asymmetry,
// just carried over as a flat difficulty knob now that there's no aiming
// at all on either side. Player's own damage output is untouched.
export const AI_DAMAGE_SCALE = 0.7;

export function getCharacter(id: string): CharacterConfig {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}

export function getSpecial(characterId: string): MoveConfig {
  return getCharacter(characterId).moves.special;
}

/** Damage + meter gain for a punch/kick, scaled by the character's build. */
export function getAttackMove(characterId: string, kind: AttackKind) {
  const base = ATTACK[kind];
  const power = BUILD_POWER[getCharacter(characterId).build];
  return { damage: Math.round(base.damage * power.damage), meterGain: base.meterGain };
}

/** Damage actually applied after block mitigation (chip damage still gets
 * through) and, for AI attacks specifically, the difficulty scale above. */
export function resolveDamage(rawDamage: number, defenderBlocking: boolean, attackerIsAI = false): number {
  const mitigated = defenderBlocking ? rawDamage * 0.18 : rawDamage;
  return Math.round(attackerIsAI ? mitigated * AI_DAMAGE_SCALE : mitigated);
}

export function meterAfterHit(current: number, gain: number): number {
  return Math.min(100, current + gain);
}
