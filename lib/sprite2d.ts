import type { ActionState } from "./store";
import type { Accessory } from "./types";

// Procedural "paper doll" fighter renderer — a stand-in for real bitmap
// spritesheets (none exist yet; drop real ones into a future asset pipeline
// and swap this out per character without touching Stage2D/Fighter2D). The
// discipline that matters for reading as retro is the same either way:
// discrete named poses per action, no smooth blending between them, drawn
// onto a small internal canvas that gets scaled up with nearest-neighbor
// filtering (see Fighter2D.tsx) so edges stay crisp and blocky like a real
// low-res sprite instead of looking like smooth vector art.

export interface Pose {
  headY: number; // extra vertical offset on the head, for idle breathing
  torsoLean: number; // radians, whole upper body rotation around the hip
  frontArm: number; // radians, "forward from hanging straight down" — see forwardAngle()
  backArm: number;
  frontLeg: number;
  backLeg: number;
  bodyRotate: number; // radians, rotates the ENTIRE figure around the hip (for KO)
  bodyScaleY: number; // 1 = normal height, <1 = crouched/squashed
  glow: number; // 0..1, emissive aura strength (special-move windup/release)
}

/** Degrees "forward" (toward the direction the character faces) from a limb
 * hanging straight down, converted to the canvas rotation that actually
 * produces that visual direction once everything is authored assuming
 * facing = +1 (right) and mirrored for facing = -1 by the caller. Canvas
 * rotate() is clockwise-positive in a Y-down space, so swinging toward +X
 * (forward, when facing right) is a NEGATIVE angle — this helper hides that
 * so every pose below just reads as "how many degrees forward". */
function fwd(deg: number): number {
  return (-deg * Math.PI) / 180;
}

const IDLE: Pose = { headY: 0, torsoLean: 0, frontArm: fwd(22), backArm: fwd(14), frontLeg: fwd(7), backLeg: fwd(-7), bodyRotate: 0, bodyScaleY: 1, glow: 0 };
const CROUCH: Pose = { headY: 0, torsoLean: 0, frontArm: fwd(10), backArm: fwd(5), frontLeg: fwd(18), backLeg: fwd(-18), bodyRotate: 0, bodyScaleY: 0.78, glow: 0 };
const BLOCK: Pose = { headY: 0, torsoLean: fwd(-4), frontArm: fwd(108), backArm: fwd(96), frontLeg: fwd(10), backLeg: fwd(-4), bodyRotate: 0, bodyScaleY: 0.96, glow: 0 };
const HITSTUN: Pose = { headY: -2, torsoLean: fwd(-18), frontArm: fwd(-30), backArm: fwd(40), frontLeg: fwd(-10), backLeg: fwd(22), bodyRotate: 0, bodyScaleY: 1, glow: 0 };
const KO: Pose = { headY: 0, torsoLean: 0, frontArm: fwd(-20), backArm: fwd(30), frontLeg: fwd(10), backLeg: fwd(-6), bodyRotate: fwd(-95), bodyScaleY: 1, glow: 0 };
const AIR: Pose = { headY: -2, torsoLean: 0, frontArm: fwd(55), backArm: fwd(-35), frontLeg: fwd(35), backLeg: fwd(38), bodyRotate: 0, bodyScaleY: 1, glow: 0 };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    headY: lerp(a.headY, b.headY, t),
    torsoLean: lerp(a.torsoLean, b.torsoLean, t),
    frontArm: lerp(a.frontArm, b.frontArm, t),
    backArm: lerp(a.backArm, b.backArm, t),
    frontLeg: lerp(a.frontLeg, b.frontLeg, t),
    backLeg: lerp(a.backLeg, b.backLeg, t),
    bodyRotate: lerp(a.bodyRotate, b.bodyRotate, t),
    bodyScaleY: lerp(a.bodyScaleY, b.bodyScaleY, t),
    glow: lerp(a.glow, b.glow, t),
  };
}

function walkPose(t: number): Pose {
  const s = Math.sin(t / 90);
  return {
    headY: Math.abs(Math.sin(t / 90)) * -1.5,
    torsoLean: fwd(6),
    frontArm: fwd(20 - s * 24),
    backArm: fwd(10 + s * 24),
    frontLeg: fwd(s * 26),
    backLeg: fwd(-s * 26),
    bodyRotate: 0,
    bodyScaleY: 1,
    glow: 0,
  };
}

