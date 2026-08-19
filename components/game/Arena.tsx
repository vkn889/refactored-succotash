"use client";

import { useMemo } from "react";
import { getToonGradientMap } from "@/lib/toonGradient";
import { ARENA } from "@/lib/combat";
import type { ArenaConfig } from "@/lib/types";
import GradientSky from "./GradientSky";
import Particles from "./Particles";
import DecalSystem from "./DecalSystem";
import Coliseum from "./Coliseum";

interface Prop {
  x: number;
  z: number;
  y: number;
  h: number;
  r: number;
}

const FLOOR_RADIUS = ARENA.radius;
const BOUND = ARENA.radius - ARENA.moveMargin;

function buildProps(layout: ArenaConfig["layout"]): Prop[] {
  const arr: Prop[] = [];
  if (layout === "ring") {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = BOUND - 1.5;
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0, h: 2.2 + Math.random() * 3.2, r: 0.32 + Math.random() * 0.16 });
    }
  } else if (layout === "rows") {
    const rowZ = BOUND - 3;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const z = -rowZ + (i / (n - 1)) * rowZ * 2;
      for (const side of [-1, 1]) {
        arr.push({ x: side * (BOUND - 2.5), z, y: 0, h: 2.6 + Math.random() * 3, r: 0.36 + Math.random() * 0.14 });
      }
    }
  } else if (layout === "scattered") {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * (BOUND - 5);
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0, h: 1.2 + Math.random() * 2.6, r: 0.4 + Math.random() * 0.5 });
    }
  } else {
    // floating: chunks at varying heights, ring-ish arrangement
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = 6 + Math.random() * (BOUND - 7);
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 1 + Math.random() * 5, h: 1 + Math.random() * 1.6, r: 0.5 + Math.random() * 0.7 });
    }
  }
  return arr;
}

/** Procedural per-element arena: floor, skybox, fog, rim lighting, particles,
 * and hit-reactive decals (PRD 6.3, SRD Environment Reactivity System). Each
 * arena also picks a structural `layout` (ring / rows / scattered / floating)
 * so the 12 arenas read as genuinely different maps, not just recolors. */
export default function Arena({ arena }: { arena: ArenaConfig }) {
  const gradientMap = useMemo(() => getToonGradientMap(), []);
  const props = useMemo(() => buildProps(arena.layout), [arena.layout]);

  return (
    <group>
      {/* NOTE: <fog attach="fog"> here would attach to this group, not the
       * scene (R3F resolves `attach` to its nearest JSX parent) — the actual
       * scene fog is set from GameCanvas, directly under <Canvas>. */}
      <GradientSky top={arena.skyTop} bottom={arena.skyBottom} />

      <ambientLight intensity={0.9} color={arena.rimLight} />
      <directionalLight position={[10, 16, 6]} intensity={1.6} color="#ffffff" castShadow />
      <pointLight position={[0, 2.2, -0.5]} intensity={1.3} color={arena.rimLight} distance={10} />
      <pointLight position={[0, 3, 0]} intensity={0.9} color={arena.floorEmissive} distance={12} />
      <hemisphereLight args={[arena.skyTop, arena.floorColor, 0.75]} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[FLOOR_RADIUS, 64]} />
        <meshToonMaterial color={arena.floorColor} gradientMap={gradientMap} />
      </mesh>
      {/* center starting mark */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[3.4, 3.55, 64]} />
        <meshStandardMaterial color={arena.floorEmissive} emissive={arena.floorEmissive} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* glowing boundary ring, marks the edge of the playable floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[BOUND - 0.08, BOUND + 0.08, 96]} />
        <meshStandardMaterial color={arena.rimLight} emissive={arena.rimLight} emissiveIntensity={0.9} toneMapped={false} transparent opacity={0.7} />
      </mesh>

      {/* structural props (per-arena layout) for silhouette/depth */}
      {props.map((p, i) => (
        <mesh key={i} position={[p.x, p.y + p.h / 2, p.z]} castShadow>
          {arena.layout === "scattered" ? (
            <dodecahedronGeometry args={[p.r, 0]} />
          ) : arena.layout === "floating" ? (
            <icosahedronGeometry args={[p.r, 0]} />
          ) : (
            <cylinderGeometry args={[p.r, p.r * 1.2, p.h, 6]} />
          )}
          <meshToonMaterial color={arena.floorColor} gradientMap={gradientMap} />
        </mesh>
      ))}

      <Particles type={arena.particle} spread={FLOOR_RADIUS * 0.9} color={arena.floorEmissive} />
      <DecalSystem arenaEmissive={arena.floorEmissive} />
      <Coliseum era={arena.era} innerRadius={FLOOR_RADIUS} floorColor={arena.floorColor} emissive={arena.floorEmissive} rimLight={arena.rimLight} />
    </group>
  );
}
