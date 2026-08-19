"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getCharacter, AMMO } from "@/lib/combat";
import { audio } from "@/lib/audio";

const ELEMENT_GLYPH: Record<string, string> = {
  fire: "🔥",
  ice: "❄",
  electric: "⚡",
  kinetic: "👊",
  speed: "💨",
  earth: "⛰",
  tech: "⚙",
  shift: "◈",
  steel: "⚔",
  wind: "🌀",
  lightning: "☇",
  void: "✦",
};

export default function HUD() {
  const phase = useGameStore((s) => s.phase);
  const player = useGameStore((s) => s.player);
  const opponent = useGameStore((s) => s.opponent);
  const playerId = useGameStore((s) => s.playerId);
  const opponentId = useGameStore((s) => s.opponentId);
  const matchTime = useGameStore((s) => s.matchTime);
  const openTutorial = useGameStore((s) => s.openTutorial);
  const aimAssist = useGameStore((s) => s.aimAssist);

  const pChar = getCharacter(playerId);
  const oChar = getCharacter(opponentId);

  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    if (phase !== "fight") return;
    const id = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase !== "fight") return null;

  const chargingSide = player.action === "charge" ? "player" : opponent.action === "charge" ? "opponent" : null;
  const specialSide = player.action === "special" ? "player" : opponent.action === "special" ? "opponent" : null;
  const cinematicId = chargingSide === "player" || specialSide === "player" ? playerId : chargingSide || specialSide ? opponentId : null;
  const cinematicChar = cinematicId ? getCharacter(cinematicId) : null;

  return (
    <div data-testid="hud-overlay" className="pointer-events-none absolute inset-0 select-none">
      {/* corner brackets */}
      <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-white/25" />
      <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-white/25" />
      <div className="absolute left-3 bottom-3 h-6 w-6 border-l-2 border-b-2 border-white/15" />
      <div className="absolute right-3 bottom-3 h-6 w-6 border-r-2 border-b-2 border-white/15" />

      {/* health/meter bars */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-6">
        <FighterBar
          name={pChar.name}
          element={pChar.element}
          health={player.health}
          maxHealth={player.maxHealth}
          meter={player.meter}
          combo={player.combo}
          align="left"
          color={pChar.colors.emissive}
        />
        <div className="mt-1 shrink-0 rounded-md border border-white/10 bg-black/50 px-3 py-1 text-xl tabular-nums text-white backdrop-blur-sm font-[family-name:var(--font-display)] tracking-wider">
          {Math.ceil(matchTime)}
        </div>
        <FighterBar
          name={oChar.name}
          element={oChar.element}
          health={opponent.health}
          maxHealth={opponent.maxHealth}
          meter={opponent.meter}
          combo={opponent.combo}
          align="right"
          color={oChar.colors.emissive}
        />
      </div>

      {/* aim-assist reticle: a ring that closes in and turns red the instant
          you're close enough to the opponent that firing would land — same
          cone the shot itself is checked against (GUN.aimConeRad), so red
          always means "this will hit." */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[width,height,border-color] duration-100 ${
          aimAssist ? "h-5 w-5 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" : "h-8 w-8 border-white/60"
        }`}
      />
      <div className={`absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${aimAssist ? "bg-red-500" : "bg-white/70"}`} />

      {/* ammo counter — just under the reticle, not the bottom controls hint */}
      <div className="absolute left-1/2 top-[calc(50%+34px)] -translate-x-1/2 text-center">
        {player.action === "reload" ? (
          <div className="text-sm font-bold uppercase tracking-widest text-orange-400 drop-shadow">Reloading…</div>
        ) : (
          <div className="font-[family-name:var(--font-display)] text-lg tracking-wider text-white/90 drop-shadow tabular-nums">
            {player.ammo} <span className="text-sm text-white/40">/ {AMMO.magSize}</span>
          </div>
        )}
      </div>

      {/* charge-up subtitle */}
      {cinematicChar && (chargingSide || specialSide) && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">{cinematicChar.name}</div>
          <div
            className="mt-1 text-2xl font-bold italic tracking-wide text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
            style={{ color: cinematicChar.colors.emissive }}
          >
            &ldquo;{cinematicChar.voiceLine}&rdquo;
          </div>
        </div>
      )}

      {showHint && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-[280px] rounded-md border border-white/10 bg-black/50 p-3 text-center text-[11px] leading-relaxed text-white/70 backdrop-blur-sm">
          <div className="mb-1 font-bold text-white/90">CONTROLS</div>
          Click to lock mouse · Mouse look freely · WASD move
          <br />
          LMB shoot gun (red reticle = it&apos;ll land) · R reload · RMB punch
          <br />
          Shift block · Ctrl dodge · Space jump · Hold E special
        </div>
      )}

      <button
        onClick={() => {
          audio.playSfx("menu_select");
          openTutorial();
        }}
        className="pointer-events-auto absolute bottom-6 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm font-bold text-white/70 backdrop-blur-sm hover:bg-black/70 hover:text-white"
        aria-label="How to play"
      >
        ?
      </button>
    </div>
  );
}

function FighterBar({
  name,
  element,
  health,
  maxHealth,
  meter,
  combo,
  align,
  color,
}: {
  name: string;
  element: string;
  health: number;
  maxHealth: number;
  meter: number;
  combo: number;
  align: "left" | "right";
  color: string;
}) {
  const pct = Math.max(0, (health / maxHealth) * 100);
  const [flash, setFlash] = useState(false);
  const prevHealth = useRef(health);

  useEffect(() => {
    if (health < prevHealth.current) {
      const t = window.setTimeout(() => setFlash(true), 0);
      const clear = window.setTimeout(() => setFlash(false), 160);
      prevHealth.current = health;
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(clear);
      };
    }
    prevHealth.current = health;
  }, [health]);

  return (
    <div className={`flex-1 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`mb-1 flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="text-sm opacity-80">{ELEMENT_GLYPH[element] ?? "●"}</span>
        <span className="text-xl uppercase tracking-wider text-white drop-shadow font-[family-name:var(--font-display)]">{name}</span>
        {combo >= 3 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black"
            style={{ background: color }}
          >
            {combo} HITS
          </span>
        )}
      </div>
      <div className="relative h-3.5 w-full overflow-hidden rounded-sm border border-white/15 bg-black/60" style={{ clipPath: "polygon(0 0, 100% 0, 96% 100%, 0% 100%)" }}>
        {/* damage trail: lags behind on a slower transition so recent chip damage visibly catches up */}
        <div
          className="absolute inset-y-0 left-0 bg-yellow-300/70 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%`, background: pct > 30 ? "#e8433a" : "#ff2f2f" }}
        />
        {flash && <div className="absolute inset-0 bg-white" />}
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-out ${meter >= 100 ? "animate-pulse" : ""}`}
          style={{ width: `${meter}%`, background: color, boxShadow: meter >= 100 ? `0 0 10px ${color}` : "none" }}
        />
      </div>
    </div>
  );
}
