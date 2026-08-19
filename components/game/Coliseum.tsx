"use client";

import { useMemo } from "react";
import { getToonGradientMap } from "@/lib/toonGradient";
import type { ArenaEra } from "@/lib/types";
import Crowd from "./Crowd";

const CROWD_PALETTE: Record<ArenaEra, string[]> = {
  ancient: ["#c9a870", "#a8532e", "#7d8a5a", "#8a7d63", "#b5734a"],
  medieval: ["#4a3826", "#5c1c1c", "#39291b", "#6b5a3d", "#2e4a3a"],
  futuristic: ["#1fd6e8", "#e81fb0", "#e8e8f0", "#7a5cff", "#1fe89a"],
  primordial: ["#8a6a4a", "#6a5a3a", "#a8825a", "#5a4a35"],
};

interface ColiseumProps {
  era: ArenaEra;
  innerRadius: number;
  floorColor: string;
  emissive: string;
  rimLight: string;
}

function ring(count: number, radius: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, rotY: -a + Math.PI / 2 };
  });
}

/** A coliseum-style structure surrounding every arena, styled by the arena's
 * historical era (PRD follow-up: "coliseum surrounding it" + "different
 * eras of time"), populated with an actual spectator crowd (follow-up:
 * "an audience outside of each arena like its an actual colosseum") —
 * purely a backdrop, sits well outside the movable floor. */
export default function Coliseum({ era, innerRadius, floorColor, emissive, rimLight }: ColiseumProps) {
  const gradientMap = useMemo(() => getToonGradientMap(), []);
  const r0 = innerRadius + 3;
  const r1 = innerRadius + 7;
  const r2 = innerRadius + 11;

  const tier0 = useMemo(() => ring(28, r0), [r0]);
  const tier1 = useMemo(() => ring(22, r1), [r1]);
  const tier2 = useMemo(() => ring(16, r2), [r2]);

  if (era === "ancient") {
    return (
      <group>
        {/* pillar colonnade */}
        {tier0.map((p, i) => (
          <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
            <mesh position={[0, 2.2, 0]} castShadow>
              <cylinderGeometry args={[0.4, 0.45, 4.4, 10]} />
              <meshToonMaterial color="#8a7d63" gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, 4.5, 0]}>
              <boxGeometry args={[1.1, 0.35, 1.1]} />
              <meshToonMaterial color="#6f6350" gradientMap={gradientMap} />
            </mesh>
          </group>
        ))}
        {/* stepped seating tiers */}
        {tier1.map((p, i) => (
          <mesh key={i} position={[p.x, 2.6, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <boxGeometry args={[2.6, 5.2, 2]} />
            <meshToonMaterial color="#c9a870" gradientMap={gradientMap} />
          </mesh>
        ))}
        {tier2.map((p, i) => (
          <mesh key={i} position={[p.x, 5.5, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.35, 6, 8]} />
            <meshToonMaterial color="#7a6d55" gradientMap={gradientMap} />
          </mesh>
        ))}
        <Crowd radius={r0 - 1.3} y={1.4} count={80} palette={CROWD_PALETTE.ancient} />
        <Crowd radius={r1 + 0.4} y={4} count={90} palette={CROWD_PALETTE.ancient} />
      </group>
    );
  }

  if (era === "medieval") {
    return (
      <group>
        {tier0.map((p, i) => (
          <mesh key={i} position={[p.x, 1.6, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <boxGeometry args={[1.8, 3.2, 1.6]} />
            <meshToonMaterial color="#4a3826" gradientMap={gradientMap} />
          </mesh>
        ))}
        {tier1.map((p, i) => (
          <mesh key={i} position={[p.x, 3.8, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.65, 7.6, 8]} />
            <meshToonMaterial color="#39291b" gradientMap={gradientMap} />
          </mesh>
        ))}
        {/* watchtowers with banners */}
        {tier2
          .filter((_, i) => i % 3 === 0)
          .map((p, i) => (
            <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
              <mesh position={[0, 4, 0]} castShadow>
                <cylinderGeometry args={[0.9, 1.1, 8, 8]} />
                <meshToonMaterial color="#2e2216" gradientMap={gradientMap} />
              </mesh>
              <mesh position={[0, 8.6, 0]} castShadow>
                <coneGeometry args={[1.3, 1.8, 8]} />
                <meshToonMaterial color="#5c1c1c" gradientMap={gradientMap} />
              </mesh>
              <mesh position={[0.9, 6.5, 0]}>
                <planeGeometry args={[0.9, 1.3]} />
                <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={0.8} side={2} toneMapped={false} />
              </mesh>
            </group>
          ))}
        <Crowd radius={r0 - 1} y={3.3} count={70} palette={CROWD_PALETTE.medieval} />
      </group>
    );
  }

  if (era === "futuristic") {
    return (
      <group>
        {tier0.map((p, i) => (
          <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
            <mesh position={[0, 2.8, 0]} castShadow>
              <boxGeometry args={[1.4, 5.6, 0.5]} />
              <meshToonMaterial color="#12141a" gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, 2.8, 0.26]}>
              <boxGeometry args={[0.08, 5.2, 0.02]} />
              <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={1.8} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {tier1.map((p, i) => (
          <mesh key={i} position={[p.x, 6, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <boxGeometry args={[2.4, 0.5, 2]} />
            <meshStandardMaterial color={rimLight} emissive={rimLight} emissiveIntensity={0.5} />
          </mesh>
        ))}
        {tier2.map((p, i) => (
          <mesh key={i} position={[p.x, 9, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 9, 6]} />
            <meshToonMaterial color="#0a0c10" gradientMap={gradientMap} />
          </mesh>
        ))}
        <Crowd radius={r0 - 1.2} y={1} count={90} palette={CROWD_PALETTE.futuristic} />
        <Crowd radius={r1 - 0.5} y={6.3} count={70} palette={CROWD_PALETTE.futuristic} />
      </group>
    );
  }

  // primordial: irregular natural amphitheater of stacked boulders
  return (
    <group>
      {tier0.map((p, i) => (
        <mesh key={i} position={[p.x, 1.2 + (i % 3) * 0.4, p.z]} rotation={[0.2, p.rotY, 0.15]} castShadow>
          <dodecahedronGeometry args={[1.3 + (i % 4) * 0.2, 0]} />
          <meshToonMaterial color={floorColor} gradientMap={gradientMap} />
        </mesh>
      ))}
      {tier1.map((p, i) => (
        <mesh key={i} position={[p.x, 2.8 + (i % 2) * 0.6, p.z]} rotation={[0.1, p.rotY, -0.1]} castShadow>
          <dodecahedronGeometry args={[1.8 + (i % 3) * 0.3, 0]} />
          <meshToonMaterial color={floorColor} gradientMap={gradientMap} />
        </mesh>
      ))}
      {tier2.map((p, i) => (
        <mesh key={i} position={[p.x, 4.5, p.z]} rotation={[0, p.rotY, 0]} castShadow>
          <coneGeometry args={[1, 5 + (i % 3), 5]} />
          <meshToonMaterial color={floorColor} gradientMap={gradientMap} />
        </mesh>
      ))}
      {/* sparser than the built eras — figures perched on the boulders */}
      <Crowd radius={r0 - 0.6} y={1.6} count={45} palette={CROWD_PALETTE.primordial} />
      <Crowd radius={r1 - 0.6} y={3.2} count={40} palette={CROWD_PALETTE.primordial} />
    </group>
  );
}
