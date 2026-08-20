"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { STORY_TITLE, STORY_INTRO } from "@/lib/lore";
import { STORY_LADDER } from "@/lib/story";
import { loadStorySave } from "@/lib/storySave";

/** "The Great Mog Off" — story mode's landing screen, shown before the
 * fighter picker. New Game / Load Game, same convention as an actual
 * arcade/console fighting game's story mode menu, with the Prelude track
 * playing underneath. */
export default function StoryIntroScreen() {
  const goHome = useGameStore((s) => s.goHome);
  const goStorySelect = useGameStore((s) => s.goStorySelect);
  const resumeStoryRun = useGameStore((s) => s.resumeStoryRun);
  // Lazy initializer reads localStorage once on mount — this is a client
  // component ("use client" above), so it's safe synchronously here and
  // avoids a setState-in-effect render cascade.
  const [save] = useState(() => loadStorySave());

  useEffect(() => {
    audio.unlock();
    audio.playMusic("prelude");
  }, []);

  const saveChar = save ? getCharacter(save.playerId) : null;

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black px-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_25%,rgba(255,120,40,0.18),transparent_65%)]" />

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
        <div className="text-[10px] uppercase tracking-[0.5em] text-orange-400/70">Story Mode</div>
        <h1 className="arcade-logo mt-2 font-[family-name:var(--font-display)] text-5xl tracking-wide sm:text-6xl">
          {STORY_TITLE}
        </h1>
      </div>

      <p className="relative z-10 max-w-xl text-center text-sm leading-relaxed text-white/60">{STORY_INTRO}</p>

      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              audio.playSfx("menu_confirm");
              goStorySelect();
            }}
            className="arcade-panel arcade-panel-orange px-10 py-3 text-lg font-[family-name:var(--font-display)] tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
          >
            NEW GAME
          </button>
          <button
            disabled={!save}
            onClick={() => {
              if (!save) return;
              audio.playSfx("menu_confirm");
              resumeStoryRun();
            }}
            className={`px-10 py-3 text-lg font-[family-name:var(--font-display)] tracking-widest transition-transform ${
              save
                ? "arcade-panel arcade-panel-purple text-white hover:scale-105 active:scale-95"
                : "cursor-not-allowed rounded-lg border border-white/10 text-white/25"
            }`}
          >
            LOAD GAME
          </button>
        </div>
        {save && saveChar && (
          <div className="text-xs uppercase tracking-widest text-white/40">
            Continue as {saveChar.name} · Fight {save.storyIndex + 1} of {STORY_LADDER.length}
          </div>
        )}
      </div>
    </div>
  );
}
