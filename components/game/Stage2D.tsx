"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { getCharacter, STAGE, COMEBACK } from "@/lib/combat";
import { ARENAS } from "@/lib/arenas";
import { drawFighter, drawBoss, drawBossAura, type FighterColors } from "@/lib/sprite2d";
import { selectSprite } from "@/lib/spriteAtlas";

// Fixed internal resolution, scaled up via CSS. Bumped 1.5x from the
// original 384×216 and switched off nearest-neighbor upscaling (see the
// canvas's imageRendering below) — every shape here is vector-drawn (see
// lib/sprite2d.ts's top comment) rather than a real bitmap sprite, so more
// backing-store pixels plus a smooth upscale reads as sharper/more detailed
// character art instead of the harsher chunky-block look the original
// resolution + nearest-neighbor combination produced.
const W = 576;
const H = 324;
const GROUND_Y = H * 0.82;
const FIGHTER_H = H * 0.27; // smaller relative to the arena now that it's much bigger

// The camera only ever shows this many world units of the (much wider)
// STAGE at once — it follows the midpoint between fighters within that
// window, clamped to the stage edges, which is what makes the background
// visibly scroll as the fight moves around the arena instead of the whole
// stage being visible all the time.
const VIEW_WIDTH = 13;
const PX_PER_UNIT = W / VIEW_WIDTH;
const CAMERA_BOUND = Math.max(0, STAGE.width / 2 - VIEW_WIDTH / 2);

// --- Juice pass: hit sparks + floating damage numbers, both driven purely
// off s.hitEvents (see HitEvent in lib/store.ts), and a camera punch-in on
// specials. None of this is React state — it's plain mutable arrays living
// on a ref alongside cameraX, advanced imperatively once per rAF tick same
// as everything else in this draw loop, so a burst of 8 sparks doesn't
// mean 8 re-renders.
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
interface DamageNumber {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  big: boolean;
}
interface Vfx {
  sparks: Spark[];
  numbers: DamageNumber[];
  lastHitId: number;
  zoom: number;
}

/** The live fight's single shared canvas: background + both fighters +
 * projectiles, all drawn in one pass so draw order between them is always
 * correct (two independently-looping canvases racing each other would make
 * "who's in front" unpredictable mid-combat). Reads the match store
 * imperatively every animation frame rather than through React state, same
 * discipline the old R3F useFrame loop used. */
export default function Stage2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Smoothed separately from the raw camera target so cuts/knockback don't
  // whip-pan the background; persists across frames via a ref since this
  // isn't React state.
  const cameraX = useRef(0);
  const vfx = useRef<Vfx>({ sparks: [], numbers: [], lastHitId: 0, zoom: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      draw(ctx, t, dt, cameraX, vfx.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "auto" }}
    />
  );
}

function worldToCanvasX(x: number, cam: number) {
  return W / 2 + (x - cam) * PX_PER_UNIT;
}

// Canvas text can't reference a CSS custom property directly (ctx.font
// wants a real font-family value) — next/font's generated family name(s)
// live in the --font-display variable set on <html> (see app/layout.tsx),
// so this reads it once out of computed style and caches the resolved
// string for the rest of the session.
let cachedDisplayFont: string | null = null;
function displayFontFamily(): string {
  if (cachedDisplayFont) return cachedDisplayFont;
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    if (v) cachedDisplayFont = v;
  }
  return cachedDisplayFont ?? "sans-serif";
}

