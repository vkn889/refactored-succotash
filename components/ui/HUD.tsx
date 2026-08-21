"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
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
  const roundWins = useGameStore((s) => s.roundWins);
  const localMultiplayer = useGameStore((s) => s.localMultiplayer);
  const onlineRole = useGameStore((s) => s.onlineRole);
  const comboCallout = useGameStore((s) => s.comboCallout);
  // localMultiplayer is also true for an online host (reused for the AI-off
  // behavior it needed — see FightScreen's input-selection comment), but an
  // online host only ever controls their own fighter with the single-player
  // WASD scheme, not the two-keyboard-split one two people sharing a
  // keyboard actually use.
  const twoKeyboardSplit = localMultiplayer && !onlineRole;

  const pChar = getCharacter(playerId);
  const oChar = getCharacter(opponentId);

  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    if (phase !== "fight") return;
    const id = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase !== "fight") return null;

  const specialSide = player.action === "special" ? "player" : opponent.action === "special" ? "opponent" : null;
  const cinematicId = specialSide === "player" ? playerId : specialSide === "opponent" ? opponentId : null;
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
          wins={roundWins.player}
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
          wins={roundWins.opponent}
        />
      </div>

      {/* combo finisher callout — see COMBOS in lib/combat.ts. Keyed by
          token so landing the same combo twice in a row still replays the
          animation (a same-value comboCallout wouldn't otherwise remount). */}
      {comboCallout && (
        <div
          key={comboCallout.token}
          className="combo-flash pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 text-center"
        >
          <div
            className="font-[family-name:var(--font-display)] text-4xl italic tracking-wide text-white drop-shadow-[0_0_18px_rgba(255,180,60,0.7)]"
            style={{ color: comboCallout.side === "player" ? pChar.colors.emissive : oChar.colors.emissive }}
          >
            {comboCallout.label}
          </div>
        </div>
      )}

      {/* special-move subtitle */}
      {cinematicChar && specialSide && (
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
          {twoKeyboardSplit ? (
            <>
              P1: ← → move · ↑ jump · ↓ crouch · / punch · &apos; kick · Enter special
              <br />
              P2: A/D move · W jump · S crouch · F punch · G kick · E special
            </>
          ) : (
            <>
              A / D move · W jump (W again = double jump) · S crouch
              <br />
              J / click punch · K / right-click kick · S+K sweep · W+K jump kick
              <br />
              L block (hold) · U special (meter full)
            </>
          )}
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
  wins,
}: {
  name: string;
  element: string;
  health: number;
  maxHealth: number;
  meter: number;
  combo: number;
  align: "left" | "right";
  color: string;
  wins: number;
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
      {/* round-win pips — best of three, classic arcade-fighter tell for
          "who needs one more" */}
      <div className={`mb-0.5 flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-2 w-2 rotate-45 border"
            style={{ background: i < wins ? color : "transparent", borderColor: color, boxShadow: i < wins ? `0 0 6px ${color}` : "none" }}
          />
        ))}
      </div>
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
