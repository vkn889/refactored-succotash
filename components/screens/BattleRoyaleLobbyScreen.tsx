"use client";

import { useEffect, useState } from "react";
import { useBRStore } from "@/lib/storeBR";
import { ROSTER } from "@/lib/characters";
import { getCharacter } from "@/lib/combat";
import { BR_MAX_PLAYERS, BR_MIN_PLAYERS } from "@/lib/battleRoyale";
import { audio } from "@/lib/audio";
import { claimBRCharacter, generateBRJoinCode, hostBRRoom, joinBRRoom, stopBROnline } from "@/lib/onlineBR";

type Mode = "menu" | "connecting";

/** Host-or-join entry, then a live shared lobby: everyone connected picks
 * their own fighter right there (see storeBR's BRPhase comment for why
 * there's no separate select screen), and the host starts the match once
 * BR_MIN_PLAYERS have both connected and picked — no bots ever fill empty
 * seats, the room simply waits. */
export default function BattleRoyaleLobbyScreen({ onLeave }: { onLeave: () => void }) {
  const roomCode = useBRStore((s) => s.roomCode);
  const isHost = useBRStore((s) => s.isHost);
  const localSlot = useBRStore((s) => s.localSlot);
  const fighters = useBRStore((s) => s.fighters);
  const startFight = useBRStore((s) => s.startFight);

  const [mode, setMode] = useState<Mode>("menu");
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    audio.unlock();
    audio.playMusic("stageSelect");
  }, []);

  const connected = fighters.filter((f) => f.connected);
  const ready = fighters.filter((f) => f.connected && f.characterId);
  const canStart = isHost && ready.length >= BR_MIN_PLAYERS;
  const me = localSlot !== null ? fighters[localSlot] : null;

  const startHost = () => {
    setError(null);
    try {
      const code = generateBRJoinCode();
      hostBRRoom(code);
      setMode("connecting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start hosting.");
    }
  };

  const startJoin = () => {
    const clean = joinInput.trim().toUpperCase();
    if (clean.length < 4) return;
    setError(null);
    try {
      joinBRRoom(clean, () => {});
      setMode("connecting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
    }
  };

  const leave = () => {
    audio.playSfx("menu_select");
    stopBROnline();
    onLeave();
  };

  if (mode === "menu") {
    return (
      <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black px-6 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_25%,rgba(255,90,30,0.14),transparent_65%)]" />
        <button onClick={leave} className="absolute left-6 top-6 text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
          ← Home
        </button>
        <div className="relative z-10 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-orange-400/70">Up to {BR_MAX_PLAYERS} Fighters, One Arena</div>
          <h1 className="arcade-logo mt-2 font-[family-name:var(--font-display)] text-5xl tracking-wide sm:text-6xl">BATTLE ROYALE</h1>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <button
            onClick={() => {
              audio.playSfx("menu_confirm");
              startHost();
            }}
            className="arcade-panel arcade-panel-orange w-72 px-8 py-4 font-[family-name:var(--font-display)] text-xl tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
          >
            HOST A ROOM
          </button>
          <div className="flex items-center gap-2">
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="CODE"
              maxLength={5}
              className="w-28 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-center font-[family-name:var(--font-display)] text-xl tracking-[0.3em] text-white outline-none focus:border-orange-400/60"
            />
            <button
              onClick={startJoin}
              disabled={joinInput.trim().length < 4}
              className="arcade-panel arcade-panel-purple px-6 py-3 font-[family-name:var(--font-display)] text-lg tracking-widest text-white transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
            >
              JOIN
            </button>
          </div>
        </div>
        {error && <div className="relative z-10 text-sm text-red-400">{error}</div>}
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full flex-col items-center overflow-y-auto bg-black px-6 py-8 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_15%,rgba(255,90,30,0.12),transparent_65%)]" />
      <button onClick={leave} className="absolute left-6 top-6 text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
        ← Leave
      </button>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-white/40">Room Code</div>
          <div className="arcade-panel arcade-panel-orange mt-2 px-8 py-3 font-[family-name:var(--font-display)] text-4xl tracking-[0.3em] text-white">
            {roomCode}
          </div>
          <div className="mt-2 text-xs text-white/50">
            {connected.length}/{BR_MAX_PLAYERS} connected — needs at least {BR_MIN_PLAYERS} to start
          </div>
        </div>

        {/* everyone's live status */}
        <div className="flex w-full flex-wrap justify-center gap-2">
          {connected.map((f) => {
            const char = f.characterId ? getCharacter(f.characterId) : null;
            return (
              <div
                key={f.slot}
                className={`flex w-32 flex-col items-center gap-1 rounded-lg border p-3 text-center ${
                  f.slot === localSlot ? "border-white/70 bg-white/10" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                  style={char ? { background: `${char.colors.emissive}33`, border: `2px solid ${char.colors.emissive}` } : { border: "2px dashed rgba(255,255,255,0.2)" }}
                >
                  {char ? char.name[0] : "?"}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-white/80">{char ? char.name : `Player ${f.slot + 1}`}</div>
                {f.slot === 0 && <div className="text-[9px] uppercase tracking-widest text-orange-400/80">Host</div>}
              </div>
            );
          })}
        </div>

        {/* my own fighter pick */}
        {me && (
          <div className="w-full max-w-3xl">
            <div className="mb-2 text-center text-xs uppercase tracking-widest text-white/40">Choose Your Fighter</div>
            <div className="flex max-h-64 flex-wrap justify-center gap-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
              {ROSTER.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    audio.playSfx("menu_select");
                    claimBRCharacter(c.id);
                  }}
                  className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center transition-transform hover:scale-105 ${
                    me.characterId === c.id ? "scale-105 border-white/80 bg-white/10" : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: `${c.colors.emissive}33`, border: `2px solid ${c.colors.emissive}` }}
                  >
                    {c.name[0]}
                  </div>
                  <div className="text-[9px] uppercase tracking-wide text-white/70">{c.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isHost ? (
          <button
            onClick={() => {
              audio.playSfx("menu_confirm");
              startFight();
            }}
            disabled={!canStart}
            className="arcade-panel arcade-panel-orange px-10 py-3 font-[family-name:var(--font-display)] text-xl tracking-widest text-white transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-30"
          >
            START MATCH ({ready.length}/{BR_MIN_PLAYERS}+ picked)
          </button>
        ) : (
          <div className="flex items-center gap-2 text-white/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
            Waiting for the host to start…
          </div>
        )}
      </div>
    </div>
  );
}
