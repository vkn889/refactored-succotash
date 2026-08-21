"use client";

import { useEffect, useRef, useState } from "react";
import { getCharacter, FINISHER_DURATION_MS } from "@/lib/combat";
import { audio } from "@/lib/audio";
import type { FighterFrame2D } from "@/lib/fighterFrame2d";
import Fighter2D from "@/components/game/Fighter2D";

/** The match-deciding blow gets one dramatic beat before the scoreboard —
 * see FinisherInfo in lib/store.ts for exactly what triggers this (the
 * actual killing hit of the whole match, not just a round) and
 * FightScreen.tsx for how it takes over the screen in place of the normal
 * immediate cut to the result screen. No new art: the winner is just
 * their own Fighter2D played through the "special" animation at a bigger
 * scale with the glow maxed out — reusing exactly what a real special
 * already looks like, just given the spotlight. Online: both host and
 * joiner render this identically off the same mirrored `finisher` store
 * field, but only the host's copy ever calls onDone→resolveFinisher() (see
 * FightScreen) — the joiner just watches until the host's own eventual
 * phase:"result" broadcast arrives. */
export default function FinisherSequence({
  winnerId,
  loserId,
  moveName,
  kind,
  onDone,
}: {
  winnerId: string;
  loserId: string;
  moveName: string;
  kind: "special" | "normal";
  onDone: () => void;
}) {
  const winner = getCharacter(winnerId);
  const duration = kind === "special" ? FINISHER_DURATION_MS.special : FINISHER_DURATION_MS.normal;
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    audio.playSfx("charge_rumble");
    audio.playSfx("special_release");
  }, []);

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const e = t - start;
      setElapsed(e);
      if (e < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  const advance = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    if (elapsed >= duration) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, duration]);

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

  // Loops the winner's own special animation across the whole finisher
  // window (not just once) — a single 27-frame cycle at the sheet's normal
  // pace is well under FINISHER_DURATION_MS, so this keeps them visibly
  // performing the move instead of freezing on its last frame partway
  // through the beat.
  const cyclesMs = 1100;
  const winnerFrame: FighterFrame2D = {
    action: "special",
    actionTimer: cyclesMs - (elapsed % cyclesMs),
    actionTotal: cyclesMs,
    meter: 100,
    x: 0,
    y: 0,
    facing: 1,
    hitToken: 0,
  };
  const loserFrame: FighterFrame2D = {
    action: "ko",
    actionTimer: 0,
    actionTotal: 0,
    meter: 0,
    x: 0,
    y: 0,
    facing: -1,
    hitToken: 0,
  };

  return (
    <div className="absolute inset-0 z-40 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black" onClick={advance}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 75% 65% at 50% 45%, ${winner.colors.emissive}33, #000 78%)` }}
      />

      <div className="relative flex h-[58%] w-full items-end justify-center gap-10">
        <div className="relative h-full w-44 scale-125 sm:w-64">
          <Fighter2D characterId={winnerId} getFrame={() => winnerFrame} />
        </div>
        <div className="relative h-[70%] w-28 opacity-40 grayscale sm:w-40">
          <Fighter2D characterId={loserId} getFrame={() => loserFrame} />
        </div>
      </div>

      <div className="boss-flash relative z-10 mt-4 flex flex-col items-center text-center">
        <div className="text-xs uppercase tracking-[0.6em] text-white/50">{kind === "special" ? "Finishing Move" : "Match Point"}</div>
        <h1
          className="font-[family-name:var(--font-display)] text-5xl tracking-wide drop-shadow-[0_0_30px_rgba(0,0,0,0.9)] sm:text-7xl"
          style={{ color: winner.colors.emissive }}
        >
          {moveName.toUpperCase()}
        </h1>
        <div className="mt-1 text-sm uppercase tracking-[0.4em] text-white/60">{winner.name} mogs</div>
      </div>

      <div className="relative z-10 mt-8 animate-pulse text-xs uppercase tracking-widest text-white/40">Click / Enter to continue ▸</div>
    </div>
  );
}
