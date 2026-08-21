"use client";

import StageBR from "@/components/game/StageBR";
import HUDBR from "@/components/ui/HUDBR";
import BRInput from "@/components/game/BRInput";
import GameLoopBR from "@/components/game/GameLoopBR";
import { useBRStore } from "@/lib/storeBR";

export default function BattleRoyaleFightScreen() {
  const isHost = useBRStore((s) => s.isHost);
  const eliminated = useBRStore((s) => (s.localSlot !== null ? s.fighters[s.localSlot].eliminated : false));

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <StageBR />
      <BRInput />
      {/* only the host actually simulates — everyone else just mirrors the
          broadcast state straight onto their own store (see lib/onlineBR.ts) */}
      {isHost && <GameLoopBR />}
      <HUDBR />

      {eliminated && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
          <div className="rounded-full border border-white/20 bg-black/70 px-6 py-2 text-xs uppercase tracking-widest text-white/70 backdrop-blur-sm">
            You&apos;re out — spectating the rest of the fight
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        <div className="rounded-md border border-white/10 bg-black/50 px-4 py-1.5 text-[11px] uppercase tracking-widest text-white/50 backdrop-blur-sm">
          A/D move · W jump · J punch · K kick · L block · U special (meter full)
        </div>
      </div>
    </div>
  );
}
