"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import { ARENAS } from "@/lib/arenas";
import { inputState } from "@/lib/inputState";
import Arena from "./Arena";
import MixamoFighter from "./MixamoFighter";
import BossFighter from "./BossFighter";
import PlayerInput from "./PlayerInput";
import CameraRig from "./CameraRig";
import GameLoop from "./GameLoop";
import PostFX from "./PostFX";
import LootField from "./LootField";
import ElementalVFX from "./ElementalVFX";
import GunTracer from "./GunTracer";
import AimAssist from "./AimAssist";

export default function GameCanvas() {
  const arenaId = useGameStore((s) => s.arenaId);
  const opponentId = useGameStore((s) => s.opponentId);
  const playerId = useGameStore((s) => s.playerId);
  const arena = ARENAS[arenaId] ?? ARENAS.fire;
  const OpponentComponent = getCharacter(opponentId).useBossModel ? BossFighter : MixamoFighter;

  return (
    <Canvas
      shadows="percentage"
      // R3F's canvas wrapper sizes to 100%/100% of its parent — inside a
      // flex column (main > FightScreen div), that percentage chain doesn't
      // always resolve to a definite height, so pin it with inset instead.
      style={{ position: "absolute", inset: 0 }}
      camera={{ position: [0, 1.6, 3.5], fov: 62, near: 0.1, far: 150 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
    >
      <Suspense fallback={null}>
        <fog attach="fog" args={[arena.fogColor, 6, 60]} />
        <Arena arena={arena} />
        <OpponentComponent
          characterId={opponentId}
          getFrame={() => {
            const s = useGameStore.getState();
            const f = s.opponent;
            return {
              action: f.action,
              actionTotal: f.actionTotal,
              actionTimer: f.actionTimer,
              chargeHeld: f.chargeHeld,
              meter: f.meter,
              x: s.opponentPos.x,
              z: s.opponentPos.z,
              faceX: s.playerPos.x,
              faceZ: s.playerPos.z,
              hitToken: f.hitToken,
            };
          }}
        />
        {/* Third-person: the player's own body, aiming wherever the camera
            (mouse yaw) is actually looking rather than always facing the
            opponent — see CameraRig for the matching over-the-shoulder
            camera placement. */}
        <MixamoFighter
          characterId={playerId}
          getFrame={() => {
            const s = useGameStore.getState();
            const f = s.player;
            const yaw = inputState.yaw;
            const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
            return {
              action: f.action,
              actionTotal: f.actionTotal,
              actionTimer: f.actionTimer,
              chargeHeld: f.chargeHeld,
              meter: f.meter,
              x: s.playerPos.x,
              z: s.playerPos.z,
              faceX: s.playerPos.x + forward.x * 5,
              faceZ: s.playerPos.z + forward.z * 5,
              hitToken: f.hitToken,
              y: s.playerY,
            };
          }}
        />
        <PlayerInput />
        <CameraRig />
        <AimAssist />
        <GameLoop />
        <LootField />
        <ElementalVFX />
        <GunTracer />
        <PostFX />
      </Suspense>
    </Canvas>
  );
}
