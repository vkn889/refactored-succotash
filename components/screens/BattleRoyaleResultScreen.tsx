"use client";

import { useEffect } from "react";
import { useBRStore } from "@/lib/storeBR";
import { getCharacter } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { stopBROnline } from "@/lib/onlineBR";

export default function BattleRoyaleResultScreen({ onLeave }: { onLeave: () => void }) {
  const winnerSlot = useBRStore((s) => s.winnerSlot);
  const fighters = useBRStore((s) => s.fighters);
  const isHost = useBRStore((s) => s.isHost);
  const startFight = useBRStore((s) => s.startFight);
  const winner = winnerSlot !== null ? fighters[winnerSlot] : null;
  const winnerChar = winner?.characterId ? getCharacter(winner.characterId) : null;

  useEffect(() => {
    audio.stopAmbient();
    audio.playMusic("theme");
  }, []);

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-6 overflow-hidden bg-black px-6 text-center text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 30%, ${winnerChar?.colors.emissive ?? "#ff8a3d"}22, transparent 65%)` }}
      />
      <div className="relative z-10 text-xs uppercase tracking-[0.5em] text-white/40">Battle Royale</div>
      <h1 className="arcade-logo relative z-10 font-[family-name:var(--font-display)] text-5xl tracking-wide sm:text-6xl">
        {winnerChar ? `${winnerChar.name.toUpperCase()} MOGS` : "MATCH OVER"}
      </h1>
      {winnerChar && <div className="relative z-10 text-sm uppercase tracking-widest text-white/50">Last one standing out of {fighters.filter((f) => f.characterId).length}</div>}

      <div className="relative z-10 flex gap-3">
        {isHost && (
          <button
            onClick={() => {
              audio.playSfx("menu_confirm");
              startFight();
            }}
            className="arcade-panel arcade-panel-orange px-8 py-3 font-[family-name:var(--font-display)] text-lg tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
          >
            REMATCH
          </button>
        )}
        <button
          onClick={() => {
            audio.playSfx("menu_select");
            stopBROnline();
            onLeave();
          }}
          className="rounded-lg border border-white/20 px-8 py-3 font-[family-name:var(--font-display)] text-lg tracking-widest text-white hover:bg-white/10"
        >
          LEAVE
        </button>
      </div>
    </div>
  );
}
