"use client";

import { useEffect, useRef } from "react";
import { getCharacter } from "@/lib/combat";
import { drawFighter, drawBoss } from "@/lib/sprite2d";
import { selectSprite } from "@/lib/spriteAtlas";
import type { FighterFrame2D } from "@/lib/fighterFrame2d";

/** Standalone single-fighter preview canvas — CharacterSelect and
 * MatchupIntro use this (one instance each), the live fight uses Stage2D
 * instead (both fighters + background + projectiles on one shared canvas,
 * since draw order between two independently-looping canvases would be
 * unpredictable mid-combat). */
export default function Fighter2D({
  characterId,
  getFrame,
  className,
}: {
  characterId: string;
  getFrame: () => FighterFrame2D;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read the latest closure each frame via a ref instead of depending on
  // `getFrame` directly — callers pass a fresh inline arrow every render,
  // and depending on it would tear down/restart the rAF loop constantly.
  // Updated in an effect (not during render) per the react-hooks/refs rule.
  const getFrameRef = useRef(getFrame);
  useEffect(() => {
    getFrameRef.current = getFrame;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const character = getCharacter(characterId);

    let raf: number;
    const loop = (t: number) => {
      const frame = getFrameRef.current();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const originX = canvas.width / 2;
      const originY = canvas.height * 0.9;
      const heightPx = canvas.height * 0.74;
      const airborne = frame.y > 0.02;
      const sel = selectSprite(frame.action, frame.actionTimer, frame.actionTotal, airborne, t, frame.attackStance ?? null);
      const liftPx = frame.y * heightPx * 0.55;
      if (character.useBossModel) {
        drawBoss(ctx, sel.glow, character.colors, originX, originY - liftPx, heightPx, t);
      } else {
        drawFighter(ctx, sel, character.colors, characterId, originX, originY, heightPx, frame.facing, liftPx);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [characterId]);

  return (
    <canvas
      ref={canvasRef}
      width={330}
      height={420}
      className={className}
      style={{ imageRendering: "auto", width: "100%", height: "100%" }}
    />
  );
}
