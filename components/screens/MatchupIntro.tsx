"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import { ARENAS } from "@/lib/arenas";
import { type FighterFrame } from "@/lib/fighterFrame";
import MixamoFighter from "@/components/game/MixamoFighter";
import BossFighter from "@/components/game/BossFighter";
import Arena from "@/components/game/Arena";
import { audio } from "@/lib/audio";

/** Swaps in the boss's own body for boss-model fights — see BossFighter.tsx
 * — otherwise the imported Mixamo rig every roster fighter uses. */
function MatchFighter({ characterId, getFrame }: { characterId: string; getFrame: () => FighterFrame }) {
  const Comp = getCharacter(characterId).useBossModel ? BossFighter : MixamoFighter;
  return <Comp characterId={characterId} getFrame={getFrame} />;
}

const STATIC_FRAME = (x: number, z: number, faceX: number, faceZ: number): FighterFrame => ({
  action: "idle",
  actionTotal: 0,
  actionTimer: 0,
  chargeHeld: 0,
  meter: 0,
  x,
  z,
  faceX,
  faceZ,
  hitToken: 0,
});

/** A brief two-shot cutscene of the two fighters meeting before the round,
 * trading a line each (PRD follow-up: "opening cutscene... they will have
 * dialogue"). Runs once per match, in the chosen arena, then hands off to
 * FightScreen's countdown. */
export default function MatchupIntro({ onDone }: { onDone: () => void }) {
  const playerId = useGameStore((s) => s.playerId);
  const opponentId = useGameStore((s) => s.opponentId);
  const arenaId = useGameStore((s) => s.arenaId);
  const pChar = getCharacter(playerId);
  const oChar = getCharacter(opponentId);
  const arena = ARENAS[arenaId] ?? ARENAS.fire;

  const oLine = useMemo(() => pick(oChar.introLines), [oChar]);
  const pLine = useMemo(() => pick(pChar.introLines), [pChar]);

  const [beat, setBeat] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    audio.playSfx("charge_rumble");
    const t1 = window.setTimeout(() => setBeat(1), 250);
    const t2 = window.setTimeout(() => setBeat(2), 2000);
    const t3 = window.setTimeout(() => setBeat(3), 3750);
    const t4 = window.setTimeout(() => onDone(), 4600);
    return () => [t1, t2, t3, t4].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    audio.playSfx("menu_select");
    onDone();
  };

  return (
    <div className="absolute inset-0 cursor-pointer bg-black" onClick={skip}>
      <Canvas camera={{ position: [0, 1.7, 6.5], fov: 42, near: 0.1, far: 150 }} gl={{ antialias: true }} dpr={[1, 1.75]}>
        <fog attach="fog" args={[arena.fogColor, 6, 40]} />
        <Arena arena={arena} />
        <MatchFighter characterId={playerId} getFrame={() => STATIC_FRAME(-1.9, 0, 1.9, 0)} />
        <MatchFighter characterId={opponentId} getFrame={() => STATIC_FRAME(1.9, 0, -1.9, 0)} />
        <IntroCameraDrift />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />

      {/* VS title beat */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${beat >= 1 ? "opacity-100" : "opacity-0"}`}
      >
        <div className={`flex items-center gap-8 transition-transform duration-700 ${beat >= 1 ? "translate-y-0" : "translate-y-4"}`}>
          <NamePlate name={pChar.name} color={pChar.colors.emissive} align="right" />
          <div className="font-[family-name:var(--font-display)] text-3xl text-white/40">VS</div>
          <NamePlate name={oChar.name} color={oChar.colors.emissive} align="left" />
        </div>
      </div>

      {/* dialogue beats */}
      <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3">
        <DialogueLine visible={beat === 1 || beat === 2} name={oChar.name} line={oLine} color={oChar.colors.emissive} align="left" />
        <DialogueLine visible={beat === 2} name={pChar.name} line={pLine} color={pChar.colors.emissive} align="right" />
      </div>

      <button
        onClick={skip}
        className="absolute bottom-6 right-6 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-white/50 hover:bg-white/10 hover:text-white/80"
      >
        Skip ▸
      </button>
    </div>
  );
}

function NamePlate({ name, color, align }: { name: string; color: string; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="font-[family-name:var(--font-display)] text-4xl tracking-wide text-white drop-shadow-[0_0_16px_rgba(0,0,0,0.8)]" style={{ color }}>
        {name}
      </div>
    </div>
  );
}

function DialogueLine({ visible, name, line, color, align }: { visible: boolean; name: string; line: string; color: string; align: "left" | "right" }) {
  return (
    <div
      className={`max-w-lg px-6 text-center transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"} ${align === "right" ? "self-end" : "self-start"}`}
    >
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">{name}</div>
      <div className="mt-1 text-xl font-semibold italic text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]" style={{ color }}>
        &ldquo;{line}&rdquo;
      </div>
    </div>
  );
}

function IntroCameraDrift() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.12) * 0.6;
    state.camera.position.y = 1.7 + Math.sin(t * 0.2) * 0.05;
    const target = new THREE.Vector3(0, 1.1, 0);
    state.camera.lookAt(target);
  });
  return null;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
