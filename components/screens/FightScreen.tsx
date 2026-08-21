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
import StoryCutscene from "./StoryCutscene";
import BossReveal from "./BossReveal";
import FinisherSequence from "./FinisherSequence";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import { STORY_DIALOGUE } from "@/lib/storyDialogue";
import { audio } from "@/lib/audio";
import { stopOnline } from "@/lib/online";

type Stage = "tutorial" | "boss_reveal" | "story_pre" | "intro" | "countdown" | "live";

export default function FightScreen() {
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const goSelect = useGameStore((s) => s.goSelect);
  const showTutorial = useGameStore((s) => s.showTutorial);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const localMultiplayer = useGameStore((s) => s.localMultiplayer);
  const onlineRole = useGameStore((s) => s.onlineRole);
  const storyActive = useGameStore((s) => s.storyActive);
  const playerId = useGameStore((s) => s.playerId);
  const opponentId = useGameStore((s) => s.opponentId);
  const arenaId = useGameStore((s) => s.arenaId);
  const finisher = useGameStore((s) => s.finisher);
  const resolveFinisher = useGameStore((s) => s.resolveFinisher);
  const isJoiner = onlineRole === "joiner";

  // Story mode gets a real pre-fight scene instead of the lightweight
  // versus-mode MatchupIntro — a full dialogue exchange (see
  // lib/storyDialogue.ts), and for the two real bosses (Viraat/Overmog —
  // isStoryBoss/isFinalBoss) a dramatic reveal splash before even that.
  const oChar = storyActive ? getCharacter(opponentId) : null;
  const storyDialogue = storyActive ? STORY_DIALOGUE[opponentId] : undefined;
  const isBossFight = !!oChar && (oChar.isStoryBoss || oChar.isFinalBoss);

  // Rounds 2/3 of a best-of-three skip straight to a "ROUND N" countdown —
  // only round 1 gets the tutorial (if unseen) and a pre-fight scene.
  // FightScreen fully remounts between rounds (app/page.tsx only renders
  // it while phase === "fight"), so this initializer re-evaluates fresh
  // every round. Local 2P still gets the matchup-intro cutscene, just
  // skips the (single-player-oriented) tutorial, whose controls hint
  // doesn't apply once a second keyboard scheme is in play. The online
  // joiner skips straight to "live" full stop — the host already ran its
  // own intro/countdown locally, and the joiner is just mirroring
  // whatever state the host broadcasts from the moment phase flips to
  // "fight" (see lib/online.ts), so there's nothing for it to count down.
  const [stage, setStage] = useState<Stage>(() => {
    if (isJoiner) return "live";
    if (roundNumber > 1) return "countdown";
    if (showTutorial && !localMultiplayer) return "tutorial";
    if (storyDialogue) return isBossFight ? "boss_reveal" : "story_pre";
    return "intro";
  });
  const [countdown, setCountdown] = useState(3);
  const [showFightFlash, setShowFightFlash] = useState(false);

  // tutorial dismissal (store-driven) advances to whichever pre-fight scene
  // actually applies — story mode's dialogue/boss-reveal, or the plain
  // versus-mode intro.
  useEffect(() => {
    if (!showTutorial && stage === "tutorial") {
      const t = window.setTimeout(() => setStage(storyDialogue ? (isBossFight ? "boss_reveal" : "story_pre") : "intro"), 0);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Hiding the flash again is handled by its own effect below, not a t5
    // here — this effect's `[stage]` dependency means the t4 timeout's own
    // setStage("live") call re-triggers this very effect (stage changed),
    // which reruns this cleanup and would cancel a same-effect t5 before it
    // ever fired, leaving "FIGHT!" stuck on screen forever. Splitting the
    // hide timer into a separate effect keyed off showFightFlash itself
    // sidesteps that entirely.
    return () => [t0, t1, t2, t3, t4].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (!showFightFlash) return;
    const t = window.setTimeout(() => setShowFightFlash(false), 1000);
    return () => window.clearTimeout(t);
  }, [showFightFlash]);

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
          {/* Online host controls ONLY its own fighter, same WASD/J/K/L/U
              scheme as single-player — the opponent side is driven purely
              by the joiner's own OnlineJoinerInput messages over the
              network (see lib/online.ts's applyInput). LocalMultiplayerInput
              is for two people sharing ONE keyboard and binds BOTH sides
              locally, which would let an online host also drive the
              joiner's fighter directly — checked before localMultiplayer
              below since goSelect(true) sets localMultiplayer:true for the
              online-host flow too (reused for the AI-off behavior it
              already needed), not because it's actually a local 2P match. */}
          {isJoiner ? <OnlineJoinerInput /> : onlineRole === "host" ? <PlayerInput2D /> : localMultiplayer ? <LocalMultiplayerInput /> : <PlayerInput2D />}
          {/* The joiner never runs its own simulation — its store is a
              pure mirror of whatever the host broadcasts (see
              lib/online.ts's applyState), so ticking it locally would
              fight the incoming snapshots instead of just displaying them. */}
          {!isJoiner && <GameLoop2D />}
          <HUD />
        </>
      )}

      {stage === "tutorial" && <TutorialOverlay />}
      {stage === "boss_reveal" && <BossReveal characterId={opponentId} onDone={() => setStage("story_pre")} />}
      {stage === "story_pre" && storyDialogue && (
        <StoryCutscene
          lines={storyDialogue.pre}
          playerId={playerId}
          opponentId={opponentId}
          arenaId={arenaId}
          onDone={() => setStage("countdown")}
        />
      )}
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

      {/* The match-deciding blow — see FinisherInfo in lib/store.ts. tick()
          holds phase at "fight" while this is set instead of cutting
          straight to the result screen, so this renders full-screen on
          top of the (now-frozen) live fight underneath. Only the
          non-joiner side's onDone ever calls resolveFinisher() — the
          joiner just watches; the host's own eventual phase:"result"
          broadcast is what actually ends it for both sides in sync. */}
      {finisher && (
        <FinisherSequence
          winnerId={finisher.winnerSide === "player" ? playerId : opponentId}
          loserId={finisher.winnerSide === "player" ? opponentId : playerId}
          moveName={finisher.moveName}
          kind={finisher.kind}
          onDone={() => {
            if (!isJoiner) resolveFinisher();
          }}
        />
      )}
    </div>
  );
}
