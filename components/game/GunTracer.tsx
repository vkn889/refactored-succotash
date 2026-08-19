"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";

const POOL_SIZE = 12;
const FADE_MS = 130; // hitscan tracers should read as a snap, not a lingering laser
const MUZZLE_Y = 1.35; // roughly hand height for both fighters

interface Slot {
  born: number;
  active: boolean;
  peakOpacity: number;
}

/** Renders every fired shot (lib/store.ts's `gunShots`) as a fast-fading
 * tracer beam + a brief muzzle flash — hit or miss, so a whiffed shot still
 * visibly goes somewhere instead of just silently doing nothing. Same fixed-
 * pool imperative pattern as DecalSystem.tsx. */
export default function GunTracer() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flashRefs = useRef<(THREE.PointLight | null)[]>([]);
  const slots = useRef<Slot[]>(Array.from({ length: POOL_SIZE }, () => ({ born: 0, active: false, peakOpacity: 0.85 })));
  const nextSlot = useRef(0);
  const lastSeenId = useRef(0);

  useFrame(() => {
    const s = useGameStore.getState();
    const now = performance.now();

    for (const shot of s.gunShots) {
      if (shot.id <= lastSeenId.current) continue;
      lastSeenId.current = shot.id;

      const i = nextSlot.current;
      nextSlot.current = (nextSlot.current + 1) % POOL_SIZE;
      const slot = slots.current[i];
      slot.born = now;
      slot.active = true;
      slot.peakOpacity = shot.hit ? 0.85 : 0.5;

      const mesh = meshRefs.current[i];
      const flash = flashRefs.current[i];
      const color = getCharacter(shot.side === "player" ? s.playerId : s.opponentId).colors.emissive;

      const from = new THREE.Vector3(shot.fromX, MUZZLE_Y, shot.fromZ);
      const to = new THREE.Vector3(shot.toX, MUZZLE_Y, shot.toZ);
      const mid = from.clone().lerp(to, 0.5);
      const len = from.distanceTo(to);

      if (mesh) {
        mesh.position.copy(mid);
        mesh.lookAt(to);
        mesh.rotateX(Math.PI / 2);
        mesh.scale.set(1, Math.max(0.01, len), 1);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(color);
        mat.emissive.set(color);
        mat.opacity = shot.hit ? 0.85 : 0.5;
      }
      if (flash) {
        flash.position.copy(from);
        flash.color.set(color);
      }
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = slots.current[i];
      if (!slot.active) continue;
      const age = now - slot.born;
      const mesh = meshRefs.current[i];
      const flash = flashRefs.current[i];
      const t = Math.max(0, 1 - age / FADE_MS);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = t * slot.peakOpacity;
      }
      if (flash) flash.intensity = t * t * 4;
      if (age > FADE_MS) slot.active = false;
    }
  });

  const pool = Array.from({ length: POOL_SIZE }, (_, i) => i);

  return (
    <group>
      {pool.map((i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              meshRefs.current[i] = el;
            }}
            scale={0}
          >
            <cylinderGeometry args={[0.012, 0.004, 1, 6]} />
            <meshStandardMaterial transparent opacity={0} toneMapped={false} />
          </mesh>
          <pointLight
            ref={(el) => {
              flashRefs.current[i] = el;
            }}
            distance={3}
            intensity={0}
          />
        </group>
      ))}
    </group>
  );
}
