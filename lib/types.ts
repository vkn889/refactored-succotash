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
  /** Display name shown in the special-move banner, e.g. "Chain Pull". */
  name: string;
  damage: number;
  meterGain: number;
  /** Launches a traveling elemental projectile across the stage instead of
   * a close-range burst — most specials do. */
  projectile?: boolean;
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
  /** True final boss renders as a non-humanoid sprite (see Fighter2D's boss
   * branch) instead of the standard humanoid paper-doll rig. */
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
  // fogColor/fogDensity/layout were 3D-only (fog volume, arena floor
  // geometry variant) — no longer read by the 2D stage renderer. Left in
  // place rather than stripped from all 12 arenas' data for a cosmetic-only
  // cleanup.
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