function draw(ctx: CanvasRenderingContext2D, t: number, dt: number, cameraXRef: { current: number }, vfx: Vfx) {
  const s = useGameStore.getState();
  const arena = ARENAS[s.arenaId] ?? ARENAS.fire;
  const pChar = getCharacter(s.playerId);
  const oChar = getCharacter(s.opponentId);

  const targetCam = Math.max(-CAMERA_BOUND, Math.min(CAMERA_BOUND, (s.playerX + s.opponentX) / 2));
  cameraXRef.current += (targetCam - cameraXRef.current) * Math.min(1, dt * 6);
  const cam = cameraXRef.current;

  // Camera punch-in: either fighter mid-special zooms the whole scene in a
  // little, same instinct as a fighting game's hit-camera — smoothed on its
  // own timescale (slower than the shake, faster than the pan) so it reads
  // as a deliberate push rather than a jump-cut.
  const wantZoom = s.player.action === "special" || s.opponent.action === "special" ? 1.14 : 1;
  vfx.zoom += (wantZoom - vfx.zoom) * Math.min(1, dt * 5);

  spawnHitVfx(s, vfx, cam, pChar.colors, oChar.colors);
  stepVfx(vfx, dt);

  ctx.clearRect(0, 0, W, H);
  ctx.save();

  if (s.screenShake > 0) {
    const k = s.screenShake * 6;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  const zoomAnchorX = W / 2;
  const zoomAnchorY = GROUND_Y - FIGHTER_H * 0.4;
  ctx.translate(zoomAnchorX, zoomAnchorY);
  ctx.scale(vfx.zoom, vfx.zoom);
  ctx.translate(-zoomAnchorX, -zoomAnchorY);

  drawBackground(ctx, arena, t, cam);

  const pSel = selectSprite(s.player.action, s.player.actionTimer, s.player.actionTotal, s.playerY > 0.02, t, s.player.attackStance);
  const oSel = selectSprite(s.opponent.action, s.opponent.actionTimer, s.opponent.actionTotal, s.opponentY > 0.02, t, s.opponent.attackStance);
  const pFacing = s.playerX <= s.opponentX ? 1 : -1;
  const oFacing = s.opponentX <= s.playerX ? 1 : -1;

  const fighters = [
    { x: s.playerX, y: s.playerY, sel: pSel, facing: pFacing as 1 | -1, char: pChar, health: s.player.health, maxHealth: s.player.maxHealth },
    { x: s.opponentX, y: s.opponentY, sel: oSel, facing: oFacing as 1 | -1, char: oChar, health: s.opponent.health, maxHealth: s.opponent.maxHealth },
  ].sort((a, b) => a.x - b.x);

  for (const f of fighters) {
    const originX = worldToCanvasX(f.x, cam);
    const liftPx = f.y * FIGHTER_H * 0.55;
    if (f.char.useBossModel) {
      // Real boss phase, not just flavor: the crystal core visibly speeds
      // up and brightens as its health drops, so the back half of the
      // Overmog fight LOOKS more dangerous, not just deals more damage.
      const intensity = 1 - f.health / f.maxHealth;
      drawBoss(ctx, f.sel.glow, f.char.colors, originX, GROUND_Y - liftPx, FIGHTER_H, t, intensity);
    } else {
      // Viraat (isStoryBoss) keeps the normal humanoid sprite but gets a
      // permanent void aura + slightly bigger presence for the whole
      // fight — see drawBossAura's own comment for why this stays a
      // purely visual scale bump, never touching hitbox/reach math.
      const bossScale = f.char.isStoryBoss ? 1.18 : 1;
      if (f.char.isStoryBoss) drawBossAura(ctx, f.char.colors, originX, GROUND_Y, FIGHTER_H * bossScale, t);
      drawFighter(ctx, f.sel, f.char.colors, f.char.id, originX, GROUND_Y, FIGHTER_H * bossScale, f.facing, liftPx);
    }
  }

  for (const p of s.projectiles) {
    const owner = p.side === "player" ? pChar : oChar;
    drawProjectile(ctx, worldToCanvasX(p.x, cam), GROUND_Y - FIGHTER_H * 0.42, owner.colors, t);
  }

  drawVfx(ctx, vfx);

  ctx.restore();

  drawComebackVignette(ctx, s, pChar.colors, oChar.colors, t);
}

// New hit events (see HitEvent in lib/store.ts) each spawn a burst of
// sparks plus, when real damage was dealt, a floating number — both
// anchored on the DEFENDER's position, since `event.side` records who
// THREW the hit, not who took it. Runs once per event no matter how many
// frames it takes stepVfx to fully decay it, tracked via vfx.lastHitId.
// Positions are projected to canvas-pixel space once, right here, using
// the camera's position at the moment of the hit — sparks/numbers only
// live 260–900ms and the camera pans slowly, so not re-projecting them
// against the camera every subsequent frame is an imperceptible shortcut
// that keeps stepVfx/drawVfx simple flat-2D particle sims.
function spawnHitVfx(s: ReturnType<typeof useGameStore.getState>, vfx: Vfx, cam: number, pColors: FighterColors, oColors: FighterColors) {
  const fresh = s.hitEvents.filter((e) => e.id > vfx.lastHitId);
  if (fresh.length === 0) return;
  vfx.lastHitId = s.hitEvents.length ? s.hitEvents[s.hitEvents.length - 1].id : vfx.lastHitId;

  for (const e of fresh) {
    const defenderIsPlayer = e.side === "opponent";
    const dWorldX = defenderIsPlayer ? s.playerX : s.opponentX;
    const dy = defenderIsPlayer ? s.playerY : s.opponentY;
    const attackerColors = e.side === "player" ? pColors : oColors;
    const isParry = e.kind === "block" && e.damage === 0;
    const originX = worldToCanvasX(dWorldX, cam);
    const originY = GROUND_Y - FIGHTER_H * (0.55 + dy * 0.55);

    if (isParry) {
      // A crisp white ring instead of the usual scatter — the parry
      // callout text already carries the "you did something special"
      // read, this just needs to punctuate it at the point of contact.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        spawnSpark(vfx, originX, originY, Math.cos(a) * 90, Math.sin(a) * 90, "#ffffff", 2.4, 380);
      }
      continue;
    }

    const isChip = e.kind === "block";
    const count = isChip ? 4 : e.kind === "special" ? 10 : e.kind === "kick" ? 8 : 6;
    const color = isChip ? "#9fd0ff" : e.kind === "special" ? attackerColors.emissive : "#fff2c4";
    const spread = isChip ? 60 : e.kind === "special" ? 150 : 115; // px/sec
    const dir = defenderIsPlayer ? -1 : 1; // sparks kick off away from the attacker
    for (let i = 0; i < count; i++) {
      const a = (Math.random() - 0.5) * 1.6;
      const speed = spread * (0.5 + Math.random() * 0.8);
      spawnSpark(vfx, originX, originY, Math.cos(a) * speed * dir, Math.sin(a) * speed - spread * 0.3, color, isChip ? 1.6 : 2.4 + Math.random() * 1.4, isChip ? 260 : 420);
    }

    if (e.damage > 0 && !isChip) {
      vfx.numbers.push({
        x: originX + (Math.random() - 0.5) * 14,
        y: originY,
        vy: -70,
        life: 900,
        maxLife: 900,
        text: `${e.damage}`,
        color,
        big: e.kind === "special" || e.damage >= 24,
      });
    }
  }
}

