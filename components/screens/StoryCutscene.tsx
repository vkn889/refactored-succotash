"use client";

import { useEffect, useRef, useState } from "react";
import { getCharacter } from "@/lib/combat";
import { ARENAS } from "@/lib/arenas";
import { audio } from "@/lib/audio";
import type { DialogueLine } from "@/lib/storyDialogue";
import type { FighterFrame2D } from "@/lib/fighterFrame2d";
import Fighter2D from "@/components/game/Fighter2D";

const IDLE_FRAME = (facing: 1 | -1): FighterFrame2D => ({
  action: "idle",
  actionTotal: 0,
  actionTimer: 0,
  meter: 0,
  x: 0,
  y: 0,
  facing,
  hitToken: 0,
});

const CHARS_PER_MS = 1 / 22; // typewriter reveal rate

/** Story mode's real dialogue engine — a VN-style exchange (portrait +
 * nameplate + typewriter-revealed text box, click/Space/Enter to advance)
 * that plays a full `DialogueLine[]` script over the match's own arena
 * backdrop, with the two fighters' idle portraits reacting to whoever's
 * currently speaking (dimmed when it's not their line). Used for every
 * story-mode fight's pre-fight beat and post-fight reaction (see
 * lib/storyDialogue.ts for the actual scripts) — replaces the lightweight
 * two-line MatchupIntro that versus mode still uses on its own, since
 * versus mode has no ladder narrative to carry. */
export default function StoryCutscene({
  lines,
  playerId,
  opponentId,
  arenaId,
  onDone,
}: {
  lines: DialogueLine[];
  playerId: string;
  opponentId: string;
  arenaId: string;
  onDone: () => void;
}) {
  const pChar = getCharacter(playerId);
  const oChar = getCharacter(opponentId);
  const arena = ARENAS[arenaId] ?? ARENAS.void_throne;

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0); // characters of the current line shown so far
  const line = lines[index];
  const full = line?.text ?? "";
  const done = revealed >= full.length;
  const startRef = useRef(0);
  // Set by advance()'s "skip ahead" click — checked at the top of the rAF
  // tick loop below. Without this, clicking to skip only ever set
  // `revealed` once; the still-running rAF loop from the SAME effect
  // invocation would immediately overwrite it back down to a smaller
  // elapsed-time-based value on its very next frame (it doesn't know a
  // skip happened), so the line just kept typing at its normal pace no
  // matter how many times you clicked — this flag is what actually stops
  // the loop instead of racing it.
  const skipRef = useRef(false);

  useEffect(() => {
    audio.playSfx("menu_select");
  }, [index]);

  // The typewriter tick loop only ever calls setState from inside the rAF
  // callback below, never synchronously in the effect body — resetting
  // `revealed` back to 0 for a new line happens in advance() instead (a
  // plain event handler, batched with the same click's setIndex call), not
  // here, so this effect never needs a same-tick setState of its own.
  useEffect(() => {
    if (!line) return;
    skipRef.current = false;
    startRef.current = performance.now();
    let raf: number;
    const tick = (t: number) => {
      if (skipRef.current) {
        setRevealed(full.length);
        return; // don't reschedule — the skip already finished this line
      }
      const chars = Math.floor((t - startRef.current) * CHARS_PER_MS);
      setRevealed(Math.min(full.length, chars));
      if (chars < full.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const advance = () => {
    if (!done) {
      // First press just finishes the typewriter instantly, standard VN UX.
      skipRef.current = true;
      setRevealed(full.length);
      return;
    }
    if (index + 1 >= lines.length) {
      audio.playSfx("menu_confirm");
      onDone();
    } else {
      setRevealed(0);
      setIndex(index + 1);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!line) return null;

  const speakerChar = line.speaker === "player" ? pChar : line.speaker === "opponent" ? oChar : null;
  const playerActive = line.speaker === "player";
  const opponentActive = line.speaker === "opponent";

  return (
    <div className="absolute inset-0 cursor-pointer overflow-hidden bg-black" onClick={advance}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${arena.skyTop}33, ${arena.floorColor}77), url(/images/arenas/${arena.id}.jpg)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />

      <div className="absolute inset-x-0 bottom-[26%] flex h-[50%] items-end justify-center gap-6 px-8 sm:gap-20">
        <div
          className={`h-full w-40 transition-all duration-300 sm:w-56 ${playerActive ? "opacity-100 scale-100" : "opacity-45 scale-95 grayscale-[0.3]"}`}
        >
          <Fighter2D characterId={playerId} getFrame={() => IDLE_FRAME(1)} />
        </div>
        <div
          className={`h-full w-40 transition-all duration-300 sm:w-56 ${opponentActive ? "opacity-100 scale-100" : "opacity-45 scale-95 grayscale-[0.3]"}`}
        >
          <Fighter2D characterId={opponentId} getFrame={() => IDLE_FRAME(-1)} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
        <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-black/70 p-5 backdrop-blur-sm">
          {speakerChar ? (
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: speakerChar.colors.emissive, boxShadow: `0 0 8px ${speakerChar.colors.emissive}` }}
              />
              <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: speakerChar.colors.emissive }}>
                {speakerChar.name}
              </span>
            </div>
          ) : (
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.25em] text-white/40">The Mogsphere</div>
          )}
          <p className={`min-h-[3.2em] text-lg leading-relaxed ${speakerChar ? "text-white" : "italic text-white/70"}`}>
            {full.slice(0, revealed)}
            {!done && <span className="animate-pulse">▌</span>}
          </p>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/30">
            <span>
              {index + 1} / {lines.length}
            </span>
            <span className={done ? "animate-pulse" : ""}>{done ? "Click / Enter to continue ▸" : "Click to skip ahead"}</span>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          audio.playSfx("menu_select");
          onDone();
        }}
        className="absolute bottom-6 right-6 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-white/50 hover:bg-white/10 hover:text-white/80"
      >
        Skip ▸
      </button>
    </div>
  );
}
