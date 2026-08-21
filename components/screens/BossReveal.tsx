"use client";

import { useEffect, useRef } from "react";
import { getCharacter } from "@/lib/combat";
import { drawBoss } from "@/lib/sprite2d";
import type { FighterFrame2D } from "@/lib/fighterFrame2d";
import Fighter2D from "@/components/game/Fighter2D";
import { audio } from "@/lib/audio";

const IDLE_FRAME: FighterFrame2D = {
  action: "idle",
  actionTotal: 0,
  actionTimer: 0,
  meter: 0,
  x: 0,
  y: 0,
  facing: 1,
  hitToken: 0,
};

/** A dramatic full-screen "boss incoming" splash — shown once, right before
 * a story-mode boss fight's pre-fight dialogue (see FightScreen's story
 * stage machine), for the two real bosses only (Viraat/Overmog —
 * `isStoryBoss`/`isFinalBoss`, see lib/characters.ts). Every other
 * story-mode fight skips straight to StoryCutscene's dialogue, no reveal
 * beat — this is specifically reserved for the two fights meant to feel
 * like a genre-standard "boss encounter," not a reused effect on every
 * rung of the ladder.
 *
 * No external key-art asset — built entirely from what the engine already
 * has (drawBoss's procedural crystal-core render, at dramatic scale, for
 * Overmog; the normal sprite for Viraat wrapped in a purely CSS "void
 * architect" treatment — orbiting fractured shards, a heavier aura, a
 * bigger-than-normal scale) so the reveal reads as a real spectacle beat
 * without depending on generated art existing. */
export default function BossReveal({ characterId, onDone }: { characterId: string; onDone: () => void }) {
  const char = getCharacter(characterId);

  useEffect(() => {
    audio.playSfx("charge_rumble");
    // Every ROSTER character has a generated voice-line mp3 (see
    // scripts/generate-audio.mjs), but Overmog was never part of that
    // batch — it's explicitly not one of the twelve friends the roster
    // audio was recorded for (see its bio). Playing it would just be a
    // guaranteed 404 on every single story-mode run, since this reveal is
    // the one moment EVERY run hits it, unlike its in-combat special which
    // only fires if the AI actually charges meter.
    if (characterId !== "overmog") audio.playVoiceLine(characterId);
  }, [characterId]);

  const advance = () => {
    audio.playSfx("menu_confirm");
    onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black" onClick={advance}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 42%, ${char.colors.emissive}2e, #000 75%)` }}
      />

      <div className="relative flex h-[52%] w-full items-center justify-center">
        {char.useBossModel ? <OvermogArt colors={char.colors} /> : <ArchitectArt characterId={characterId} colors={char.colors} />}
      </div>

      <div className="boss-flash relative z-10 mt-4 flex flex-col items-center text-center">
        <div className="text-xs uppercase tracking-[0.6em] text-white/50">Boss Encounter</div>
        <h1
          className="font-[family-name:var(--font-display)] text-6xl tracking-wide drop-shadow-[0_0_30px_rgba(0,0,0,0.9)] sm:text-7xl"
          style={{ color: char.colors.emissive }}
        >
          {char.name}
        </h1>
        <div className="mt-1 text-sm uppercase tracking-[0.4em] text-white/60">{char.title}</div>
      </div>

      <div className="relative z-10 mt-8 animate-pulse text-xs uppercase tracking-widest text-white/40">Click / Enter to continue ▸</div>
    </div>
  );
}

// Fully deterministic (no randomness), so this is a plain module-level
// constant rather than something computed per render/instance.
const ARCHITECT_SHARDS = Array.from({ length: 8 }, (_, i) => ({
  r: 130 + (i % 3) * 30,
  delay: -(i * 1.75),
  size: 10 + (i % 4) * 4,
  rot: (i / 8) * 360,
}));

function ArchitectArt({ characterId, colors }: { characterId: string; colors: { primary: string; secondary: string; emissive: string } }) {
  return (
    <div className="relative flex h-full w-56 items-center justify-center sm:w-72">
      {/* orbiting void shards — pure CSS, decorative fragments of the arena
          he built, drifting around him instead of just standing still */}
      {ARCHITECT_SHARDS.map((s, i) => (
        <div
          key={i}
          className="boss-orbit-shard pointer-events-none absolute left-1/2 top-1/2"
          style={{ "--orbit-r": `${s.r}px`, animationDelay: `${s.delay}s`, transform: `rotate(${s.rot}deg)` } as React.CSSProperties}
        >
          <div
            style={{
              width: s.size,
              height: s.size,
              background: colors.emissive,
              clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              boxShadow: `0 0 10px ${colors.emissive}`,
              opacity: 0.8,
            }}
          />
        </div>
      ))}
      <div className="relative h-full w-full scale-125">
        <Fighter2D characterId={characterId} getFrame={() => IDLE_FRAME} />
      </div>
    </div>
  );
}

function OvermogArt({ colors }: { colors: { primary: string; secondary: string; emissive: string } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;
    const loop = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Full glow AND full intensity (the "phase 2" outer shard ring, see
      // drawBoss) — this is the "fully awake" version of the same body a
      // players sees at low health, previewed here at its most dramatic
      // rather than the calmer default it actually opens the fight at.
      drawBoss(ctx, 1, colors, canvas.width / 2, canvas.height * 0.58, canvas.height * 0.85, t, 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [colors]);

  return (
    <div className="relative flex h-full items-center justify-center">
      {/* Overmog's emissive is pure white (it refracts every color rather
          than owning one) — a plain white glow reads as flat/underwhelming
          for a reveal moment, so this reveal-only prismatic ring (never
          shown in actual combat, where the plain drawBoss glow is correct)
          fills that in without changing the character's real palette. */}
      <div
        className="pointer-events-none absolute h-64 w-64 rounded-full opacity-40 blur-2xl"
        style={{ background: "conic-gradient(from 0deg, #ff5f5f, #ffd23d, #6aff8a, #43f5ff, #b98bff, #ff4fd8, #ff5f5f)" }}
      />
      <canvas ref={canvasRef} width={420} height={420} className="relative h-full w-auto" style={{ imageRendering: "auto" }} />
    </div>
  );
}
