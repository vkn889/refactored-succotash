"use client";

import { useEffect, useRef } from "react";
import { useBRStore } from "@/lib/storeBR";
import { getCharacter } from "@/lib/combat";
import { BR_FIGHTER_H_FRAC, BR_ITEM_DEFS, BR_KILL_Y, BR_PLATFORMS, BR_STAGE_WIDTH } from "@/lib/battleRoyale";
import { drawFighter } from "@/lib/sprite2d";
import { selectSprite } from "@/lib/spriteAtlas";

// Battle Royale's own stage renderer — a fixed, never-scrolling view of the
// WHOLE arena at once (up to 8 fighters spread across it at any time makes
// a 1v1-style following camera meaningless), one shared canvas same as
// Stage2D.tsx for identical draw-order-correctness reasons.
const W = 640;
const H = 400;
const TOP_MARGIN = 40;
const PX_PER_UNIT_X = W / BR_STAGE_WIDTH;
const PX_PER_UNIT_Y = (H - TOP_MARGIN - 20) / (BR_KILL_Y + 1.5);
const FIGHTER_H = H * BR_FIGHTER_H_FRAC;

function toCanvas(x: number, y: number) {
  return { cx: W / 2 + x * PX_PER_UNIT_X, cy: TOP_MARGIN + y * PX_PER_UNIT_Y };
}

export default function StageBR() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let raf: number;
    const loop = (t: number) => {
      draw(ctx, t);
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

function draw(ctx: CanvasRenderingContext2D, t: number) {
  const s = useBRStore.getState();

  ctx.clearRect(0, 0, W, H);

  // backdrop — a dark void gradient, same emotional register as the void
  // arena in the 1v1 game but purpose-built for a stage that has to read
  // clearly with up to 8 small fighters and floating platforms on it.
  const sky = ctx.createRadialGradient(W / 2, H * 0.25, 40, W / 2, H * 0.25, W * 0.75);
  sky.addColorStop(0, "#1a1030");
  sky.addColorStop(1, "#050208");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  drawStars(ctx, t);

  // kill-plane hint — a soft red line/fade at the bottom so falling below
  // it always reads as "danger", not just an arbitrary cutoff.
  const killY = toCanvas(0, BR_KILL_Y).cy;
  const killGrad = ctx.createLinearGradient(0, killY - 40, 0, H);
  killGrad.addColorStop(0, "rgba(255,40,40,0)");
  killGrad.addColorStop(1, "rgba(255,20,20,0.35)");
  ctx.fillStyle = killGrad;
  ctx.fillRect(0, killY - 40, W, H - (killY - 40));

  // platforms
  for (const plat of BR_PLATFORMS) {
    const left = toCanvas(plat.x - plat.w / 2, plat.y);
    const right = toCanvas(plat.x + plat.w / 2, plat.y);
    const thickness = plat.solid ? 14 : 8;
    ctx.fillStyle = plat.solid ? "#3a3350" : "#5c4f80";
    ctx.strokeStyle = plat.solid ? "#8f7fd9" : "#a693ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(left.cx, left.cy, right.cx - left.cx, thickness, 5);
    ctx.fill();
    ctx.stroke();
  }

  // items on field
  for (const item of s.items) {
    const { cx, cy } = toCanvas(item.x, item.y);
    const def = BR_ITEM_DEFS[item.kind];
    const bob = Math.sin(t / 300 + item.id) * 3;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(cx - 9, cy - 18 + bob, 18, 18, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.stroke();
    ctx.fillStyle = "#0a0a0f";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(def.glyph, cx, cy - 5 + bob);
  }

  // projectiles
  for (const p of s.projectiles) {
    const { cx, cy } = toCanvas(p.x, p.y);
    ctx.fillStyle = p.kind === "bomb" ? "#2a2a2a" : "#9de8ff";
    ctx.beginPath();
    ctx.arc(cx, cy, p.kind === "bomb" ? 7 : 6, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "bomb") {
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // fighters, back-to-front by y so someone standing on a higher platform
  // never gets weirdly occluded by one below them
  const active = s.fighters.filter((f) => f.connected && f.characterId).sort((a, b) => a.y - b.y);
  for (const f of active) {
    const char = getCharacter(f.characterId!);
    const { cx, cy } = toCanvas(f.x, f.y);
    const sel = selectSprite(f.action, f.actionTimer, f.actionTotal, f.onPlatform === null, t, null);

    if (f.eliminated) continue;

    const flicker = f.invulnMs > 0 && Math.floor(t / 90) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = flicker ? 0.4 : 1;
    if (f.buff?.kind === "shield" || f.buff?.kind === "star") {
      ctx.strokeStyle = f.buff.kind === "star" ? "#ffe94d" : "#5cc8ff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7 + Math.sin(t / 120) * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy - FIGHTER_H * 0.5, FIGHTER_H * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = flicker ? 0.4 : 1;
    }
    drawFighter(ctx, sel, char.colors, char.id, cx, cy, FIGHTER_H, f.facing, 0);
    ctx.restore();

    // name tag
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    const label = `${char.name}`;
    const labelW = ctx.measureText(label).width + 8;
    ctx.beginPath();
    ctx.roundRect(cx - labelW / 2, cy - FIGHTER_H - 14, labelW, 12, 3);
    ctx.fill();
    ctx.fillStyle = char.colors.emissive;
    ctx.fillText(label, cx, cy - FIGHTER_H - 5);
  }
}

function drawStars(ctx: CanvasRenderingContext2D, t: number) {
  for (let i = 0; i < 40; i++) {
    const seed = i * 91.7;
    const x = (seed * 3.3) % W;
    const y = (seed * 1.9 + Math.sin(seed)) % (H * 0.6);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + i));
    ctx.fillStyle = `rgba(200,190,255,${0.15 * tw})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}
