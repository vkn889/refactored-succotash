"use client";

import { useEffect, useState } from "react";
import Stage2D from "@/components/game/Stage2D";
import PlayerInput2D from "@/components/game/PlayerInput2D";
import LocalMultiplayerInput from "@/components/game/LocalMultiplayerInput";
import OnlineJoinerInput from "@/components/game/OnlineJoinerInput";
import GameLoop2D from "@/components/game/GameLoop2D";
import HUD from "@/components/ui/HUD";
import TutorialOverlay from "@/components/ui/TutorialOverlay";
import MatchupIntro from "./MatchupIntro";
import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";
import { stopOnline } from "@/lib/online";

type Stage = "tutorial" | "intro" | "countdown" | "live";

export default function FightScreen() {
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const goSelect = useGameStore((s) => s.goSelect);
  const showTutorial = useGameStore((s) => s.showTutorial);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const localMultiplayer = useGameStore((s) => s.localMultiplayer);
  const onlineRole = useGameStore((s) => s.onlineRole);
  const isJoiner = onlineRole === "joiner";
  // Rounds 2/3 of a best-of-three skip straight to a "ROUND N" countdown —
  // only round 1 gets the tutorial (if unseen) and the matchup-intro
  // cutscene. FightScreen fully remounts between rounds (app/page.tsx only
  // renders it while phase === "fight"), so this initializer re-evaluates
  // fresh every round. Local 2P still gets the matchup-intro cutscene, just
  // skips the (single-player-oriented) tutorial, whose controls hint
  // doesn't apply once a second keyboard scheme is in play. The online
  // joiner skips straight to "live" full stop — the host already ran its
  // own intro/countdown locally, and the joiner is just mirroring
  // whatever state the host broadcasts from the moment phase flips to
  // "fight" (see lib/online.ts), so there's nothing for it to count down.
  const [stage, setStage] = useState<Stage>(
    isJoiner ? "live" : roundNumber > 1 ? "countdown" : showTutorial && !localMultiplayer ? "tutorial" : "intro"
  );
  const [countdown, setCountdown] = useState(3);
  const [showFightFlash, setShowFightFlash] = useState(false);

  // tutorial dismissal (store-driven) advances straight to the intro cutscene
  useEffect(() => {
    if (!showTutorial && stage === "tutorial") {
      const t = window.setTimeout(() => setStage("intro"), 0);
      return () => window.clearTimeout(t);
    }
  }, [showTutorial, stage]);

  useEffect(() => {
    if (stage !== "countdown" || isJoiner) return;
    // countdown starts at 3 already (useState initial value / fresh mount per match)
    const t0 = window.setTimeout(() => setPaused(true), 0);
    const t1 = window.setTimeout(() => setCountdown(2), 700);
    const t2 = window.setTimeout(() => setCountdown(1), 1400);
    const t3 = window.setTimeout(() => setCountdown(0), 2100);
    const t4 = window.setTimeout(() => {
      setPaused(false);
      setStage("live");
      setShowFightFlash(true);
      audio.playSfx("meter_full"); // sharpest existing SFX for a "FIGHT!" stinger — no dedicated asset for it
    }, 2500);
    const t5 = window.setTimeout(() => setShowFightFlash(false), 3500); // FIGHT! shows for 1s after appearing at t4 (2500ms)
    return () => [t0, t1, t2, t3, t4, t5].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    // Pausing has no meaning for the joiner — it doesn't run tick() at all
    // (see GameLoop2D below), so a local "paused" flag would only show a
    // confusing overlay without actually pausing anything on the host.
    if (isJoiner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && stage === "live") setPaused(!useGameStore.getState().paused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, setPaused, isJoiner]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {(stage === "countdown" || stage === "live") && (
        <>
          <Stage2D />
          {isJoiner ? <OnlineJoinerInput /> : localMultiplayer ? <LocalMultiplayerInput /> : <PlayerInput2D />}
          {/* The joiner never runs its own simulation — its store is a
              pure mirror of whatever the host broadcasts (see
              lib/online.ts's applyState), so ticking it locally would
              fight the incoming snapshots instead of just displaying them. */}
          {!isJoiner && <GameLoop2D />}
          <HUD />
        </>
      )}

      {stage === "tutorial" && <TutorialOverlay />}
      {stage === "intro" && <MatchupIntro onDone={() => setStage("countdown")} />}

      {stage === "countdown" && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="font-[family-name:var(--font-display)] text-2xl tracking-[0.4em] text-orange-400 drop-shadow-[0_0_16px_rgba(255,140,40,0.7)]">
            ROUND {roundNumber}
          </div>
          <div className="font-[family-name:var(--font-display)] text-9xl text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]">
            {countdown}
          </div>
        </div>
      )}

      {showFightFlash && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="arcade-logo fight-flash font-[family-name:var(--font-display)] text-8xl tracking-wider sm:text-9xl">FIGHT!</div>
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
              className="arcade-panel arcade-panel-orange px-6 py-2.5 font-[family-name:var(--font-display)] tracking-widest"
            >
              RESUME
            </button>
            <button
              onClick={() => {
                audio.playSfx("menu_select");
                audio.stopAmbient();
                audio.setThemeVolume(0.55);
                setPaused(false);
                if (onlineRole) stopOnline();
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
