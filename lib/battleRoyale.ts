// Battle Royale: a fully separate mode from the 1v1 game (own store —
// lib/storeBR.ts, own online relay — lib/onlineBR.ts, own screens under
// components/screens/BattleRoyaleRoot.tsx) sharing only character data and
// a few pure helpers with the 1v1 engine. Up to BR_MAX_PLAYERS real people
// join one room by code — no AI fills empty slots, the room simply starts
// once the host has enough players in. A Smash-Bros-style multi-platform
// stage: smaller fighters, numeric HP instead of a bar, a stock (lives)
// count per fighter, and falling below the stage costs a stock same as
// hitting 0 HP does.

export const BR_MIN_PLAYERS = 3;
export const BR_MAX_PLAYERS = 8;
export const BR_STOCKS = 3;
export const BR_MAX_HEALTH = 400; // smaller than 1v1's 850-1300 — with only 3 stocks each, a KO should read as a real event, not a war of attrition

// --- stage: one dedicated multi-platform arena, shown in full (no
// scrolling camera — with up to 8 fighters at once, a 1v1-style following
// camera doesn't make sense; everyone just needs to always be on screen). ---
export const BR_STAGE_WIDTH = 22; // world units, full width always visible
export const BR_GROUND_Y = 5.2; // main platform's y (world units DOWN from the top of the playable area)
// A real, near-full-width ground floor sits below the whole Battlefield-
// style layout — walking off the main platform's edges (or the floaters')
// just means falling a bit further and landing on THIS instead of dying,
// same "there should be a ground so players can't just fall off" ask. The
// only way to actually lose a stock now is either getting knocked off the
// SIDES of the ground (past BR_KILL_X — the classic Smash side-blast-zone,
// still real: a hard hit near the edge can still ring someone out) or
// straight down past BR_KILL_Y, which sits well below the ground itself
// so a normal fall can never reach it — only relevant if a fighter is
// knocked off the very edge with enough sideways momentum to clear the
// ground's own width first.
export const BR_FLOOR_Y = 7.6;
export const BR_FLOOR_WIDTH = 19;
export const BR_KILL_X = BR_FLOOR_WIDTH / 2 + 1.5; // ~1.5 units of open air past the floor's edge before it's a stock
export const BR_KILL_Y = 12; // straight-down death plane — well below the floor, only reachable by missing it entirely off the side

export interface BRPlatform {
  x: number; // center, world units, 0 = stage center
  y: number; // world units down from the top
  w: number; // width, world units
  solid: boolean; // can't fall through from any direction. Floaters: land on top only (one-way), fall/jump straight through from below or the side.
}

// A Battlefield-style layout: a full safety-net floor, one wide mid-height
// base, and three floaters (left/right/top-center) above it — always
// something to jump to, and never a bottomless drop from a casual misstep.
export const BR_PLATFORMS: BRPlatform[] = [
  { x: 0, y: BR_FLOOR_Y, w: BR_FLOOR_WIDTH, solid: true },
  { x: 0, y: BR_GROUND_Y, w: 15, solid: true },
  { x: -6, y: 3.0, w: 4, solid: false },
  { x: 6, y: 3.0, w: 4, solid: false },
  { x: 0, y: 1.2, w: 4.6, solid: false },
];

// Evenly spread starting/respawn X's along the main platform — assigned to
// slots in join order, so who spawns where is deterministic and never
// stacks two fighters on the same point.
export const BR_SPAWN_X = [-6, -4.3, -2.6, -0.9, 0.9, 2.6, 4.3, 6];
export const BR_RESPAWN_Y = -1.5; // fighters respawn falling in from just above the stage, same "drop in" beat every stock

