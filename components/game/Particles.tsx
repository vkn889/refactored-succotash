"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ArenaConfig } from "@/lib/types";

interface ParticlesProps {
  type: ArenaConfig["particle"];
  color: string;
  count?: number;
  /** Override the default per-type spread radius — pass the arena's actual
   * floor size so atmosphere fills the whole (now much larger) space. */
  spread?: number;
  height?: number;
}

const BEHAVIOR: Record<ArenaConfig["particle"], { rise: number; drift: number; size: number; spread: number }> = {
  embers: { rise: 0.55, drift: 0.15, size: 0.06, spread: 6 },
  snow: { rise: -0.18, drift: 0.25, size: 0.05, spread: 7 },
  sparks: { rise: 0.3, drift: 0.5, size: 0.035, spread: 5 },
  dust: { rise: 0.05, drift: 0.08, size: 0.04, spread: 7 },
  petals: { rise: -0.12, drift: 0.3, size: 0.07, spread: 6 },
  leaves: { rise: -0.2, drift: 0.4, size: 0.08, spread: 8 },
  ash: { rise: -0.1, drift: 0.12, size: 0.045, spread: 7 },
  motes: { rise: 0.08, drift: 0.1, size: 0.035, spread: 6 },
};

/** Lightweight instanced-point particle field for arena atmosphere (SRD 3.2). */
export default function Particles({ type, color, count = 420, spread, height = 7 }: ParticlesProps) {
  const behavior = BEHAVIOR[type];
  const effectiveSpread = spread ?? behavior.spread;
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * effectiveSpread;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * effectiveSpread;
      seeds[i] = Math.random() * 100;
    }
    return { positions, seeds };
  }, [count, effectiveSpread, height]);

  useFrame((state, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    const arr = points.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx + 1] += behavior.rise * delta;
      arr[idx] += Math.sin(t * 0.5 + seeds[i]) * behavior.drift * delta;
      arr[idx + 2] += Math.cos(t * 0.4 + seeds[i]) * behavior.drift * delta;
      if (arr[idx + 1] > height) arr[idx + 1] = 0;
      if (arr[idx + 1] < 0) arr[idx + 1] = height;
    }
    points.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={behavior.size}
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
