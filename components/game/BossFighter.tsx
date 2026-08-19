"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getCharacter } from "@/lib/combat";
import type { FighterFrame } from "@/lib/fighterFrame";

interface BossFighterProps {
  characterId: string;
  getFrame: () => FighterFrame;
  staticPose?: boolean;
}

const damp = (current: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

const SHARD_COUNT = 9;
const SHARD_COLORS = [
  "#ff7a1a", "#7fe3ff", "#b98bff", "#ffb454", "#ff4fd8",
  "#b5ff6a", "#43f5ff", "#d9d9e8", "#baffe0", "#f5e642", "#e6e6f0", "#b98bff",
];

/** The true final boss's body — deliberately NOT the standard humanoid rig
 * (PRD follow-up: "bosses have a completely different character design").
 * Overmog isn't one of the twelve, so it doesn't get legs, a face, or a
 * single element color: it hovers on a rotating base of light, its "head"
 * is a fractured crystal instead of a face, and a ring of shards — one
 * per fighter's color — orbits it, restlessly cycling instead of settling
 * into any one identity. Same external contract as Fighter (characterId /
 * getFrame / staticPose) so it drops straight into the existing combat,
 * cutscene, and camera pipeline. */
export default function BossFighter({ characterId, getFrame, staticPose = false }: BossFighterProps) {
  const character = getCharacter(characterId);
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Group>(null);
  const baseRing = useRef<THREE.Mesh>(null);
  const knockback = useRef(new THREE.Vector3());
  const lastHitToken = useRef(-1);
  const initialized = useRef(false);
  const hoverPhase = useRef(Math.random() * Math.PI * 2);

  const shards = useMemo(
    () =>
      Array.from({ length: SHARD_COUNT }, (_, i) => ({
        angle: (i / SHARD_COUNT) * Math.PI * 2,
        radius: 0.75 + (i % 3) * 0.12,
        height: -0.1 + ((i % 4) - 1.5) * 0.18,
        speed: 0.4 + (i % 5) * 0.08,
        scale: 0.09 + (i % 3) * 0.03,
        color: SHARD_COLORS[i % SHARD_COLORS.length],
      })),
    []
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const t = state.clock.elapsedTime;
    const f = getFrame();
    hoverPhase.current += dt;

    const hover = Math.sin(hoverPhase.current * 1.1) * 0.12;
    const chargeP = f.action === "charge" ? Math.min(1, f.chargeHeld / 2200) : 0;
    const activeSurge = f.action === "special" ? 1 : chargeP;

    if (core.current) {
      core.current.rotation.y += dt * (0.3 + activeSurge * 2);
      core.current.rotation.x = Math.sin(t * 0.5) * 0.15;
      const pulse = 1 + Math.sin(t * 3) * 0.03 + activeSurge * 0.25;
      core.current.scale.setScalar(pulse);
      const mat = core.current.material as THREE.MeshStandardMaterial;
      const hue = (t * 0.05) % 1;
      mat.emissive.setHSL(hue, 0.8, 0.55);
      mat.emissiveIntensity = 1.4 + activeSurge * 2.5;
    }
    if (ring.current) ring.current.rotation.y += dt * (0.5 + activeSurge * 1.5);
    if (baseRing.current) {
      baseRing.current.rotation.z += dt * (1.2 + activeSurge * 3);
      const mat = baseRing.current.material as THREE.MeshStandardMaterial;
      const hue = (0.5 - t * 0.05) % 1;
      mat.emissive.setHSL(((hue % 1) + 1) % 1, 0.8, 0.5);
    }

    if (f.hitToken !== lastHitToken.current) {
      const isFirstFrame = lastHitToken.current === -1;
      lastHitToken.current = f.hitToken;
      if (!isFirstFrame && f.hitToken > 0) {
        const kdx = f.x - f.faceX;
        const kdz = f.z - f.faceZ;
        const d = Math.hypot(kdx, kdz) || 1;
        knockback.current.set((kdx / d) * 0.2, 0, (kdz / d) * 0.2);
      }
    }
    knockback.current.multiplyScalar(Math.exp(-dt * 8));

    if (group.current) {
      if (!initialized.current && !staticPose) {
        group.current.position.set(f.x, 0, f.z);
        initialized.current = true;
      }
      if (staticPose) {
        group.current.rotation.y += dt * 0.3;
      } else {
        const targetX = f.x + knockback.current.x;
        const targetZ = f.z + knockback.current.z;
        group.current.position.x = damp(group.current.position.x, targetX, 18, dt);
        group.current.position.z = damp(group.current.position.z, targetZ, 18, dt);
        group.current.position.y = 1.05 + hover;
        const fdx = f.faceX - f.x;
        const fdz = f.faceZ - f.z;
        if (Math.hypot(fdx, fdz) > 0.01) {
          const targetYaw = Math.atan2(fdx, fdz);
          group.current.rotation.y = dampAngle(group.current.rotation.y, targetYaw, 6, dt);
        }
      }
    }
  });

  return (
    <group ref={group} position={[0, 1.05, 0]}>
      {/* fractured crystal core — no face, no eyes: this isn't a person */}
      <mesh ref={core} castShadow>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#0a0714" emissive={character.colors.emissive} emissiveIntensity={1.4} roughness={0.25} metalness={0.4} />
      </mesh>

      {/* torso: a dark elongated shell beneath the core, cracked with light */}
      <mesh position={[0, -0.75, 0]} castShadow>
        <coneGeometry args={[0.5, 1.3, 6]} />
        <meshStandardMaterial color="#0a0714" roughness={0.4} metalness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, -0.5 - i * 0.16, 0]} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <boxGeometry args={[0.03, 0.14, 0.52]} />
          <meshStandardMaterial color={character.colors.emissive} emissive={character.colors.emissive} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      ))}

      {/* orbiting shard ring — every fighter's color, fused, none dominant */}
      <group ref={ring}>
        {shards.map((s, i) => (
          <Shard key={i} {...s} />
        ))}
      </group>

      {/* rotating base of light where legs would be — it hovers, it doesn't stand */}
      <mesh ref={baseRing} position={[0, -1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.04, 8, 24]} />
        <meshStandardMaterial color="#0a0714" emissive={character.colors.emissive} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Shard({ angle, radius, height, speed, scale, color }: { angle: number; radius: number; height: number; speed: number; scale: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed + angle;
    ref.current.position.set(Math.cos(t) * radius, height + Math.sin(t * 1.7) * 0.08, Math.sin(t) * radius);
    ref.current.rotation.x += 0.02;
    ref.current.rotation.y += 0.03;
  });
  return (
    <mesh ref={ref} scale={scale} castShadow>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} toneMapped={false} />
    </mesh>
  );
}
