"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { getCharacter } from "@/lib/combat";
import type { ElementId } from "@/lib/types";

// Every element gets its own motion signature (not just a color) so hits
// read as genuinely different moves rather than one generic spark reskinned
// twelve times (PRD follow-up: "more unique moves based on the element").
const ELEMENT_STYLE: Record<ElementId, { gravity: number; spread: number; jitter: number; fadeMs: number; rise: number }> = {
  fire: { gravity: -1.2, spread: 2.4, jitter: 0.3, fadeMs: 620, rise: 1.4 },
  ice: { gravity: 3.2, spread: 1.7, jitter: 0.05, fadeMs: 720, rise: 0.2 },
  electric: { gravity: 0, spread: 3.6, jitter: 1.6, fadeMs: 320, rise: 0.4 },
  kinetic: { gravity: 1.8, spread: 3, jitter: 0.1, fadeMs: 420, rise: 0.3 },
  speed: { gravity: 0, spread: 4.2, jitter: 0.2, fadeMs: 300, rise: 0.1 },
  earth: { gravity: 4, spread: 1.5, jitter: 0.1, fadeMs: 800, rise: 0.1 },
  tech: { gravity: 0, spread: 2.6, jitter: 0.9, fadeMs: 460, rise: 0.5 },
  shift: { gravity: 0, spread: 2, jitter: 0.4, fadeMs: 560, rise: 0.4 },
  steel: { gravity: 2, spread: 2.9, jitter: 0.15, fadeMs: 400, rise: 0.2 },
  wind: { gravity: -0.6, spread: 3.4, jitter: 0.6, fadeMs: 620, rise: 1 },
  lightning: { gravity: 0, spread: 4.4, jitter: 2.1, fadeMs: 300, rise: 0.5 },
  void: { gravity: 0, spread: 1.5, jitter: 0.2, fadeMs: 900, rise: 0.6 },
  prism: { gravity: 0, spread: 5, jitter: 2.6, fadeMs: 950, rise: 0.8 },
};

const POOL_SIZE = 48;
const FRAGMENTS_PER_HIT = 6;

interface Frag {
  active: boolean;
  born: number;
  fadeMs: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  jitter: number;
  color: THREE.Color;
}

/** Elemental impact bursts — a small directional shard explosion styled per
 * the ATTACKER's element, spawned at the defender's position on every
 * landed (non-blocked) hit. Same fixed-pool imperative pattern as
 * DecalSystem: no React state, no per-hit mesh creation. */
export default function ElementalVFX() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const frags = useRef<Frag[]>(
    Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      born: 0,
      fadeMs: 500,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      jitter: 0,
      color: new THREE.Color("#ffffff"),
    }))
  );
  const nextSlot = useRef(0);
  const lastSeenId = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const s = useGameStore.getState();
    const now = performance.now();

    for (const e of s.hitEvents) {
      if (e.id <= lastSeenId.current) continue;
      lastSeenId.current = e.id;
      if (e.kind === "block") continue;

      const attackerId = e.side === "player" ? s.playerId : s.opponentId;
      const defenderPos = e.side === "player" ? s.opponentPos : s.playerPos;
      const attackerChar = getCharacter(attackerId);
      const style = ELEMENT_STYLE[attackerChar.element];
      const power = e.kind === "special" ? 1.7 : e.kind === "heavy" ? 1.25 : 0.9;

      for (let i = 0; i < FRAGMENTS_PER_HIT; i++) {
        const idx = nextSlot.current;
        nextSlot.current = (nextSlot.current + 1) % POOL_SIZE;
        const frag = frags.current[idx];
        const mesh = meshRefs.current[idx];
        if (!mesh) continue;

        const angle = Math.random() * Math.PI * 2;
        const upward = style.rise + Math.random() * style.rise;
        frag.active = true;
        frag.born = now;
        frag.fadeMs = style.fadeMs;
        frag.vx = Math.cos(angle) * style.spread * power;
        frag.vz = Math.sin(angle) * style.spread * power;
        frag.vy = upward * power;
        frag.gravity = style.gravity;
        frag.jitter = style.jitter;
        frag.color.set(attackerChar.colors.emissive);

        mesh.position.set(defenderPos.x, 1.1 + Math.random() * 0.3, defenderPos.z);
        mesh.scale.setScalar(0.05 + Math.random() * 0.04 * power);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(frag.color);
        mat.emissive.copy(frag.color);
        mat.opacity = 1;
      }
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const frag = frags.current[i];
      if (!frag.active) continue;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const age = now - frag.born;
      if (age > frag.fadeMs) {
        frag.active = false;
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0;
        continue;
      }
      frag.vy -= frag.gravity * dt;
      mesh.position.x += (frag.vx + (Math.random() - 0.5) * frag.jitter) * dt;
      mesh.position.y += frag.vy * dt;
      mesh.position.z += (frag.vz + (Math.random() - 0.5) * frag.jitter) * dt;
      mesh.rotation.x += dt * 6;
      mesh.rotation.y += dt * 5;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 1 - age / frag.fadeMs);
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          scale={0}
        >
          <tetrahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
