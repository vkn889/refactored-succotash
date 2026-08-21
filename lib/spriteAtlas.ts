import type { ActionState } from "./store";
import type { Stance } from "./combat";
import type { FighterColors } from "./sprite2d";
import { ROSTER } from "./characters";

// Real bitmap spritesheet support — swaps out the old procedural "paper
// doll" renderer's per-limb vector drawing for actual pixel-art frames cut
// from a single donated warrior spritesheet (public/sprites/warrior/*.png,
// extracted from the user-supplied reference sheet: each row below is a
// clean, label-free crop at that row's native frame size — see the
// extraction notes in the mog-off-game memory for exactly how the crop
// coordinates were derived). Every roster fighter draws from this SAME
// sheet — distinction between characters comes entirely from a runtime
// per-character recolor (see spriteFilterFor below), not eighteen separate
// asset sets. Overmog (the final boss) is untouched — still the fully
// separate procedural crystal-core body in drawBoss, since lore-wise it was
// never "one of the fighters" to begin with.

export interface SpriteRow {
  src: string;
  w: number; // native px width of ONE frame
  h: number; // native px height of ONE frame
  frames: number; // total frames in the row
}

// Every row shares one fixed cell size per row (confirmed against the
// source sheet's own printed metadata, then re-verified by cropping each
// range and visually checking the frames land cleanly with no bleed from
// neighboring frames or the label text above them).
export const SPRITE_ROWS = {
  idle: { src: "/sprites/warrior/idle.png", w: 47, h: 57, frames: 15 },
  walk: { src: "/sprites/warrior/walk.png", w: 54, h: 44, frames: 9 },
  atk: { src: "/sprites/warrior/atk.png", w: 75, h: 57, frames: 15 },
  guard: { src: "/sprites/warrior/guard.png", w: 38, h: 53, frames: 2 },
  damage: { src: "/sprites/warrior/damage.png", w: 36, h: 56, frames: 2 },
  dead: { src: "/sprites/warrior/dead.png", w: 59, h: 26, frames: 2 },
  special: { src: "/sprites/warrior/special.png", w: 50, h: 60, frames: 27 },
} satisfies Record<string, SpriteRow>;

export type SpriteRowId = keyof typeof SPRITE_ROWS;

// The "atk" row bundles a punch combo followed by a kick combo in one
// strip (visually confirmed by cropping and eyeballing the frames — frames
// 0-5 are a straight-punch combo, 6-11 a high-kick/spin-kick combo, 12-14 a
// settle-back-to-idle tail we don't need since our own action timer already
// ends the animation). Both punch and kick use the same sub-range
// regardless of stance (crouch/air) — the sheet doesn't have distinct
// crouching/aerial attack frames, so stance is still conveyed by the
// existing squash/lift transforms applied around the draw, just not by a
// different frame set.
const ATK_PUNCH = { start: 0, count: 6 };
const ATK_KICK = { start: 6, count: 6 };

/** Everything drawFighter (lib/sprite2d.ts) needs to blit one frame: which
 * row, which frame within it, and a couple of cheap cosmetic transforms
 * that stand in for stance/impact without needing dedicated art. */
export interface SpriteSelection {
  row: SpriteRowId;
  frameIndex: number;
  squashY: number; // 1 = normal, <1 = compressed (crouch)
  glow: number; // 0..1, special windup/release aura strength
}

function frameForProgress(count: number, progress: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(progress * count)));
}

/** Picks the row + frame for this instant — the bitmap-sprite equivalent
 * of the old computePose. Same priority scheme (explicit action beats
 * locomotion beats idle) and the same progress convention (0 at the start
 * of an action's windup, 1 at the end of its recovery, driven off the same
 * actionTimer/actionTotal every other system already uses) so an
 * animation always finishes exactly when the underlying action does,
 * never drifting out of sync with when a hit actually resolves. */
export function selectSprite(
  action: ActionState,
  actionTimer: number,
  actionTotal: number,
  airborne: boolean,
  timeMs: number,
  attackStance: Stance | null = null
): SpriteSelection {
  const progress = actionTotal > 0 ? 1 - actionTimer / actionTotal : 0;
  void attackStance; // stance still drives reach/damage/hitstun (lib/combat.ts) — the sheet just doesn't have separate crouch/air attack art to key off it visually
  switch (action) {
    case "punch":
      return { row: "atk", frameIndex: ATK_PUNCH.start + frameForProgress(ATK_PUNCH.count, progress), squashY: 1, glow: 0 };
    case "kick":
      return { row: "atk", frameIndex: ATK_KICK.start + frameForProgress(ATK_KICK.count, progress), squashY: 1, glow: 0 };
    case "special":
      return { row: "special", frameIndex: frameForProgress(SPRITE_ROWS.special.frames, progress), squashY: 1, glow: Math.min(1, progress * 2.2) };
    case "hitstun":
      return { row: "damage", frameIndex: frameForProgress(SPRITE_ROWS.damage.frames, progress), squashY: 1, glow: 0 };
    case "block":
      // Held pose, not a one-shot — toggles gently between the row's 2
      // frames on a fixed clock for the whole time block is held.
      return { row: "guard", frameIndex: Math.floor(timeMs / 220) % SPRITE_ROWS.guard.frames, squashY: 1, glow: 0 };
    case "ko":
      return { row: "dead", frameIndex: SPRITE_ROWS.dead.frames - 1, squashY: 1, glow: 0 };
    case "crouch":
      // No dedicated crouch art on the sheet — a held idle frame, visually
      // compressed toward the ground, reads as crouching without needing
      // new assets (same trick the old procedural CROUCH pose used via
      // bodyScaleY).
      return airborne ? { row: "idle", frameIndex: 0, squashY: 1, glow: 0 } : { row: "idle", frameIndex: 0, squashY: 0.82, glow: 0 };
    case "cooldown":
      return { row: "idle", frameIndex: Math.floor(timeMs / 110) % SPRITE_ROWS.idle.frames, squashY: 1, glow: 0 };
    case "walk":
      return { row: "walk", frameIndex: Math.floor(timeMs / 70) % SPRITE_ROWS.walk.frames, squashY: 1, glow: 0 };
    case "idle":
    default:
      return { row: "idle", frameIndex: Math.floor(timeMs / 110) % SPRITE_ROWS.idle.frames, squashY: 1, glow: 0 };
  }
}

