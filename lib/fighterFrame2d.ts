import type { ActionState } from "./store";
import type { Stance } from "./combat";

/** Everything Fighter2D needs to draw one frame of a fighter, supplied by
 * whoever is driving it — the live match store (Stage2D) or a static
 * preview (CharacterSelect, MatchupIntro). The renderer itself never reads
 * global state directly, same contract discipline the old 3D FighterFrame
 * used. */
export interface FighterFrame2D {
  action: ActionState;
  actionTotal: number;
  actionTimer: number;
  meter: number;
  x: number; // stage x, world units
  y: number; // jump height above ground, world units, 0 = grounded
  facing: 1 | -1; // 1 = facing right, -1 = facing left
  hitToken: number;
  /** Which stance a punch/kick was thrown from (see lib/combat.ts) — only
   * meaningful while action is "punch"/"kick". Static previews
   * (CharacterSelect, MatchupIntro) never throw a real attack, so they can
   * just omit this field entirely. */
  attackStance?: Stance | null;
}