function idlePose(t: number): Pose {
  return { ...IDLE, headY: Math.sin(t / 550) * -1.5 };
}

// progress: 0 at the start of the windup, 1 at the end of recovery.
function punchPose(progress: number): Pose {
  const windup: Pose = { ...IDLE, frontArm: fwd(-35), torsoLean: fwd(-6) };
  const active: Pose = { ...IDLE, frontArm: fwd(102), torsoLean: fwd(10), frontLeg: fwd(16) };
  if (progress < 0.3) return lerpPose(IDLE, windup, progress / 0.3);
  if (progress < 0.55) return lerpPose(windup, active, (progress - 0.3) / 0.25);
  return lerpPose(active, IDLE, (progress - 0.55) / 0.45);
}

function kickPose(progress: number): Pose {
  const windup: Pose = { ...IDLE, backLeg: fwd(-55), frontArm: fwd(45), backArm: fwd(-10) };
  const active: Pose = { ...IDLE, backLeg: fwd(118), frontLeg: fwd(-8), torsoLean: fwd(-14), frontArm: fwd(60), backArm: fwd(-20) };
  if (progress < 0.4) return lerpPose(IDLE, windup, progress / 0.4);
  if (progress < 0.65) return lerpPose(windup, active, (progress - 0.4) / 0.25);
  return lerpPose(active, IDLE, (progress - 0.65) / 0.35);
}

function specialPose(progress: number): Pose {
  const windup: Pose = { ...IDLE, frontArm: fwd(150), backArm: fwd(150), torsoLean: fwd(-8), glow: Math.min(1, progress * 2.2) };
  const release: Pose = { ...IDLE, frontArm: fwd(100), backArm: fwd(100), torsoLean: fwd(14), glow: 1 };
  if (progress < 0.75) return lerpPose(IDLE, windup, progress / 0.75);
  return lerpPose(windup, release, (progress - 0.75) / 0.25);
}

/** Pick the pose for this frame — explicit actions win over locomotion,
 * locomotion wins over idle, matching the same priority scheme the old 3D
 * MixamoFighter used for its clip selection. `airborne` layers a tucked
 * jump pose on top of idle/walk/crouch (a mid-air punch/kick/block/hitstun
 * still shows as itself, just lifted — see Fighter2D's y offset). */
export function computePose(action: ActionState, actionTimer: number, actionTotal: number, airborne: boolean, timeMs: number): Pose {
  const progress = actionTotal > 0 ? 1 - actionTimer / actionTotal : 0;
  switch (action) {
    case "punch":
      return punchPose(progress);
    case "kick":
      return kickPose(progress);
    case "special":
      return specialPose(progress);
    case "hitstun":
      return HITSTUN;
    case "block":
      return BLOCK;
    case "ko":
      return KO;
    case "crouch":
      return airborne ? AIR : CROUCH;
    case "cooldown":
      return idlePose(timeMs);
    case "walk":
      return airborne ? AIR : walkPose(timeMs);
    case "idle":
    default:
      return airborne ? AIR : idlePose(timeMs);
  }
}

export interface FighterColors {
  primary: string;
  secondary: string;
  emissive: string;
}

// A handful of warm brown skin tones, picked deterministically per
// character (hashed off their existing color palette, so no new per-
// character data field is needed) — every roster fighter is named after
// one of the twelve real friends this game is about, so the roster reads
// as human and Indian rather than a uniform robot squad in matching armor.
const SKIN_TONES = ["#8d5a3c", "#a9714a", "#c68a5b", "#d9a374", "#7a4a2e", "#b97a4f"];
const HAIR_COLOR = "#1c140f";

function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash;
}

function pickSkinTone(colors: FighterColors): string {
  return SKIN_TONES[hashStr(colors.primary + colors.secondary) % SKIN_TONES.length];
}

type HairStyle = "short" | "long" | "spiky" | "buzzed" | "parted" | "curly" | "mohawk" | "ponytail";
type FacialHair = "none" | "mustache" | "beard" | "stubble";