// --- per-character recolor -------------------------------------------------
//
// One shared sheet, eighteen distinct-looking fighters: a CSS canvas filter
// (hue-rotate + saturate + a touch of brightness) applied at draw time
// shifts the sprite's own dominant color (a dark purple-magenta cape/gi,
// sampled directly from the source art) toward each character's identity
// color. This necessarily recolors the WHOLE sprite (skin/hair included,
// not just the outfit) since a global hue rotation can't selectively
// target one garment — the same trade-off classic 2D fighters make with
// palette-swap alt costumes.
//
// The recolor target is `colors.emissive`, not `colors.primary` — every
// roster character's `primary` is a deliberately near-black base tone (see
// lib/sprite2d.ts's old face-tone comment from the procedural-render era),
// so hue-rotating toward it produced near-identical washed-out results for
// most of the roster. `emissive` is the actual vivid per-character accent
// already used everywhere else (HUD bars, select-screen rings, special
// glow) and is what visibly distinguishes fighters today.
//
// Two roster characters' emissive hues happen to sit only ~1° apart
// (Mohammed/Dhanuh, both a green-teal "wind/kinetic" family pick from an
// earlier round, before a shared spritesheet made hue collisions visible)
// — no per-character filter can un-collide two colors that are this close
// to begin with. Rather than leave that to chance for the rest of the
// roster too, every character's hue is re-spread to an even 20°-apart slot
// around the color wheel (`characterHueTable` below), keeping each
// fighter's ORIGINAL relative hue ordering (so "warm" characters stay
// nearer each other than "cool" ones do) while guaranteeing a real minimum
// separation between every pair, Mohammed/Dhanuh included.
const BASE_HUE = 330;
const BASE_SAT = 0.33;
const BASE_LIGHT = 0.2;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

// Computed once at module load from the whole roster — evenly re-spaces
// every character's natural emissive hue around the wheel while preserving
// their relative order, so two characters that started out close in hue
// still end up guaranteed-distinct after recoloring.
const characterHueTable: Map<string, number> = (() => {
  const entries = ROSTER.map((c) => ({ id: c.id, hue: hexToHsl(c.colors.emissive).h }));
  entries.sort((a, b) => a.hue - b.hue);
  const step = 360 / entries.length;
  const map = new Map<string, number>();
  entries.forEach((e, i) => map.set(e.id, i * step));
  return map;
})();

const filterCache = new Map<string, string>();

/** A `ctx.filter` string that recolors the base sprite for this specific
 * roster character. Memoized per characterId (18 characters ⇒ 18 cache
 * entries for the lifetime of the tab, not recomputed per frame). Falls
 * back to a plain emissive-hue rotation (no re-spacing) for any id not in
 * the roster table — e.g. a boss/preview path that somehow reaches here. */
export function spriteFilterFor(characterId: string, colors: FighterColors): string {
  const cached = filterCache.get(characterId);
  if (cached) return cached;
  const { s, l } = hexToHsl(colors.emissive);
  const targetHue = characterHueTable.get(characterId) ?? hexToHsl(colors.emissive).h;
  let rotate = targetHue - BASE_HUE;
  rotate = ((rotate + 180) % 360 + 360) % 360 - 180; // normalize to [-180, 180] — shortest rotation either direction
  const satMul = Math.max(0.7, Math.min(4.5, (s || 0.15) / BASE_SAT));
  const brightness = Math.max(0.8, Math.min(1.6, 0.95 + (l - BASE_LIGHT) * 0.8));
  const filter = `hue-rotate(${rotate.toFixed(0)}deg) saturate(${satMul.toFixed(2)}) brightness(${brightness.toFixed(2)})`;
  filterCache.set(characterId, filter);
  return filter;
}

// --- image loading -----------------------------------------------------
// Same lazy-load-and-cache pattern Stage2D.tsx already uses for arena
// backgrounds — each row image is fetched once for the whole session no
// matter how many fighters/screens draw from it.
const rowImages: Partial<Record<SpriteRowId, HTMLImageElement | "loading" | "error">> = {};

export function getRowImage(row: SpriteRowId): HTMLImageElement | null {
  const cached = rowImages[row];
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "loading" || cached === "error") return null;
  const img = new Image();
  rowImages[row] = "loading";
  img.onload = () => {
    rowImages[row] = img;
  };
  img.onerror = () => {
    rowImages[row] = "error";
  };
  img.src = SPRITE_ROWS[row].src;
  return null;
}
