import { SPRITE_ROWS, spriteFilterFor, getRowImage, type SpriteSelection } from "./spriteAtlas";

// Bitmap sprite renderer — draws one fighter from the shared warrior
// spritesheet (see lib/spriteAtlas.ts for the frame manifest, per-action
// frame selection, and per-character recolor). Replaced the original
// procedural "paper doll" renderer (hand-authored joint-angle poses drawn
// as rounded rectangles) once a real donated spritesheet became available;
// see the mog-off-game memory for why/when that swap happened and exactly
// how the sheet's rows were extracted. `computePose`/`Pose` are gone —
// `selectSprite` in lib/spriteAtlas.ts is the direct replacement, returning
// a row+frame instead of joint angles.

export interface FighterColors {
  primary: string;
  secondary: string;
  emissive: string;
}

// The sheet's own natural "standing" frame height (idle row) — every row's
// frame is scaled relative to this one constant so proportions across
// different animations (a full standing idle vs. a short collapsed KO
// frame) stay internally consistent instead of each row being stretched to
// fill the same box.
const REFERENCE_H = SPRITE_ROWS.idle.h;

/** Draws one fighter, feet-anchored at (groundX, groundY) in canvas pixels
 * (where groundY is the true floor line, NOT lifted for a jump — the
 * shadow stays planted there while `liftPx` raises just the sprite above
 * it, instead of both floating together), roughly `heightPx` tall (actual
 * rendered height varies a little frame-to-frame since real art, unlike
 * vector limbs, has a natural silhouette per pose), facing `facing` (1 =
 * right, -1 = left). The source sheet's own default facing is LEFT (see
 * spriteAtlas.ts), so facing=1 is the direction that gets mirrored here —
 * the opposite of the old procedural rig's right-authored convention. */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  sel: SpriteSelection,
  colors: FighterColors,
  characterId: string,
  groundX: number,
  groundY: number,
  heightPx: number,
  facing: 1 | -1,
  liftPx = 0,
  shadow = false
) {
  ctx.save();
  ctx.translate(groundX, groundY);

  const H = heightPx;

  // ground shadow — stays planted at groundY, shrinking a touch as the
  // fighter lifts away from it for a little depth cueing.
  const shrink = Math.min(1, liftPx / (H * 0.8)) * 0.3;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 3, H * 0.26 * (1 - shrink), H * 0.06 * (1 - shrink), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -liftPx);

  // emissive glow (special windup/release), drawn behind the sprite
  if (sel.glow > 0) {
    const cy = -H * 0.5;
    const grad = ctx.createRadialGradient(0, cy, 0, 0, cy, H * 0.75);
    grad.addColorStop(0, hexAlpha(colors.emissive, 0.5 * sel.glow));
    grad.addColorStop(1, hexAlpha(colors.emissive, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, cy, H * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }

  const row = SPRITE_ROWS[sel.row];
  const img = getRowImage(sel.row);
  const scale = H / REFERENCE_H;
  const destH = row.h * scale * sel.squashY;
  const destW = row.w * scale;

  ctx.scale(-facing, 1);
  if (img) {
    // Shadow mode: a flat black silhouette instead of the normal
    // per-character hue-rotate recolor — brightness(0) crushes every pixel
    // to black while leaving the sprite's own alpha (its outline) intact,
    // which is the standard CSS-filter silhouette trick.
    ctx.filter = shadow ? "brightness(0)" : spriteFilterFor(characterId, colors);
    ctx.drawImage(img, sel.frameIndex * row.w, 0, row.w, row.h, -destW / 2, -destH, destW, destH);
    ctx.filter = "none";
  } else {
    // Image not loaded yet (or failed) — a simple silhouette placeholder so
    // there's never a blank gap before/if it finishes loading.
    ctx.fillStyle = hexAlpha(colors.primary, 0.6);
    ctx.beginPath();
    ctx.roundRect(-destW * 0.3, -destH, destW * 0.6, destH, destW * 0.15);
    ctx.fill();
  }

  ctx.restore();
}

/** A permanent pulsing void aura + slow-orbiting motes drawn BEHIND a
 * humanoid boss (Viraat — `isStoryBoss`, see lib/characters.ts) for the
 * whole fight, not just BossReveal.tsx's pre-fight splash — so the "crazy
 * design" boss treatment reads throughout the actual match, not only in a
 * cutscene. Overmog doesn't use this at all; its own body (drawBoss above)
 * already is the whole design. Call before drawFighter so the aura sits
 * behind the sprite. */
export function drawBossAura(ctx: CanvasRenderingContext2D, colors: FighterColors, groundX: number, groundY: number, heightPx: number, timeMs: number) {
  ctx.save();
  ctx.translate(groundX, groundY - heightPx * 0.42);
  const pulse = 0.7 + Math.sin(timeMs / 700) * 0.3;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, heightPx * 0.9);
  grad.addColorStop(0, hexAlpha(colors.emissive, 0.22 * pulse));
  grad.addColorStop(1, hexAlpha(colors.emissive, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, heightPx * 0.9, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    const a = timeMs / 2600 + (i / 4) * Math.PI * 2;
    const r = heightPx * 0.62;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r * 0.4 - heightPx * 0.1;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.fillStyle = hexAlpha(colors.emissive, 0.6);
    ctx.fillRect(-heightPx * 0.02, -heightPx * 0.04, heightPx * 0.04, heightPx * 0.08);
    ctx.restore();
  }
  ctx.restore();
}

export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Overmog's body — not a thirteenth friend, so it doesn't get the standard
 * humanoid sprite at all (see lib/characters.ts). A hovering fractured core
 * with orbiting shards instead, matching the 3D version's design intent —
 * fully untouched by the bitmap-sprite swap above.
 *
 * `intensity` (0..1, default 0 — static previews/CharacterSelect just omit
 * it) is a real boss-phase escalation driven by how much health it's lost
 * (see Stage2D.tsx), not flavor: rotation speeds up, the glow brightens,
 * and a second outer ring of shards joins in past the halfway mark — the
 * fight visibly gets more dangerous-looking as it goes, the same
 * "awakened form" beat BossReveal.tsx's splash previews at full intensity
 * before the fight even starts. */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  glow: number,
  colors: FighterColors,
  originX: number,
  originY: number,
  heightPx: number,
  timeMs: number,
  intensity = 0
) {
  ctx.save();
  const hoverAmp = 1 + intensity * 0.6;
  const hover = Math.sin(timeMs / 400) * heightPx * 0.03 * hoverAmp;
  ctx.translate(originX, originY - heightPx * 0.5 + hover);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, heightPx * 0.5 - hover, heightPx * 0.3, heightPx * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const glowAmt = 0.35 + glow * 0.5 + intensity * 0.35;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, heightPx * (0.6 + intensity * 0.15));
  grad.addColorStop(0, hexAlpha(colors.emissive, glowAmt));
  grad.addColorStop(1, hexAlpha(colors.emissive, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, heightPx * (0.6 + intensity * 0.15), 0, Math.PI * 2);
  ctx.fill();

  // fractured diamond core, rotating faster the more damage it's taken
  const coreR = heightPx * 0.22;
  const rot = timeMs / (1800 - intensity * 900);
  ctx.save();
  ctx.rotate(rot * 0.3);
  ctx.fillStyle = colors.secondary;
  ctx.beginPath();
  ctx.moveTo(0, -coreR);
  ctx.lineTo(coreR * 0.7, 0);
  ctx.lineTo(0, coreR);
  ctx.lineTo(-coreR * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hexAlpha(colors.emissive, 0.9);
  ctx.fillRect(-coreR * 0.15, -coreR * 0.6, coreR * 0.3, coreR * 1.2);
  ctx.restore();

  // orbiting shards — an inner ring always present, a second outer ring
  // joining in only once intensity crosses the halfway mark (the visible
  // "phase 2" moment).
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2;
    const r = heightPx * 0.42;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r * 0.5;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.fillStyle = hexAlpha(colors.emissive, 0.8);
    ctx.fillRect(-heightPx * 0.03, -heightPx * 0.06, heightPx * 0.06, heightPx * 0.12);
    ctx.restore();
  }
  if (intensity > 0.5) {
    const outerFade = Math.min(1, (intensity - 0.5) * 2);
    const outerCount = 7;
    for (let i = 0; i < outerCount; i++) {
      const a = -rot * 1.4 + (i / outerCount) * Math.PI * 2;
      const r = heightPx * 0.58;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r * 0.5;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.globalAlpha = outerFade;
      ctx.fillStyle = hexAlpha(colors.secondary, 0.85);
      ctx.fillRect(-heightPx * 0.022, -heightPx * 0.045, heightPx * 0.044, heightPx * 0.09);
      ctx.restore();
    }
  }

  ctx.restore();
}