// --- combat: deliberately simpler than the 1v1 engine (no combo strings,
// no parry, no throw, no elemental statuses) — a fast, readable brawl for
// up to 8 people at once is a different design goal than a deep 1v1 duel,
// and keeping this pass scoped is what makes it shippable at all. Damage
// numbers are tuned around BR_MAX_HEALTH/BR_STOCKS above, not reused from
// lib/combat.ts's 1v1 numbers. ---
export const BR_ATTACKS = {
  punch: { damage: 22, reach: 1.05, hitstun: 220, windup: 60, active: 70, recovery: 110, knockback: 0.55 },
  kick: { damage: 34, reach: 1.15, hitstun: 320, windup: 100, active: 90, recovery: 170, knockback: 0.95 },
};
export const BR_SPECIAL = { damage: 65, meterNeeded: 100, windup: 500, knockback: 1.6 };
export const BR_MOVE_SPEED = 5.6; // world units/sec — a bit faster than 1v1's since the stage is wider and fights are more chaotic
export const BR_JUMP = { velocity: 8.6, gravity: 19.5 }; // a bit higher than the first pass — more air time to actually reach the floaters
export const BR_RESPAWN_INVULN_MS = 1500;
export const BR_FIGHTER_H_FRAC = 0.16; // fraction of canvas height — noticeably smaller than 1v1's fighters (0.27), per "characters will be smaller"

// --- items: picked up by walking over them (no separate pickup key), with
// a large variety of distinct effects. Instant ones apply immediately;
// thrown ones (bomb/freeze trap) launch automatically in the fighter's
// facing direction the moment they're picked up — deliberately no
// separate "hold and throw later" input, so item pickup stays exactly as
// simple as everything else in this game (walk over it, something
// happens), instead of adding a whole new button just for battle royale. ---
export type BRItemKind = "heal" | "mega_heal" | "damage_boost" | "shield" | "speed_boost" | "bomb" | "spring" | "star" | "freeze_trap";

export interface BRItemDef {
  kind: BRItemKind;
  label: string;
  glyph: string;
  color: string;
  weight: number; // relative spawn chance
}

export const BR_ITEM_DEFS: Record<BRItemKind, BRItemDef> = {
  heal: { kind: "heal", label: "Heal", glyph: "+", color: "#5cff8a", weight: 22 },
  mega_heal: { kind: "mega_heal", label: "Mega Heal", glyph: "++", color: "#2effc7", weight: 6 },
  damage_boost: { kind: "damage_boost", label: "Power Up", glyph: "⚡", color: "#ffcf3d", weight: 14 },
  shield: { kind: "shield", label: "Shield", glyph: "◈", color: "#5cc8ff", weight: 12 },
  speed_boost: { kind: "speed_boost", label: "Speed Boots", glyph: "»", color: "#ff8fd8", weight: 14 },
  bomb: { kind: "bomb", label: "Bomb", glyph: "●", color: "#3a3a3a", weight: 12 },
  spring: { kind: "spring", label: "Spring Boots", glyph: "^", color: "#c9ff5c", weight: 12 },
  star: { kind: "star", label: "Mog Star", glyph: "★", color: "#ffe94d", weight: 4 },
  freeze_trap: { kind: "freeze_trap", label: "Freeze Trap", glyph: "❄", color: "#9de8ff", weight: 10 },
};
export const BR_ITEM_KINDS = Object.keys(BR_ITEM_DEFS) as BRItemKind[];

export const BR_ITEM_EFFECTS = {
  healAmount: 130,
  megaHealAmount: 400, // a full heal
  damageBoostMult: 1.6,
  damageBoostMs: 9000,
  shieldMs: 4000,
  speedBoostMult: 1.5,
  speedBoostMs: 8000,
  bombDamage: 90,
  bombRadius: 2.2,
  bombSpeed: 6,
  springLaunchVel: 11,
  starMs: 6000, // full invuln + contact damage aura
  starAuraDamage: 8, // per tick while someone's touching you
  freezeStunMs: 1800,
  freezeSpeed: 5.5,
}

export function pickWeightedItem(): BRItemKind {
  const total = BR_ITEM_KINDS.reduce((sum, k) => sum + BR_ITEM_DEFS[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of BR_ITEM_KINDS) {
    roll -= BR_ITEM_DEFS[k].weight;
    if (roll <= 0) return k;
  }
  return BR_ITEM_KINDS[0];
}

export const BR_ITEM_SPAWN_INTERVAL_MS = 3200;
export const BR_ITEM_MAX_ON_FIELD = 5;