function spawnSpark(vfx: Vfx, x: number, y: number, vx: number, vy: number, color: string, size: number, maxLife: number) {
  vfx.sparks.push({ x, y, vx, vy, life: maxLife, maxLife, color, size });
}

function stepVfx(vfx: Vfx, dt: number) {
  const dtMs = dt * 1000;
  for (const sp of vfx.sparks) {
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += dt * 380; // gravity, px/sec²
    sp.life -= dtMs;
  }
  vfx.sparks = vfx.sparks.filter((sp) => sp.life > 0);
  for (const n of vfx.numbers) {
    n.y += n.vy * dt;
    n.vy += dt * 150; // eases the upward pop back down, same feel as the health bar's own easing
    n.life -= dtMs;
  }
  vfx.numbers = vfx.numbers.filter((n) => n.life > 0);
}

function drawVfx(ctx: CanvasRenderingContext2D, vfx: Vfx) {
  for (const sp of vfx.sparks) {
    const k = sp.life / sp.maxLife;
    ctx.globalAlpha = Math.max(0, k);
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size * (0.4 + k * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const n of vfx.numbers) {
    const k = n.life / n.maxLife;
    const fontSize = n.big ? 15 : 11;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.font = `900 ${fontSize}px ${displayFontFamily()}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(n.text, n.x, n.y);
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, n.x, n.y);
  }
  ctx.globalAlpha = 1;
}

function drawComebackVignette(ctx: CanvasRenderingContext2D, s: ReturnType<typeof useGameStore.getState>, pColors: FighterColors, oColors: FighterColors, t: number) {
  const pComeback = s.player.health > 0 && s.player.health / s.player.maxHealth < COMEBACK.healthThreshold;
  const oComeback = s.opponent.health > 0 && s.opponent.health / s.opponent.maxHealth < COMEBACK.healthThreshold;
  if (!pComeback && !oComeback) return;
  const pulse = 0.55 + Math.sin(t / 220) * 0.15;
  if (pComeback) {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, 0);
    g.addColorStop(0, hexAlpha(pColors.emissive, 0.32 * pulse));
    g.addColorStop(1, hexAlpha(pColors.emissive, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W * 0.4, H);
  }
  if (oComeback) {
    const g = ctx.createLinearGradient(W, 0, W * 0.6, 0);
    g.addColorStop(0, hexAlpha(oColors.emissive, 0.32 * pulse));
    g.addColorStop(1, hexAlpha(oColors.emissive, 0));
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.6, 0, W * 0.4, H);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, arena: (typeof ARENAS)[string], t: number, cam: number) {
  const img = getArenaImage(arena.id);
  if (img) {
    // Real arena renders (public/images/arenas/*.jpg, already 16:9 — same
    // aspect as this canvas) drawn wider than the viewport and shifted by
    // a fraction of the camera's pan (parallax: background moves slower
    // than the foreground) — that's what makes it read as one big scrolling
    // arena instead of a single static poster behind the fighters.
    const bgW = W * 1.6;
    const slack = bgW - W;
    const shift = Math.max(-slack / 2, Math.min(slack / 2, -cam * PX_PER_UNIT * 0.35));
    ctx.drawImage(img, -(bgW - W) / 2 + shift, 0, bgW, H);
    // A soft color wash ties the photo-real backdrop into the flat-color
    // sprite palette instead of looking like a pasted-in photo, and a
    // bottom vignette grounds the fighters against it.
    ctx.fillStyle = hexAlpha(arena.skyBottom, 0.14);
    ctx.fillRect(0, 0, W, H);
    const bottom = ctx.createLinearGradient(0, GROUND_Y - 30, 0, H);
    bottom.addColorStop(0, "rgba(0,0,0,0)");
    bottom.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, GROUND_Y - 30, W, H - (GROUND_Y - 30));
  } else {
    // Fallback while the image loads (or if it fails) — flat gradient sky
    // + floor, same as before real backgrounds existed.
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, arena.skyTop);
    sky.addColorStop(1, arena.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);
    ctx.fillStyle = arena.floorColor;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  }

  // horizon rim glow, on top either way
  const rim = ctx.createLinearGradient(0, GROUND_Y - 26, 0, GROUND_Y + 6);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, hexAlpha(arena.rimLight, 0.5));
  ctx.fillStyle = rim;
  ctx.fillRect(0, GROUND_Y - 26, W, 32);

  drawParticles(ctx, arena, t);
}

// Module-level cache: each arena's background image is fetched once for
// the whole session no matter how many times a match starts.
const arenaImages: Record<string, HTMLImageElement | "loading" | "error"> = {};

function getArenaImage(arenaId: string): HTMLImageElement | null {
  const cached = arenaImages[arenaId];
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "loading" || cached === "error") return null;
  const img = new Image();
  arenaImages[arenaId] = "loading";
  img.onload = () => {
    arenaImages[arenaId] = img;
  };
  img.onerror = () => {
    arenaImages[arenaId] = "error";
  };
  img.src = `/images/arenas/${arenaId}.jpg`;
  return null;
}

function drawParticles(ctx: CanvasRenderingContext2D, arena: (typeof ARENAS)[string], t: number) {
  const n = 14;
  const drift = arena.particle === "snow" || arena.particle === "ash" || arena.particle === "motes";
  for (let i = 0; i < n; i++) {
    const seed = i * 137.5;
    const x = ((seed * 7 + t * (drift ? 0.012 : 0.02)) % (W + 20)) - 10;
    const y = ((seed * 3.7 + (drift ? t * 0.02 : -t * 0.03) + i * 40) % H);
    const size = 1 + (i % 3);
    ctx.fillStyle = hexAlpha(arena.rimLight, 0.35);
    ctx.fillRect(x, y, size, size);
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, colors: FighterColors, t: number) {
  const r = 6 + Math.sin(t / 60) * 1.5;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  grad.addColorStop(0, colors.emissive);
  grad.addColorStop(0.5, hexAlpha(colors.emissive, 0.6));
  grad.addColorStop(1, hexAlpha(colors.emissive, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
