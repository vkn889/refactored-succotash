"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGameStore } from "@/lib/store";
import { ROSTER, CHARACTERS } from "@/lib/characters";
import { ARENAS, ARENA_LIST } from "@/lib/arenas";
import { BUILD_POWER } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { type FighterFrame } from "@/lib/fighterFrame";
import MixamoFighter from "@/components/game/MixamoFighter";

const IDLE_FRAME: FighterFrame = {
  action: "idle",
  actionTotal: 0,
  actionTimer: 0,
  chargeHeld: 0,
  meter: 0,
  x: 0,
  z: 0,
  faceX: 0,
  faceZ: 1,
  hitToken: 0,
};

type Step = "fighter" | "opponent" | "arena";

const BUILD_LABEL: Record<string, string> = {
  slim: "Fast & light",
  normal: "Balanced",
  bulky: "Heavy hitter",
  tank: "Slow & devastating",
};

export default function CharacterSelect({ storyMode = false }: { storyMode?: boolean }) {
  const goHome = useGameStore((s) => s.goHome);
  const startMatch = useGameStore((s) => s.startMatch);
  const startStoryRun = useGameStore((s) => s.startStoryRun);

  const [step, setStep] = useState<Step>("fighter");
  const [playerId, setPlayerId] = useState("gautham");
  const [opponentId, setOpponentId] = useState(() => rollOpponent("gautham"));
  const [arenaId, setArenaId] = useState(CHARACTERS.gautham.arenaId);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    audio.unlock();
    audio.playTheme();
  }, []);

  // Story mode skips opponent/arena picking entirely — both are fixed by
  // the ladder (lib/story.ts) — so it never leaves the "fighter" step.
  const effectiveStep = storyMode ? "fighter" : step;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => {
            if (storyMode || effectiveStep === "fighter") goHome();
            else if (effectiveStep === "opponent") setStep("fighter");
            else setStep("opponent");
          }}
          className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
        >
          ← {storyMode || effectiveStep === "fighter" ? "Home" : "Back"}
        </button>
        {!storyMode && (
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
            : effectiveStep === "fighter"
              ? "Choose Your Fighter"
              : effectiveStep === "opponent"
                ? "Choose Your Opponent"
                : "Choose Your Arena"}
        </h2>
        <div className="w-16" />
      </header>

      {effectiveStep !== "arena" ? (
        <FighterStep
          step={effectiveStep}
          storyMode={storyMode}
          playerId={playerId}
          opponentId={opponentId}
          focusId={focusId}
          setFocusId={setFocusId}
          onPick={(id) => {
            audio.playSfx("menu_select");
            if (effectiveStep === "fighter") {
              setPlayerId(id);
              setArenaId(CHARACTERS[id].arenaId);
              if (opponentId === id) setOpponentId(rollOpponent(id));
            } else {
              setOpponentId(id);
            }
          }}
          onNext={() => {
            audio.playSfx("menu_confirm");
            if (storyMode) startStoryRun(playerId);
            else setStep(effectiveStep === "fighter" ? "opponent" : "arena");
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
            startMatch(playerId, opponentId, arenaId);
          }}
        />
      )}
    </div>
  );
}

function FighterStep({
  step,
  storyMode,
  playerId,
  opponentId,
  focusId,
  setFocusId,
  onPick,
  onNext,
}: {
  step: "fighter" | "opponent";
  storyMode: boolean;
  playerId: string;
  opponentId: string;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  onPick: (id: string) => void;
  onNext: () => void;
}) {
  const selectedId = step === "fighter" ? playerId : opponentId;
  const excludedId = step === "fighter" ? null : playerId;
  const preview = CHARACTERS[focusId ?? selectedId];
  const arena = ARENAS[preview.arenaId];

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden px-6 pb-6 lg:grid-cols-[1fr_360px]">
      {/* flex-wrap, not a fixed-column grid: the roster is temporarily
          scoped to 2 fighters (see ROSTER_ORDER in lib/characters.ts)
          while the Mixamo rigs get nailed down, and a grid with a column
          count sized for twelve left two ghost columns of empty,
          full-height stretched boxes next to the two real cards. Flex-wrap
          with a fixed card width sizes to however many characters actually
          exist — 2 today, back up to 12 later — without ever stretching
          cards to fill leftover space. */}
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
          {/* R3F's default camera auto-lookAt(0,0,0) when only `position` is
              given (no explicit rotation) — so rather than fight that by
              guessing a camera tilt, keep the camera level (same y as its
              target: 0) and shift the CHARACTER down in PreviewRig instead,
              so its vertical midpoint lands on the look-at target. */}
          <Canvas camera={{ position: [0, 0, 3.4], fov: 40 }}>
            {/* Generous lighting: unlike the arena scenes (which get natural
                silhouette contrast from a bright floor/fog), this preview is
                a bare black backdrop — several roster characters' outfits
                are dark by design and would otherwise read as nearly
                invisible against it. */}
            <ambientLight intensity={2.2} />
            <directionalLight position={[2, 3, 2.5]} intensity={3} />
            <directionalLight position={[-2, 1.5, 2]} intensity={1.8} />
            <pointLight position={[0, 1.2, 3.5]} intensity={2.5} distance={8} />
            <pointLight position={[0, 1.4, 2]} intensity={1.2} color={preview.colors.emissive} />
            <PreviewRig characterId={preview.id} />
          </Canvas>
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
          className="mt-auto rounded-lg bg-gradient-to-br from-orange-500 to-red-600 py-3 font-[family-name:var(--font-display)] text-xl tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          {storyMode ? "BEGIN STORY" : step === "fighter" ? "NEXT: OPPONENT" : "NEXT: ARENA"}
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
          className="mt-auto rounded-lg bg-gradient-to-br from-orange-500 to-red-600 py-3 font-[family-name:var(--font-display)] text-xl tracking-widest shadow-[0_0_25px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
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

function PreviewRig({ characterId }: { characterId: string }) {
  // Both rigs stand ~1.9-2.0 units tall, feet at y=0 (confirmed via a
  // bounding-box check) — shift down by half that so the body's vertical
  // midpoint sits at world y=0, matching the camera's implicit lookAt
  // target (see the Canvas comment above).
  return (
    <group position={[0, -0.97, 0]}>
      <MixamoFighter characterId={characterId} getFrame={() => IDLE_FRAME} staticPose />
    </group>
  );
}


function rollOpponent(excludeId: string): string {
  const options = ROSTER.filter((c) => c.id !== excludeId);
  return options[Math.floor(Math.random() * options.length)].id;
}