interface FaceVariant {
  hair: HairStyle;
  facialHair: FacialHair;
  browAngle: number; // degrees, + = angry/inward, - = raised/surprised
}

// Eight curated looks (hairstyle + facial hair + brow attitude), picked
// deterministically off each character's own id — real per-character
// variety instead of every face being the same cap-and-dot-eyes template,
// without needing a new hand-authored data field per character.
const FACE_VARIANTS: FaceVariant[] = [
  { hair: "short", facialHair: "none", browAngle: 0 },
  { hair: "long", facialHair: "mustache", browAngle: 12 },
  { hair: "spiky", facialHair: "beard", browAngle: 18 },
  { hair: "buzzed", facialHair: "stubble", browAngle: 6 },
  { hair: "parted", facialHair: "none", browAngle: -10 },
  { hair: "curly", facialHair: "mustache", browAngle: -6 },
  { hair: "mohawk", facialHair: "stubble", browAngle: 20 },
  { hair: "ponytail", facialHair: "beard", browAngle: -4 },
];

function pickFaceVariant(characterId: string): FaceVariant {
  return FACE_VARIANTS[hashStr(characterId) % FACE_VARIANTS.length];
}

/** Draws one fighter, feet-anchored at (groundX, groundY) in canvas pixels
 * (where groundY is the true floor line, NOT lifted for a jump — the
 * shadow stays planted there while `liftPx` raises just the body above it,
 * instead of both floating together), `heightPx` tall, facing `facing`
 * (1 = right, -1 = left). Everything is authored assuming facing-right; a
 * single ctx.scale mirrors it for facing-left so pose math never needs to
 * branch on direction. */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  colors: FighterColors,
  accessory: Accessory,
  characterId: string,
  groundX: number,
  groundY: number,
  heightPx: number,
  facing: 1 | -1,
  liftPx = 0,
  isBoss = false
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
  ctx.scale(facing, 1);

  const hipY = -0.42 * H * pose.bodyScaleY;
  const shoulderY = -0.78 * H * pose.bodyScaleY;
  const headSize = isBoss ? 0.3 * H : 0.22 * H;
  const legLen = 0.42 * H * pose.bodyScaleY;
  const armLen = 0.36 * H;
  const legW = 0.14 * H;
  const armW = 0.12 * H;

  // emissive glow (special windup/release)
  if (pose.glow > 0) {
    const grad = ctx.createRadialGradient(0, hipY, 0, 0, hipY, H * 0.7);
    grad.addColorStop(0, hexAlpha(colors.emissive, 0.5 * pose.glow));
    grad.addColorStop(1, hexAlpha(colors.emissive, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, hipY, H * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.rotate(pose.bodyRotate);
  const skin = pickSkinTone(colors);

  // back limbs first (drawn behind torso) — dark shoes/hands at the tips
  // read as actual feet and fingers instead of bare colored blocks.
  drawLimb(ctx, -0.09 * H, hipY, pose.backLeg, legLen, legW, colors.secondary, HAIR_COLOR);
  drawLimb(ctx, -0.16 * H, shoulderY, pose.backArm, armLen, armW, colors.primary, skin);

  // torso — pivot at the hip (same point the legs pivot from) so leaning
  // rotates from the waist and the torso's bottom edge always meets the
  // legs with no gap, rather than floating detached from them. Rounded
  // corners soften the silhouette away from a flat-edged robot block.
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.torsoLean);
  const torsoH = shoulderY - hipY; // negative: torso extends upward from the hip
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.roundRect(-0.15 * H, torsoH, 0.3 * H, -torsoH, 0.05 * H);
  ctx.fill();
  // chest accent stripe (jersey/costume trim, not a robot panel)
  ctx.fillStyle = hexAlpha(colors.emissive, 0.85);
  ctx.fillRect(-0.15 * H, torsoH * 0.15, 0.3 * H, torsoH * 0.16);
  ctx.restore();

  // head — skin-toned face + a per-character hair/facial-hair/brow look
  // (see FACE_VARIANTS) + small dot eyes instead of a glowing visor bar,
  // so it reads as a specific person, not a sealed helmet or a template
  // repeated eighteen times.
  ctx.save();
  ctx.translate(0, shoulderY + pose.headY);
  const hw = headSize;
  const face = pickFaceVariant(characterId);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(-hw / 2, -hw, hw, hw, hw * 0.32);
  ctx.fill();

  drawHair(ctx, face.hair, hw);
  drawEyebrows(ctx, face.browAngle, hw);

  ctx.fillStyle = "#1a1410";
  ctx.fillRect(-hw * 0.3, -hw * 0.42, hw * 0.15, hw * 0.12);
  ctx.fillRect(hw * 0.15, -hw * 0.42, hw * 0.15, hw * 0.12);

  drawFacialHair(ctx, face.facialHair, hw);

  drawAccessory(ctx, accessory, hw, colors.emissive);
  ctx.restore();

  // front limbs (drawn in front of torso)
  drawLimb(ctx, 0.09 * H, hipY, pose.frontLeg, legLen, legW, colors.secondary, HAIR_COLOR);
  drawLimb(ctx, 0.16 * H, shoulderY, pose.frontArm, armLen, armW, colors.primary, skin);

  ctx.restore();
}

function drawLimb(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  angle: number,
  length: number,
  width: number,
  color: string,
  tipColor?: string
) {
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-width / 2, 0, width, length, width * 0.3);
  ctx.fill();
  if (tipColor) {
    ctx.fillStyle = tipColor;
    ctx.beginPath();
    ctx.arc(0, length, width * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Eight distinct hair silhouettes, all drawn relative to the head box
 * (x spans roughly [-hw/2, hw/2], y=0 is the chin, y=-hw is the top). */
function drawHair(ctx: CanvasRenderingContext2D, style: HairStyle, hw: number) {
  ctx.fillStyle = HAIR_COLOR;
  switch (style) {
    case "short":
      ctx.beginPath();
      ctx.roundRect(-hw / 2 - hw * 0.04, -hw - hw * 0.08, hw * 1.08, hw * 0.5, [hw * 0.4, hw * 0.4, hw * 0.1, hw * 0.1]);
      ctx.fill();
      break;
    case "long":
      ctx.beginPath();
      ctx.roundRect(-hw / 2 - hw * 0.04, -hw - hw * 0.08, hw * 1.08, hw * 0.5, [hw * 0.4, hw * 0.4, hw * 0.1, hw * 0.1]);
      ctx.fill();
      ctx.fillRect(-hw * 0.58, -hw * 0.55, hw * 0.16, hw * 0.75);
      ctx.fillRect(hw * 0.42, -hw * 0.55, hw * 0.16, hw * 0.75);
      break;
    case "spiky":
      ctx.beginPath();
      ctx.roundRect(-hw / 2 - hw * 0.02, -hw - hw * 0.02, hw * 1.04, hw * 0.38, [hw * 0.3, hw * 0.3, hw * 0.06, hw * 0.06]);
      ctx.fill();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * hw * 0.28, -hw - hw * 0.02);
        ctx.lineTo(i * hw * 0.28 - hw * 0.09, -hw - hw * 0.34);
        ctx.lineTo(i * hw * 0.28 + hw * 0.09, -hw - hw * 0.34);
        ctx.fill();
      }
      break;
    case "buzzed":
      ctx.beginPath();
      ctx.roundRect(-hw / 2, -hw - hw * 0.04, hw, hw * 0.16, [hw * 0.3, hw * 0.3, 0, 0]);
      ctx.fill();
      break;
    case "parted":
      // asymmetric — one side sits higher than the other, suggesting a comb-over part.
      ctx.beginPath();
      ctx.roundRect(-hw / 2 - hw * 0.04, -hw - hw * 0.14, hw * 0.62, hw * 0.5, [hw * 0.35, hw * 0.1, hw * 0.1, hw * 0.1]);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(hw * 0.02, -hw - hw * 0.02, hw * 0.5, hw * 0.34, [hw * 0.1, hw * 0.3, hw * 0.1, hw * 0.1]);
      ctx.fill();
      break;
    case "curly":
      ctx.beginPath();
      ctx.ellipse(0, -hw * 0.82, hw * 0.62, hw * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "mohawk":
      // a narrow center ridge only — the skin-toned head shows through on
      // both sides, reading as shaved rather than needing a separate fill.
      ctx.beginPath();
      ctx.roundRect(-hw * 0.12, -hw - hw * 0.22, hw * 0.24, hw * 0.6, hw * 0.08);
      ctx.fill();
      break;
    case "ponytail":
      ctx.beginPath();
      ctx.roundRect(-hw / 2 - hw * 0.04, -hw - hw * 0.08, hw * 1.08, hw * 0.42, [hw * 0.4, hw * 0.4, hw * 0.1, hw * 0.1]);
      ctx.fill();
      // hangs off the back of the head (facing +X = forward, so "back" is -X)
      ctx.beginPath();
      ctx.roundRect(-hw * 0.62, -hw * 0.5, hw * 0.18, hw * 0.7, hw * 0.08);
      ctx.fill();
      break;
  }
}

function drawEyebrows(ctx: CanvasRenderingContext2D, angleDeg: number, hw: number) {
  const angle = (angleDeg * Math.PI) / 180;
  ctx.fillStyle = HAIR_COLOR;
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * hw * 0.225, -hw * 0.52);
    ctx.rotate(-side * angle);
    ctx.fillRect(-hw * 0.09, -hw * 0.025, hw * 0.18, hw * 0.045);
    ctx.restore();
  }
}

