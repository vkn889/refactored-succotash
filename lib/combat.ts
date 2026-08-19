import { CHARACTERS } from "./characters";
import type { Build, CharacterConfig, MoveConfig } from "./types";

// Centralized combat resolver. Every character routes through these pure
// functions so balancing the roster is a data change, not a code change.
//
// FPS + melee: LMB fires each fighter's gun (hitscan, long range, needs real
// aim), RMB throws a punch (the gun lives in the right hand, so the punch is
// always a left-hand strike — see components/game/MixamoFighter.tsx's
// "punch" clip). Both resolve the instant you press the button, checked
// against where things actually are right then
// (reach/range + a facing cone for the player's own attacks) — never
// re-checked after some animation delay, which is what let clicks whiff
// silently in the old weapon-swing system (position could change in the gap
// between windup and the delayed hit-check).

export interface Vec2 {
  x: number;
  z: number;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export const ARENA = {
  radius: 24, // movable floor radius; fighters are clamped a bit inside it
  moveMargin: 2,
  minSeparation: 0.75, // fighters can't fully overlap
};

export const RANGE = {
  reach: 3.2, // generous melee reach — forgiving like Minecraft's attack range
  facingConeRad: (60 * Math.PI) / 180, // player must be roughly looking at the target
  playerSpeed: 4.6, // units/sec
  aiSpeed: 3.6,
  dodgeDistance: 1.6,
};

/** Every fighter carries one gun — no inventory, just a real ranged option
 * alongside the punch. Long reach, real fire-rate cooldown, a magazine that
 * empties and needs reloading, and an actual aim requirement (tighter cone
 * than melee — you have to be looking at your target, not just generally
 * facing them). `aimConeRad` does double duty as the aim-assist cone: the
 * reticle turns red exactly when a shot would land, so "red = it'll hit" is
 * always literally true, not a separate looser assist radius that lies. */
export const GUN = {
  damage: 16,
  meterGain: 5,
  range: 22,
  aimConeRad: (18 * Math.PI) / 180,
  cooldownMs: 320,
  recoveryMs: 180, // recoil animation length — cosmetic, doesn't gate the next shot beyond cooldownMs
};

export const AMMO = {
  magSize: 100,
  reloadMs: 1500,
};

export const JUMP = {
  velocity: 5.4, // units/sec, initial upward speed
  gravity: 15, // units/sec^2
};

/** Shared base punch damage — per-character feel comes from BUILD_POWER
 * below (reusing each character's existing `build`), not a second set of
 * per-character numbers to maintain. */
export const PUNCH = {
  light: { damage: 14, meterGain: 4 },
  heavy: { damage: 24, meterGain: 7 },
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
  light: { windup: 60, active: 70, recovery: 90 },
  heavy: { windup: 110, active: 90, recovery: 170 },
  block: { engage: 80 },
  dodge: { duration: 260 },
  hitstun_light: 200,
  hitstun_heavy: 340,
  chargeMin: 350,
  chargeMax: 2200,
  specialRelease: 1900,
  cooldown: 550,
};

export function getCharacter(id: string): CharacterConfig {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}

export function getSpecial(characterId: string): MoveConfig {
  return getCharacter(characterId).moves.special;
}

/** Damage + meter gain for a light/heavy punch, scaled by the character's
 * build. */
export function getPunchMove(characterId: string, kind: "light" | "heavy") {
  const base = PUNCH[kind];
  const power = BUILD_POWER[getCharacter(characterId).build];
  return { damage: Math.round(base.damage * power.damage), meterGain: base.meterGain };
}

/** Total swing animation length in ms, optionally scaled by a character's
 * build speed (bulkier = slower windup/recovery). Purely cosmetic — hit
 * detection never waits on this, see the comment at the top of the file. */
export function attackDuration(kind: "light" | "heavy", characterId?: string): number {
  const t = TIMING[kind];
  const speed = characterId ? BUILD_POWER[getCharacter(characterId).build].speed : 1;
  return (t.windup + t.active + t.recovery) / speed;
}

// The AI opponent's gun never misses (resolveShot in lib/store.ts skips the
// aim-cone check entirely when there's no attackerYaw — it has no camera to
// aim badly with), and it fires close to every decision tick. At parity
// damage that's meaningfully harder than symmetric — the player has to
// actually aim and can whiff, the AI can't. Scale incoming AI damage down to
// compensate, without touching what the player's own attacks deal.
export const AI_DAMAGE_SCALE = 0.55;

/** Damage actually applied after block mitigation (chip damage still gets
 * through) and, for AI attacks specifically, the difficulty scale above. */
export function resolveDamage(rawDamage: number, defenderBlocking: boolean, attackerIsAI = false): number {
  const mitigated = defenderBlocking ? rawDamage * 0.18 : rawDamage;
  return Math.round(attackerIsAI ? mitigated * AI_DAMAGE_SCALE : mitigated);
}

export function meterAfterHit(current: number, gain: number): number {
  return Math.min(100, current + gain);
}
