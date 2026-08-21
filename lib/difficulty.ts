// AI difficulty tiers — a single persisted preference (localStorage, same
// pattern as tutorialSeen/storySave) that scales every knob runAI already
// has (lib/store.ts) plus the AI-damage asymmetry compensation (see
// AI_DAMAGE_SCALE's old home in lib/combat.ts, now per-tier here instead of
// a single flat constant). Applies uniformly to versus-mode AI and every
// story-mode fight — one setting, not a separate picker per mode.

export type DifficultyId = "rookie" | "fighter" | "veteran" | "nightmare";

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  description: string;
  damageScale: number; // multiplies AI-dealt damage (see resolveDamage in lib/combat.ts)
  decisionMs: [number, number]; // [min, max] ms between normal (non-aggressive) AI decisions — lower = faster reactions
  decisionMsAggressive: [number, number]; // same, while cornered/pressing (see runAI's aggressive mode)
  blockChance: number; // 0..1, reactive guard roll on a fresh player swing
  blockChanceAggressive: number;
  attackChance: number; // 0..1, roll to actually swing when in range on a decision tick
  comboChance: number; // 0..1, chance an attack decision commits to a full named combo string instead of one hit
  comboChanceAggressive: number;
  punishChance: number; // 0..1, chance the AI actually capitalizes on a punish window at all (see aiPunishUntil)
  holdGroundChance: number; // 0..1, chance a periodic movement-intent roll picks "just stand there" over approach/reposition
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  rookie: {
    id: "rookie",
    label: "Rookie",
    description: "Learn the moves — mostly just swings, rarely blocks or punishes.",
    damageScale: 0.42,
    decisionMs: [420, 780],
    decisionMsAggressive: [260, 520],
    blockChance: 0.22,
    blockChanceAggressive: 0.38,
    attackChance: 0.65,
    comboChance: 0.12,
    comboChanceAggressive: 0.22,
    punishChance: 0.35,
    holdGroundChance: 0.5,
  },
  fighter: {
    id: "fighter",
    label: "Fighter",
    description: "A fair fight — the original balance.",
    damageScale: 0.78,
    decisionMs: [300, 700],
    decisionMsAggressive: [180, 400],
    blockChance: 0.5,
    blockChanceAggressive: 0.78,
    attackChance: 0.85,
    comboChance: 0.3,
    comboChanceAggressive: 0.5,
    punishChance: 0.85,
    holdGroundChance: 0.4,
  },
  veteran: {
    id: "veteran",
    label: "Veteran",
    description: "Reads your rhythm and makes whiffed attacks expensive.",
    damageScale: 0.95,
    decisionMs: [200, 460],
    decisionMsAggressive: [120, 280],
    blockChance: 0.62,
    blockChanceAggressive: 0.85,
    attackChance: 0.9,
    comboChance: 0.4,
    comboChanceAggressive: 0.6,
    punishChance: 1,
    holdGroundChance: 0.25,
  },
  nightmare: {
    id: "nightmare",
    label: "Nightmare",
    description: "Full power, near-instant reflexes. Good luck.",
    damageScale: 1.15,
    decisionMs: [120, 300],
    decisionMsAggressive: [80, 180],
    blockChance: 0.75,
    blockChanceAggressive: 0.92,
    attackChance: 0.95,
    comboChance: 0.55,
    comboChanceAggressive: 0.7,
    punishChance: 1,
    holdGroundChance: 0.15,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["rookie", "fighter", "veteran", "nightmare"];
export const DEFAULT_DIFFICULTY: DifficultyId = "fighter";

const KEY = "mogoff_difficulty";

export function readDifficulty(): DifficultyId {
  if (typeof window === "undefined") return DEFAULT_DIFFICULTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && raw in DIFFICULTIES) return raw as DifficultyId;
  } catch {
    /* ignore — private browsing / storage unavailable, just use the default */
  }
  return DEFAULT_DIFFICULTY;
}

export function saveDifficulty(id: DifficultyId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