function drawFacialHair(ctx: CanvasRenderingContext2D, style: FacialHair, hw: number) {
  if (style === "none") return;
  if (style === "mustache") {
    ctx.fillStyle = HAIR_COLOR;
    ctx.fillRect(-hw * 0.16, -hw * 0.22, hw * 0.32, hw * 0.06);
    return;
  }
  if (style === "beard") {
    ctx.fillStyle = HAIR_COLOR;
    ctx.beginPath();
    ctx.roundRect(-hw * 0.32, -hw * 0.2, hw * 0.64, hw * 0.24, [hw * 0.05, hw * 0.05, hw * 0.2, hw * 0.2]);
    ctx.fill();
    return;
  }
  // stubble — a faint tint rather than a solid shape
  ctx.fillStyle = "rgba(20,14,10,0.4)";
  ctx.beginPath();
  ctx.roundRect(-hw * 0.36, -hw * 0.24, hw * 0.72, hw * 0.28, [hw * 0.05, hw * 0.05, hw * 0.25, hw * 0.25]);
  ctx.fill();
}

function drawAccessory(ctx: CanvasRenderingContext2D, accessory: Accessory, headSize: number, emissive: string) {
  ctx.fillStyle = emissive;
  switch (accessory) {
    case "spikes":
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * headSize * 0.3, -headSize);
        ctx.lineTo(i * headSize * 0.3 - headSize * 0.08, -headSize * 1.4);
        ctx.lineTo(i * headSize * 0.3 + headSize * 0.08, -headSize * 1.4);
        ctx.fill();
      }
      break;
    case "crown":
      ctx.fillRect(-headSize * 0.4, -headSize * 1.25, headSize * 0.8, headSize * 0.25);
      break;
    case "topknot":
    case "scarf":
    case "hood":
      ctx.beginPath();
      ctx.arc(0, -headSize * 1.1, headSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "visor":
      ctx.fillRect(-headSize * 0.5, -headSize * 0.7, headSize, headSize * 0.16);
      break;
    default:
      break;
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Overmog's body — not a thirteenth friend, so it doesn't get the standard
 * humanoid rig at all (see lib/characters.ts). A hovering fractured core
 * with orbiting shards instead, matching the 3D version's design intent. */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  colors: FighterColors,
  originX: number,
  originY: number,
  heightPx: number,
  timeMs: number
) {
  ctx.save();
  const hover = Math.sin(timeMs / 400) * heightPx * 0.03;
  ctx.translate(originX, originY - heightPx * 0.5 + hover);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, heightPx * 0.5 - hover, heightPx * 0.3, heightPx * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const glow = 0.35 + pose.glow * 0.5;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, heightPx * 0.6);
  grad.addColorStop(0, hexAlpha(colors.emissive, glow));
  grad.addColorStop(1, hexAlpha(colors.emissive, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, heightPx * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // fractured diamond core, slowly rotating
  const coreR = heightPx * 0.22;
  const rot = timeMs / 1800;
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

  // orbiting shards
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

  ctx.restore();
}
