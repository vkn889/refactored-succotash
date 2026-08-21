"use client";

import { useBRStore } from "@/lib/storeBR";
import { getCharacter } from "@/lib/combat";

/** Battle Royale's own HUD — deliberately NOT the 1v1 game's health-bar
 * design. Per the ask: a plain number out of max health (easier to read
 * at a glance across up to 8 fighters at once than eight tiny bars would
 * be) plus a stock count at the bottom of each fighter's own card. */
export default function HUDBR() {
  const fighters = useBRStore((s) => s.fighters);
  const localSlot = useBRStore((s) => s.localSlot);
  const active = fighters.filter((f) => f.connected && f.characterId);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-2 p-3">
      {active.map((f) => {
        const char = getCharacter(f.characterId!);
        const isMe = f.slot === localSlot;
        return (
          <div
            key={f.slot}
            className={`flex min-w-[104px] flex-col items-center gap-1 rounded-lg border bg-black/60 px-3 py-1.5 backdrop-blur-sm ${
              f.eliminated ? "border-white/10 opacity-40" : isMe ? "border-white/70" : "border-white/15"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: char.colors.emissive }} />
              <span className="text-[11px] uppercase tracking-wide text-white/90">{char.name}</span>
            </div>
            <div className="font-[family-name:var(--font-display)] text-lg tabular-nums text-white">
              {f.eliminated ? "OUT" : `${Math.max(0, Math.round(f.health))} / ${f.maxHealth}`}
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rotate-45"
                  style={{
                    background: i < f.stocks ? char.colors.emissive : "transparent",
                    border: `1px solid ${char.colors.emissive}`,
                  }}
                />
              ))}
            </div>
            {f.buff && (
              <div className="text-[9px] uppercase tracking-wide text-white/50">
                {f.buff.kind === "damage_boost" ? "Power Up" : f.buff.kind === "speed_boost" ? "Speed" : f.buff.kind === "star" ? "Mog Star" : "Shield"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
