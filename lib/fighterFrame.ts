import type { ActionState } from "./store";

/** Everything a fighter body renderer (MixamoFighter, BossFighter) needs to
 * render one frame, supplied by whoever is driving it — the live match
 * store (GameCanvas), a local demo simulation (the home-screen attract
 * fight), or a static preview (character select). The renderer itself never
 * reads global state directly, which is what lets the same body component
 * serve all three call sites. */
export interface FighterFrame {
  action: ActionState;
  actionTotal: number;
  actionTimer: number;
  chargeHeld: number;
  meter: number;
  x: number;
  z: number;
  faceX: number;
  faceZ: number;
  /** Increments on every *landed, non-blocked* hit this fighter takes — the
   * renderer watches for a change to trigger a knockback impulse. */
  hitToken: number;
  /** World height above the ground (jump arc) — only the player currently
   * has a real jump (`playerY` in lib/store.ts), so every other producer of
   * a FighterFrame just omits this and gets the sensible default
   * (grounded). Drives both the actual rendered vertical offset and which
   * jump clip plays (see MixamoFighter). */
  y?: number;
}
