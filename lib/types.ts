// Shared type definitions for the data-driven roster/arena system (SRD sec 5).

export type ElementId =
  | "fire"
  | "ice"
  | "electric"
  | "kinetic"
  | "speed"
  | "earth"
  | "tech"
  | "shift"
  | "steel"
  | "wind"
  | "lightning"
  | "void"
  | "prism"; // Overmog only — every element fused/refracted, story-mode final boss

export type Build = "slim" | "normal" | "bulky" | "tank";

/** Which imported Mixamo rig+animation set a character's 3D body uses (see
 * components/game/MixamoFighter.tsx). "vanguard" is defined for a future
 * second body but isn't wired to any character right now — its source FBX
 * hits a binary-format edge case three.js's FBXLoader can't parse
 * ("Unknown property type", verified via the thrown parse error), so every
 * roster fighter currently uses "ely", the one that actually loads,
 * recolored and given its own stats. */
export type ModelKey = "vanguard" | "ely";

export type Accessory =
  | "none"
  | "spikes"
  | "crystal"
  | "beads"
  | "hood"
  | "pauldron"
  | "visor"
  | "chrome"
  | "topknot"
  | "scarf"
  | "shins"
  | "crown";

export interface MoveConfig {
  damage: number;
  animation: string;
  meterGain: number;
  cinematic?: boolean;
}

export interface CharacterConfig {
  id: string;
  name: string;
  title: string;
  element: ElementId;
  bio: string;
  health: number;
  build: Build;
  /** Imported rig this character's 3D body uses — omitted for the boss
   * model (Overmog), which always renders via BossFighter.tsx instead. */
  modelKey?: ModelKey;
  accessory: Accessory;
  arenaId: string;
  voiceLine: string;
  /** Short pre-fight quips, randomly picked for the matchup cutscene. */
  introLines: string[];
  colors: {
    primary: string;
    secondary: string;
    emissive: string;
  };
  moves: {
    special: MoveConfig;
  };
  unlockedByDefault: boolean;
  isFinalBoss?: boolean;
  /** Mid-ladder story-mode gatekeeper — distinct from isFinalBoss. */
  isStoryBoss?: boolean;
  /** True final boss uses an entirely different model (see BossFighter.tsx),
   * not the standard per-character Fighter rig. */
  useBossModel?: boolean;
}

export type ArenaEra = "primordial" | "ancient" | "medieval" | "futuristic";

export interface ArenaConfig {
  id: string;
  name: string;
  element: ElementId;
  era: ArenaEra;
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  fogDensity: number;
  floorColor: string;
  floorEmissive: string;
  rimLight: string;
  ambientTrack: string;
  particle: "embers" | "snow" | "sparks" | "dust" | "petals" | "leaves" | "ash" | "motes";
  layout: "ring" | "rows" | "scattered" | "floating";
  description: string;
}

export interface LootItem {
  id: number;
  kind: "heal" | "stadium";
  x: number;
  z: number;
  bornAt: number;
}
