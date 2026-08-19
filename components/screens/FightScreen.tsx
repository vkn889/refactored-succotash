"use client";

import { useEffect, useState } from "react";
import GameCanvas from "@/components/game/GameCanvas";
import HUD from "@/components/ui/HUD";
import TutorialOverlay from "@/components/ui/TutorialOverlay";
import MatchupIntro from "./MatchupIntro";
import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";

type Stage = "tutorial" | "intro" | "countdown" | "live";

export default function FightScreen() {
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const goSelect = useGameStore((s) => s.goSelect);
  const showTutorial = useGameStore((s) => s.showTutorial);
  const [stage, setStage] = useState<Stage>(showTutorial ? "tutorial" : "intro");
  const [countdown, setCountdown] = useState(3);

  // tutorial dismissal (store-driven) advances straight to the intro cutscene
  useEffect(() => {
    if (!showTutorial && stage === "tutorial") {
      const t = window.setTimeout(() => setStage("intro"), 0);
      return () => window.clearTimeout(t);
    }
  }, [showTutorial, stage]);

  useEffect(() => {
    if (stage !== "countdown") return;
    // countdown starts at 3 already (useState initial value / fresh mount per match)
    const t0 = window.setTimeout(() => setPaused(true), 0);
    const t1 = window.setTimeout(() => setCountdown(2), 700);
    const t2 = window.setTimeout(() => setCountdown(1), 1400);
    const t3 = window.setTimeout(() => setCountdown(0), 2100);
    const t4 = window.setTimeout(() => {
      setPaused(false);
      setStage("live");
    }, 2500);
    return () => [t0, t1, t2, t3, t4].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && stage === "live") setPaused(!useGameStore.getState().paused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, setPaused]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {(stage === "countdown" || stage === "live") && (
        <>
          <GameCanvas />
          <HUD />
        </>
      )}

      {stage === "tutorial" && <TutorialOverlay />}
      {stage === "intro" && <MatchupIntro onDone={() => setStage("countdown")} />}

      {stage === "countdown" && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="font-[family-name:var(--font-display)] text-9xl text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]">
            {countdown}
          </div>
        </div>
      )}

      {stage === "live" && paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <div className="font-[family-name:var(--font-display)] text-4xl tracking-widest">PAUSED</div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                audio.playSfx("menu_confirm");
                setPaused(false);
              }}
              className="rounded-lg bg-gradient-to-br from-orange-500 to-red-600 px-6 py-2.5 font-[family-name:var(--font-display)] tracking-widest"
            >
              RESUME
            </button>
            <button
              onClick={() => {
                audio.playSfx("menu_select");
                audio.stopAmbient();
                audio.setThemeVolume(0.55);
                setPaused(false);
                goSelect();
              }}
              className="rounded-lg border border-white/20 px-6 py-2.5 font-[family-name:var(--font-display)] tracking-widest hover:bg-white/10"
            >
              QUIT MATCH
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
