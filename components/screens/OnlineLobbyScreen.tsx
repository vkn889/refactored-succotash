"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";
import { generateJoinCode, startHosting, startJoining, stopOnline } from "@/lib/online";

type Mode = "menu" | "hosting" | "joining";

/** Host-or-join screen for online play. Hosting generates a short code and
 * waits for a second browser to connect over Supabase Realtime; joining
 * asks for that code. Once two people are present, the host proceeds into
 * the normal (local-multiplayer-style) character select — see
 * lib/online.ts's top comment for why the host runs the real match and the
 * joiner just mirrors it. */
export default function OnlineLobbyScreen() {
  const goHome = useGameStore((s) => s.goHome);
  const goSelect = useGameStore((s) => s.goSelect);
  const setOnlineRole = useGameStore((s) => s.setOnlineRole);

  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [peerConnected, setPeerConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef(false);

  useEffect(() => {
    audio.unlock();
    audio.playMusic("stageSelect");
    return () => {
      // Leaving the lobby without a peer ever connecting (e.g. backing out
      // to Home) shouldn't leave a channel open in the background.
      if (!advancing.current) stopOnline();
    };
  }, []);

  const startHost = () => {
    setError(null);
    try {
      const newCode = generateJoinCode();
      setCode(newCode);
      setMode("hosting");
      startHosting(
        newCode,
        () => setPeerConnected(true),
        () => setPeerConnected(false)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start hosting.");
    }
  };

  const startJoin = () => {
    const clean = joinInput.trim().toUpperCase();
    if (clean.length < 4) return;
    setError(null);
    setMode("joining");
    try {
      startJoining(
        clean,
        () => setPeerConnected(true),
        () => setPeerConnected(false)
      );
      setCode(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
    }
  };

  useEffect(() => {
    if (!peerConnected || advancing.current) return;
    advancing.current = true;
    audio.playSfx("menu_confirm");
    if (mode === "hosting") {
      setOnlineRole("host", code);
      // Host picks both fighters — same versus-mode flow local
      // multiplayer already uses (localMultiplayer:true keeps AI off the
      // opponent side, which is now network-controlled instead).
      goSelect(true);
    } else if (mode === "joining") {
      setOnlineRole("joiner", code);
      // No navigation call here on purpose — the joiner just waits;
      // applyState() (lib/online.ts) flips phase to "fight" the moment the
      // host actually starts the match, and app/page.tsx's phase-based
      // routing does the rest.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerConnected, mode]);

  const cancel = () => {
    audio.playSfx("menu_select");
    stopOnline();
    setMode("menu");
    setPeerConnected(false);
    setCode("");
    setError(null);
  };

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black px-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_25%,rgba(120,80,255,0.14),transparent_65%)]" />

      <button
        onClick={() => {
          audio.playSfx("menu_select");
          if (mode !== "menu") stopOnline();
          goHome();
        }}
        className="absolute left-6 top-6 text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
      >
        ← Home
      </button>

      {mode === "menu" && (
        <>
          <h1 className="arcade-logo font-[family-name:var(--font-display)] text-5xl tracking-wide">ONLINE</h1>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => {
                audio.playSfx("menu_confirm");
                startHost();
              }}
              className="arcade-panel arcade-panel-orange w-72 px-8 py-4 font-[family-name:var(--font-display)] text-xl tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
            >
              HOST A MATCH
            </button>
            <div className="flex items-center gap-2">
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="CODE"
                maxLength={5}
                className="w-28 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-center font-[family-name:var(--font-display)] text-xl tracking-[0.3em] text-white outline-none focus:border-fuchsia-400/60"
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
          {error && <div className="text-sm text-red-400">{error}</div>}
        </>
      )}

      {mode === "hosting" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-white/40">Share this code</div>
          <div className="arcade-panel arcade-panel-orange px-10 py-6 font-[family-name:var(--font-display)] text-6xl tracking-[0.2em] text-white">
            {code}
          </div>
          <div className="flex items-center gap-2 text-white/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
            Waiting for opponent to join…
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button onClick={cancel} className="mt-2 text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
            Cancel
          </button>
        </div>
      )}

      {mode === "joining" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-white/40">Code {code}</div>
          <div className="flex items-center gap-2 text-white/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />
            {peerConnected ? "Connected — waiting for host to choose fighters…" : "Connecting…"}
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button onClick={cancel} className="mt-2 text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
