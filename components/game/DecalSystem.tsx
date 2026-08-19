"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";

const POOL_SIZE = 24;
const FADE_MS = 4000;

interface Slot {
  born: number;
  active: boolean;
}

/** Environment reactivity: scorch/frost/crack decals + a light flash tied to
 * hit/special events (PRD 6.3, SRD "Environment Reactivity System"). Runs
 * entirely off a fixed mesh pool driven by useFrame (no React state), the
 * same imperative pattern as the rest of components/game — avoids spawning
 * a growing list of meshes and keeps this in sync with the render loop. */
export default function DecalSystem({ arenaEmissive }: { arenaEmissive: string }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const slots = useRef<Slot[]>(Array.from({ length: POOL_SIZE }, () => ({ born: 0, active: false })));
  const nextSlot = useRef(0);
  const lastSeenId = useRef(0);
  const flashLight = useRef<THREE.PointLight>(null);
  const flashUntil = useRef(0);

  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, (_, i) => i), []);

  useFrame(() => {
    const s = useGameStore.getState();
    const now = performance.now();

    for (const e of s.hitEvents) {
      if (e.id <= lastSeenId.current) continue;
      lastSeenId.current = e.id;
      if (e.kind === "block") continue;

      const i = nextSlot.current;
      nextSlot.current = (nextSlot.current + 1) % POOL_SIZE;
      const slot = slots.current[i];
      slot.born = now;
      slot.active = true;

      const mesh = meshRefs.current[i];
      if (mesh) {
        const attackerId = e.side === "player" ? s.playerId : s.opponentId;
        const color = getCharacter(attackerId).colors.emissive;
        const midX = (s.playerPos.x + s.opponentPos.x) / 2;
        const midZ = (s.playerPos.z + s.opponentPos.z) / 2;
        mesh.position.set(midX + (Math.random() - 0.5) * 0.7, 0.015, midZ + (Math.random() - 0.5) * 0.7);
        const scale = e.kind === "special" ? 1.6 : e.kind === "heavy" ? 1.1 : 0.7;
        mesh.scale.setScalar(scale);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(color);
        mat.emissive.set(color);
        mat.opacity = 0.6;
      }
      if (e.kind === "special") flashUntil.current = now + 220;
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = slots.current[i];
      if (!slot.active) continue;
      const age = now - slot.born;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const opacity = Math.max(0, 0.6 * (1 - age / FADE_MS));
      mat.opacity = opacity;
      if (age > FADE_MS) slot.active = false;
    }

    if (flashLight.current) {
      const active = now < flashUntil.current;
      flashLight.current.intensity = THREE.MathUtils.lerp(flashLight.current.intensity, active ? 6 : 0, 0.3);
      flashLight.current.position.set((s.playerPos.x + s.opponentPos.x) / 2, 1.6, (s.playerPos.z + s.opponentPos.z) / 2);
    }
  });

  return (
    <group>
      <pointLight ref={flashLight} distance={6} color={arenaEmissive} intensity={0} />
      {pool.map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          position={[0, 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0}
        >
          <ringGeometry args={[0.02, 0.35, 20]} />
          <meshStandardMaterial
            color={arenaEmissive}
            emissive={arenaEmissive}
            emissiveIntensity={0.8}
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
