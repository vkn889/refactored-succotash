"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";

/** Local same-keyboard 2P or online (join code) — picked here before either
 * flow's own character-select step. */
export default function MultiplayerMenuScreen() {
  const goHome = useGameStore((s) => s.goHome);
  const goSelect = useGameStore((s) => s.goSelect);
  const goOnlineLobby = useGameStore((s) => s.goOnlineLobby);

  useEffect(() => {
    audio.unlock();
    audio.playMusic("stageSelect");
  }, []);

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black px-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_25%,rgba(120,80,255,0.14),transparent_65%)]" />

      <button
        onClick={() => {
          audio.playSfx("menu_select");
          goHome();
        }}
        className="absolute left-6 top-6 text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
      >
        ← Home
      </button>

      <div className="relative z-10 text-center">
        <div className="text-[10px] uppercase tracking-[0.5em] text-fuchsia-400/70">Two Fighters, One Keyboard (or Two)</div>
        <h1 className="arcade-logo mt-2 font-[family-name:var(--font-display)] text-5xl tracking-wide sm:text-6xl">MULTIPLAYER</h1>
      </div>

      <div className="relative z-10 flex flex-col items-stretch gap-4 sm:flex-row">
        <button
          onClick={() => {
            audio.playSfx("menu_confirm");
            goSelect(true);
          }}
          className="arcade-panel arcade-panel-orange flex w-72 flex-col items-center gap-1 px-8 py-5 text-white transition-transform hover:scale-105 active:scale-95"
        >
          <span className="font-[family-name:var(--font-display)] text-2xl tracking-widest">LOCAL 2P</span>
          <span className="text-xs text-white/70">Same keyboard — P1 arrows, P2 WASD</span>
        </button>
        <button
          onClick={() => {
            audio.playSfx("menu_confirm");
            goOnlineLobby();
          }}
          className="arcade-panel arcade-panel-purple flex w-72 flex-col items-center gap-1 px-8 py-5 text-white transition-transform hover:scale-105 active:scale-95"
        >
          <span className="font-[family-name:var(--font-display)] text-2xl tracking-widest">ONLINE</span>
          <span className="text-xs text-white/70">Host or join with a code</span>
        </button>
      </div>
    </div>
  );
}
