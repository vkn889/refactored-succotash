"use client";

import { useGameStore, type FighterRuntime } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { STORY_LADDER, isLastStoryFight } from "@/lib/story";
import { CLOSING_LINE } from "@/lib/lore";
import type { CharacterConfig } from "@/lib/types";

export default function ResultScreen() {
  const winner = useGameStore((s) => s.winner);
  const playerId = useGameStore((s) => s.playerId);
  const opponentId = useGameStore((s) => s.opponentId);
  const player = useGameStore((s) => s.player);
  const opponent = useGameStore((s) => s.opponent);
  const restartMatch = useGameStore((s) => s.restartMatch);
  const goSelect = useGameStore((s) => s.goSelect);
  const goHome = useGameStore((s) => s.goHome);
  const storyActive = useGameStore((s) => s.storyActive);
  const storyIndex = useGameStore((s) => s.storyIndex);
  const advanceStory = useGameStore((s) => s.advanceStory);
  const endStoryRun = useGameStore((s) => s.endStoryRun);

  const pChar = getCharacter(playerId);
  const oChar = getCharacter(opponentId);
  const playerWon = winner === "player";
  const draw = winner === "draw";

  if (storyActive) {
    return (
      <StoryResultScreen
        playerWon={playerWon}
        draw={draw}
        pChar={pChar}
        oChar={oChar}
        player={player}
        opponent={opponent}
        storyIndex={storyIndex}
        onContinue={() => {
          audio.playSfx("menu_confirm");
          advanceStory();
        }}
        onRetry={() => {
          audio.playSfx("menu_confirm");
          restartMatch();
        }}
        onQuit={() => {
          audio.playSfx("menu_select");
          endStoryRun();
          goHome();
        }}
      />
    );
  }

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${playerWon ? pChar.colors.emissive : draw ? "#888" : oChar.colors.emissive}33, transparent 60%)`,
        }}
      />

      <div className="relative z-10 text-center">
        <div className="text-xs uppercase tracking-[0.5em] text-white/40">
          {draw ? "Time Out" : "Victory"}
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-6xl sm:text-7xl tracking-wide">
          {draw ? "DRAW" : playerWon ? `${pChar.name} MOGS` : `${oChar.name} MOGS`}
        </h1>
        {!draw && (
          <p className="mt-2 text-sm italic text-white/50">
            &ldquo;{playerWon ? pChar.voiceLine : oChar.voiceLine}&rdquo;
          </p>
        )}
      </div>

      <div className="relative z-10 flex items-center gap-10 text-center">
        <div>
          <div className="font-[family-name:var(--font-display)] text-2xl">{pChar.name}</div>
          <div className="text-xs text-white/40">{Math.round(player.health)} / {player.maxHealth} HP</div>
        </div>
        <div className="text-white/30">vs</div>
        <div>
          <div className="font-[family-name:var(--font-display)] text-2xl">{oChar.name}</div>
          <div className="text-xs text-white/40">{Math.round(opponent.health)} / {opponent.maxHealth} HP</div>
        </div>
      </div>

      <div className="relative z-10 flex gap-3">
        <button
          onClick={() => {
            audio.playSfx("menu_confirm");
            restartMatch();
          }}
          className="rounded-lg bg-gradient-to-br from-orange-500 to-red-600 px-6 py-3 font-[family-name:var(--font-display)] tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-105 active:scale-95"
        >
          REMATCH
        </button>
        <button
          onClick={() => {
            audio.playSfx("menu_select");
            goSelect();
          }}
          className="rounded-lg border border-white/20 px-6 py-3 font-[family-name:var(--font-display)] tracking-widest hover:bg-white/10"
        >
          CHANGE FIGHTER
        </button>
        <button
          onClick={() => {
            audio.playSfx("menu_select");
            goHome();
          }}
          className="rounded-lg border border-white/10 px-6 py-3 text-sm text-white/50 hover:bg-white/10"
        >
          Home
        </button>
      </div>
    </div>
  );
}

/** Result screen for a story-mode fight: on a win, either advances to the
 * next rung of the ladder or — after Overmog — shows the run's ending; on
 * a loss, the run ends and offers a retry of the same fight rather than
 * bouncing back to normal versus-mode buttons. */
function StoryResultScreen({
  playerWon,
  draw,
  pChar,
  oChar,
  player,
  opponent,
  storyIndex,
  onContinue,
  onRetry,
  onQuit,
}: {
  playerWon: boolean;
  draw: boolean;
  pChar: CharacterConfig;
  oChar: CharacterConfig;
  player: FighterRuntime;
  opponent: FighterRuntime;
  storyIndex: number;
  onContinue: () => void;
  onRetry: () => void;
  onQuit: () => void;
}) {
  const wasFinalFight = isLastStoryFight(storyIndex);
  const won = playerWon && !draw;
  const runComplete = won && wasFinalFight;
  const nextUp = won && !wasFinalFight ? getCharacter(STORY_LADDER[storyIndex + 1]) : null;

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-black text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${won ? pChar.colors.emissive : oChar.colors.emissive}33, transparent 60%)`,
        }}
      />

      <div className="relative z-10 text-center">
        <div className="text-xs uppercase tracking-[0.5em] text-white/40">
          Story Mode · {storyIndex + 1} / {STORY_LADDER.length}
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-6xl sm:text-7xl tracking-wide">
          {runComplete ? "THE MOGSPHERE ENDS" : draw ? "DRAW" : won ? `${oChar.name} FALLS` : "RUN OVER"}
        </h1>
        {!runComplete && (
          <p className="mt-2 text-sm italic text-white/50">
            &ldquo;{won ? pChar.voiceLine : oChar.voiceLine}&rdquo;
          </p>
        )}
      </div>

      {runComplete ? (
        <p className="relative z-10 max-w-lg text-center text-sm leading-relaxed text-white/60">{CLOSING_LINE}</p>
      ) : (
        <div className="relative z-10 flex items-center gap-10 text-center">
          <div>
            <div className="font-[family-name:var(--font-display)] text-2xl">{pChar.name}</div>
            <div className="text-xs text-white/40">{Math.round(player.health)} / {player.maxHealth} HP</div>
          </div>
          <div className="text-white/30">vs</div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-2xl">{oChar.name}</div>
            <div className="text-xs text-white/40">{Math.round(opponent.health)} / {opponent.maxHealth} HP</div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex gap-3">
        {won && !runComplete && nextUp && (
          <button
            onClick={onContinue}
            className="rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-700 px-6 py-3 font-[family-name:var(--font-display)] tracking-widest shadow-[0_0_25px_rgba(217,70,239,0.35)] transition-transform hover:scale-105 active:scale-95"
          >
            NEXT: {nextUp.name.toUpperCase()}
          </button>
        )}
        {!won && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-gradient-to-br from-orange-500 to-red-600 px-6 py-3 font-[family-name:var(--font-display)] tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-105 active:scale-95"
          >
            RETRY
          </button>
        )}
        <button
          onClick={onQuit}
          className="rounded-lg border border-white/10 px-6 py-3 text-sm text-white/50 hover:bg-white/10"
        >
          {runComplete ? "Return Home" : "Quit Run"}
        </button>
      </div>
    </div>
  );
}
