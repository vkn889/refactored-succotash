"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";
import { LORE_INTRO, CLOSING_LINE } from "@/lib/lore";
import { ROSTER } from "@/lib/characters";
import { ARENAS } from "@/lib/arenas";
import AttractFight from "@/components/game/AttractFight";

export default function HomeScreen() {
  const goSelect = useGameStore((s) => s.goSelect);
  const goStorySelect = useGameStore((s) => s.goStorySelect);
  const [musicOn, setMusicOn] = useState(true);
  const [showLore, setShowLore] = useState(false);

  useEffect(() => {
    // Howler auto-queues playback until the browser's first-gesture unlock
    // fires, so this is safe to call immediately on every visit to Home —
    // no click required first.
    audio.unlock();
    audio.setThemeVolume(0.55);
    audio.playTheme();
    audio.preloadSfx();
  }, []);

  return (
    // Normal flowing page — the body scrolls (see app/layout.tsx / app/page.tsx),
    // this is intentionally NOT its own scroll container.
    <div className="relative flex w-full flex-1 flex-col overflow-x-hidden bg-black">
      {/* ---- hero: cinematic live demo fight, exactly one viewport tall ---- */}
      <section className="relative flex min-h-dvh w-full shrink-0 flex-col items-center justify-end overflow-hidden">
        <div className="absolute inset-0">
          <AttractFight />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-black via-black/70 to-transparent" />

        <div className="relative z-10 flex flex-col items-center gap-4 px-6 pb-10 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-white/45">Welcome to the Mogsphere</div>
          <h1 className="font-[family-name:var(--font-display)] text-6xl sm:text-7xl md:text-8xl tracking-wide text-white drop-shadow-[0_0_40px_rgba(255,120,60,0.45)]">
            MOG <span className="text-orange-400">OFF</span>
          </h1>

          <div className="mt-2 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  audio.unlock();
                  audio.playSfx("menu_confirm");
                  goSelect();
                }}
                className="group relative rounded-lg bg-gradient-to-br from-orange-500 to-red-600 px-10 py-3 text-lg font-[family-name:var(--font-display)] tracking-widest text-white shadow-[0_0_30px_rgba(255,90,30,0.4)] transition-transform hover:scale-105 active:scale-95"
              >
                ENTER THE RING
              </button>
              <button
                onClick={() => {
                  audio.unlock();
                  audio.playSfx("menu_confirm");
                  goStorySelect();
                }}
                className="group relative rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/10 px-10 py-3 text-lg font-[family-name:var(--font-display)] tracking-widest text-white shadow-[0_0_30px_rgba(217,70,239,0.25)] transition-transform hover:scale-105 hover:bg-fuchsia-500/20 active:scale-95"
              >
                STORY MODE
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-white/40">
              <button onClick={() => setShowLore(true)} className="hover:text-white/70">
                The Story
              </button>
              <span className="text-white/20">·</span>
              <button
                onClick={() => {
                  const next = !musicOn;
                  setMusicOn(next);
                  if (next) audio.playTheme();
                  else audio.stopTheme();
                }}
                className="hover:text-white/70"
              >
                {musicOn ? "♪ Music: On" : "Music: Off"}
              </button>
            </div>
          </div>

          <button
            onClick={() => document.getElementById("roster")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-6 flex flex-col items-center gap-1 text-white/30 hover:text-white/60"
            aria-label="Meet the roster"
          >
            <span className="text-[10px] uppercase tracking-[0.3em]">Meet the Roster</span>
            <span className="animate-bounce text-lg leading-none">⌄</span>
          </button>
        </div>
      </section>

      {/* ---- roster showcase ---- */}
      <section id="roster" className="relative z-10 w-full bg-black px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <div className="text-[10px] uppercase tracking-[0.5em] text-white/40">Twelve Fighters</div>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-wide text-white">The Roster</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROSTER.map((c) => {
              const arena = ARENAS[c.arenaId];
              return (
                <div
                  key={c.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
                >
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
                    style={{ background: c.colors.emissive }}
                  />
                  <div className="relative flex items-start gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                      style={{ background: `radial-gradient(circle, ${c.colors.emissive}55, transparent 70%)`, border: `2px solid ${c.colors.emissive}` }}
                    >
                      {c.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-[family-name:var(--font-display)] text-xl tracking-wide text-white">{c.name}</div>
                        {(c.isFinalBoss || c.isStoryBoss) && <span className="text-[9px] uppercase tracking-wide text-fuchsia-400">Boss</span>}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: c.colors.emissive }}>
                        {c.title} · {c.element}
                      </div>
                    </div>
                  </div>
                  <p className="relative mt-3 text-sm leading-relaxed text-white/60">{c.bio}</p>
                  <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-widest text-white/35">
                    <span>{arena.name}</span>
                    <span className="text-white/15">·</span>
                    <span>{c.build}</span>
                    <span className="text-white/15">·</span>
                    <span>{c.health} HP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 text-center text-[10px] uppercase tracking-[0.3em] text-white/25">
          First-person anime combat · Web build · v1.0 MVP
        </div>
      </section>

      {showLore && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setShowLore(false)}
        >
          <div
            className="mx-4 max-w-lg rounded-xl border border-white/10 bg-[#0a0a0f] p-6 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs uppercase tracking-[0.4em] text-orange-400/80">The Mogsphere</div>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{LORE_INTRO}</p>
            <p className="mt-3 text-xs italic text-white/40">{CLOSING_LINE}</p>
            <button
              onClick={() => setShowLore(false)}
              className="mt-5 w-full rounded-lg border border-white/15 py-2.5 text-sm uppercase tracking-widest text-white/70 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
