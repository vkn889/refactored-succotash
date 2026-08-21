"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { ROSTER, CHARACTERS } from "@/lib/characters";
import { ARENAS, ARENA_LIST } from "@/lib/arenas";
import { BUILD_POWER } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { sendInput, stopOnline } from "@/lib/online";
import { type FighterFrame2D } from "@/lib/fighterFrame2d";
import Fighter2D from "@/components/game/Fighter2D";

const IDLE_FRAME: FighterFrame2D = {
  action: "idle",
  actionTotal: 0,
  actionTimer: 0,
  meter: 0,
  x: 0,
  y: 0,
  facing: 1,
  hitToken: 0,
};

type Step = "fighter" | "opponent" | "arena";

const BUILD_LABEL: Record<string, string> = {
  slim: "Fast & light",
  normal: "Balanced",
  bulky: "Heavy hitter",
  tank: "Slow & devastating",
};

export default function CharacterSelect({ storyMode = false, shadowMode = false }: { storyMode?: boolean; shadowMode?: boolean }) {
  const goHome = useGameStore((s) => s.goHome);
  const startMatch = useGameStore((s) => s.startMatch);
  const startStoryRun = useGameStore((s) => s.startStoryRun);
  const startShadowMatch = useGameStore((s) => s.startShadowMatch);
  const localMultiplayer = useGameStore((s) => s.localMultiplayer);
  const onlineRole = useGameStore((s) => s.onlineRole);
  const onlinePeerCharacterId = useGameStore((s) => s.onlinePeerCharacterId);

  const isHost = onlineRole === "host";
  const isJoiner = onlineRole === "joiner";

  const [step, setStep] = useState<Step>("fighter");
  const [playerId, setPlayerId] = useState("gautham");
  const [opponentId, setOpponentId] = useState(() => rollOpponent("gautham"));
  const [arenaId, setArenaId] = useState(CHARACTERS.gautham.arenaId);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Joiner-only: true once they've locked in a fighter and reported it to
  // the host — from then on they just wait, since only the HOST ever picks
  // the arena or actually starts the match (see lib/online.ts's top
  // comment on host-authoritative design).
  const [joinerReady, setJoinerReady] = useState(false);

  // Backing out to Home from anywhere in an online session (either side)
  // shouldn't leave the Realtime channel connected in the background — see
  // the same discipline in OnlineLobbyScreen/FightScreen.
  const leaveOnline = () => {
    if (onlineRole) stopOnline();
    goHome();
  };

  useEffect(() => {
    audio.unlock();
    audio.playMusic("stageSelect");
  }, []);

  // The host never free-picks the opponent's fighter online — whatever the
  // joiner has reported over the network (see setOnlinePeerCharacterId)
  // wins, right up until match start, falling back to the local
  // `opponentId` state only for non-online flows (single-player/local MP).
  const effectiveOpponentId = isHost ? (onlinePeerCharacterId ?? opponentId) : opponentId;

  // Story mode skips opponent/arena picking entirely — both are fixed by
  // the ladder (lib/story.ts) — so it never leaves the "fighter" step.
  // Shadow mode is the same one-step shortcut for the same reason: the
  // "opponent" is always a copy of whatever you just picked, so there's
  // nothing to choose there, and it always fights in your own arena.
  // Online joiners likewise never see an "opponent"/"arena" step at all —
  // they only ever pick their own fighter (see JoinerWaitingPanel below).
  const singleStep = storyMode || shadowMode;
  const effectiveStep = singleStep || isJoiner ? "fighter" : step;

  if (isJoiner && joinerReady) {
    return <JoinerWaitingPanel characterId={playerId} onChangeFighter={() => setJoinerReady(false)} onLeave={leaveOnline} />;
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => {
            if (singleStep || isJoiner || effectiveStep === "fighter") leaveOnline();
            else if (effectiveStep === "opponent") setStep("fighter");
            else setStep("opponent");
          }}
          className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
        >
          ← {singleStep || isJoiner || effectiveStep === "fighter" ? "Home" : "Back"}
        </button>
        {!singleStep && !isJoiner && (
          <div className="flex items-center gap-2">
            {(["fighter", "opponent", "arena"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${effectiveStep === s ? "bg-orange-400" : "bg-white/20"}`}
                />
                {i < 2 && <div className="h-px w-6 bg-white/10" />}
              </div>
            ))}
          </div>
        )}
        <h2 className="font-[family-name:var(--font-display)] text-xl tracking-widest text-white/90">
          {storyMode
            ? "Choose Your Story Fighter"
            : shadowMode
              ? "Choose Your Fighter"
              : isJoiner
              ? "Choose Your Fighter"
              : effectiveStep === "fighter"
                ? isHost
                  ? "Choose Your Fighter"
                  : localMultiplayer
                    ? "Player 1 — Choose Your Fighter"
                    : "Choose Your Fighter"
                : effectiveStep === "opponent"
                  ? isHost
                    ? "Opponent"
                    : localMultiplayer
                      ? "Player 2 — Choose Your Fighter"
                      : "Choose Your Opponent"
                  : "Choose Your Arena"}
        </h2>
        <div className="w-16" />
      </header>

      {effectiveStep === "opponent" && isHost ? (
        <HostWaitingStep
          peerCharacterId={onlinePeerCharacterId}
          onNext={() => {
            audio.playSfx("menu_confirm");
            setStep("arena");
          }}
        />
      ) : effectiveStep !== "arena" ? (
        <FighterStep
          step={effectiveStep}
          storyMode={storyMode}
          shadowMode={shadowMode}
          isOnline={isHost || isJoiner}
          playerId={playerId}
          opponentId={opponentId}
          focusId={focusId}
          setFocusId={setFocusId}
          onPick={(id) => {
            audio.playSfx("menu_select");
            if (effectiveStep === "fighter") {
              setPlayerId(id);
              setArenaId(CHARACTERS[id].arenaId);
              if (!isHost && !isJoiner && opponentId === id) setOpponentId(rollOpponent(id));
            } else {
              setOpponentId(id);
            }
          }}
          onNext={() => {
            audio.playSfx("menu_confirm");
            if (storyMode) {
              startStoryRun(playerId);
            } else if (shadowMode) {
              startShadowMatch(playerId);
            } else if (isJoiner) {
              sendInput({ t: "select", characterId: playerId });
              setJoinerReady(true);
            } else if (isHost) {
              setStep("opponent");
            } else {
              setStep(effectiveStep === "fighter" ? "opponent" : "arena");
            }
          }}
        />
      ) : (
        <ArenaStep
          arenaId={arenaId}
          onPick={(id) => {
            audio.playSfx("menu_select");
            setArenaId(id);
          }}
          onFight={() => {
            audio.playSfx("menu_confirm");
            startMatch(playerId, effectiveOpponentId, arenaId);
          }}
        />
      )}
    </div>
  );
}

/** Online host only — the "opponent" step doesn't let the host pick the
 * peer's fighter (they only ever pick their own, same as the joiner does);
 * it just shows whatever the joiner has reported so far, live. */
function HostWaitingStep({
  peerCharacterId,
  onNext,
}: {
  peerCharacterId: string | null;
  onNext: () => void;
}) {
  const preview = peerCharacterId ? CHARACTERS[peerCharacterId] : null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-6 text-center">
      {preview ? (
        <>
          <div className="relative h-56 w-56 overflow-hidden rounded-lg bg-black">
            <Fighter2D characterId={preview.id} getFrame={() => IDLE_FRAME} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/40">Opponent locked in</div>
            <div className="font-[family-name:var(--font-display)] text-3xl tracking-wide">{preview.name}</div>
            <div className="text-xs uppercase tracking-widest" style={{ color: preview.colors.emissive }}>
              {preview.title} · {preview.element}
            </div>
          </div>
          <button
            onClick={onNext}
            className="arcade-panel arcade-panel-orange px-10 py-3 font-[family-name:var(--font-display)] text-xl tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
          >
            NEXT: ARENA
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-white/60">
          <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
          Waiting for opponent to choose a fighter…
        </div>
      )}
    </div>
  );
}

/** Online joiner only — shown after they've locked in their own fighter.
 * Only the host ever picks the arena or starts the match; applyState
 * (lib/online.ts) flips this whole screen away automatically the moment
 * the host actually does. */
function JoinerWaitingPanel({
  characterId,
  onChangeFighter,
  onLeave,
}: {
  characterId: string;
  onChangeFighter: () => void;
  onLeave: () => void;
}) {
  const char = CHARACTERS[characterId];
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-black px-6 text-center text-white">
      <div className="relative h-56 w-56 overflow-hidden rounded-lg bg-black">
        <Fighter2D characterId={char.id} getFrame={() => IDLE_FRAME} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-white/40">Locked in as</div>
        <div className="font-[family-name:var(--font-display)] text-3xl tracking-wide">{char.name}</div>
      </div>
      <div className="flex items-center gap-2 text-white/60">
        <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />
        Waiting for host to choose the arena and start the match…
      </div>
      <div className="flex gap-4 text-xs uppercase tracking-widest text-white/40">
        <button onClick={onChangeFighter} className="hover:text-white/70">
          Change Fighter
        </button>
        <button onClick={onLeave} className="hover:text-white/70">
          Leave Match
        </button>
      </div>
    </div>
  );
}

function FighterStep({
  step,
  storyMode,
  shadowMode,
  isOnline,
  playerId,
  opponentId,
  focusId,
  setFocusId,
  onPick,
  onNext,
}: {
  step: "fighter" | "opponent";
  storyMode: boolean;
  shadowMode: boolean;
  isOnline: boolean;
  playerId: string;
  opponentId: string;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  onPick: (id: string) => void;
  onNext: () => void;
}) {
  const selectedId = step === "fighter" ? playerId : opponentId;
  // Online, each side only ever picks their own fighter — there's no
  // "opponent" step to exclude anyone from (see HostWaitingStep/
  // JoinerWaitingPanel), and mirror matches are allowed since neither side
  // can see the other's live pick to avoid it anyway.
  const excludedId = isOnline || step === "fighter" ? null : playerId;
  const preview = CHARACTERS[focusId ?? selectedId];
  const arena = ARENAS[preview.arenaId];

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden px-6 pb-6 lg:grid-cols-[1fr_360px]">
      {/* flex-wrap, not a fixed-column grid — sizes to however many
          characters actually exist (18 currently) without ever stretching
          cards to fill leftover space if the roster size changes again. */}
      <div className="flex flex-wrap content-start gap-3 overflow-y-auto pr-1">
        {ROSTER.map((c) => {
          const selected = c.id === selectedId;
          const excluded = c.id === excludedId;
          return (
            <button
              key={c.id}
              disabled={excluded}
              onMouseEnter={() => setFocusId(c.id)}
              onMouseLeave={() => setFocusId(null)}
              onClick={() => onPick(c.id)}
              className={`group relative flex w-36 shrink-0 flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all sm:w-40 ${
                excluded
                  ? "cursor-not-allowed border-white/5 bg-white/[0.01] opacity-30"
                  : selected
                    ? "scale-[1.03] border-white/80 bg-white/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
              }`}
            >
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
                style={{ background: `radial-gradient(circle, ${c.colors.emissive}55, transparent 70%)`, border: `2px solid ${c.colors.emissive}` }}
              >
                {c.name[0]}
              </div>
              <div className="font-[family-name:var(--font-display)] text-base tracking-wide">{c.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">{c.element}</div>
              {(c.isFinalBoss || c.isStoryBoss) && <div className="absolute right-1.5 top-1.5 text-[9px] uppercase tracking-wide text-fuchsia-400">Boss</div>}
              {excluded && <div className="absolute left-1.5 top-1.5 text-[9px] uppercase tracking-wide text-white/40">You</div>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="relative h-56 overflow-hidden rounded-lg bg-black">
          <Fighter2D characterId={preview.id} getFrame={() => IDLE_FRAME} />
          <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent 40%)" }} />
        </div>

        <div>
          <div className="font-[family-name:var(--font-display)] text-3xl tracking-wide">{preview.name}</div>
          <div className="text-xs uppercase tracking-widest" style={{ color: preview.colors.emissive }}>
            {preview.title} · {preview.element}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-white/60">{preview.bio}</p>
        <dl className="grid grid-cols-2 gap-2 text-xs text-white/50">
          <Stat label="Home Arena" value={arena.name} />
          <Stat label="Health" value={String(preview.health)} />
          <Stat label="Punch Damage" value={`x${BUILD_POWER[preview.build].damage.toFixed(2)}`} />
          <Stat label="Attack Speed" value={`x${BUILD_POWER[preview.build].speed.toFixed(2)}`} />
          <Stat label="Fighting Style" value={BUILD_LABEL[preview.build]} />
          <Stat label="Signature" value={`"${preview.voiceLine}"`} />
        </dl>

        <button
          onClick={onNext}
          className="mt-auto arcade-panel arcade-panel-orange py-3 font-[family-name:var(--font-display)] text-xl tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          {storyMode ? "BEGIN STORY" : shadowMode ? "ENTER THE SHADOW" : isOnline ? "READY" : step === "fighter" ? "NEXT: OPPONENT" : "NEXT: ARENA"}
        </button>
      </div>
    </div>
  );
}

function ArenaStep({ arenaId, onPick, onFight }: { arenaId: string; onPick: (id: string) => void; onFight: () => void }) {
  const arena = ARENAS[arenaId];
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden px-6 pb-6 lg:grid-cols-[1fr_360px]">
      <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-3">
        {ARENA_LIST.map((a) => {
          const selected = a.id === arenaId;
          return (
            <button
              key={a.id}
              onClick={() => onPick(a.id)}
              className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                selected ? "scale-[1.02] border-white/80" : "border-white/10 hover:border-white/30"
              }`}
            >
              <div className="relative aspect-video w-full bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/images/arenas/${a.id}.jpg`}
                  alt={a.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: `linear-gradient(to top, rgba(0,0,0,0.85), transparent 50%)` }}
                />
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="text-sm font-[family-name:var(--font-display)] tracking-wide text-white">{a.name}</div>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: a.rimLight }}>
                    {a.era} · {a.element}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/images/arenas/${arena.id}.jpg`}
            alt={arena.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div>
          <div className="font-[family-name:var(--font-display)] text-3xl tracking-wide">{arena.name}</div>
          <div className="text-xs uppercase tracking-widest" style={{ color: arena.rimLight }}>
            {arena.era} era · {arena.element}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-white/60">{arena.description}</p>

        <button
          onClick={onFight}
          className="mt-auto arcade-panel arcade-panel-orange py-3 font-[family-name:var(--font-display)] text-xl tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          FIGHT
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/30">{label}</div>
      <div className="text-white/80">{value}</div>
    </div>
  );
}

function rollOpponent(excludeId: string): string {
  const options = ROSTER.filter((c) => c.id !== excludeId);
  return options[Math.floor(Math.random() * options.length)].id;
}
