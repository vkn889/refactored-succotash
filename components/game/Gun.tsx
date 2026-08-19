"use client";

import { useMemo } from "react";
import { getToonGradientMap } from "@/lib/toonGradient";

interface GunProps {
  primary: string;
  secondary: string;
  emissive: string;
}

/** A small procedural blaster every character holds in their right hand
 * (PRD follow-up: "give each player a gun") — neither imported rig/animation
 * pack includes an actual weapon mesh (the "rifle" clips just pose empty
 * hands as if holding one), so this is what fills them. Low-poly to match
 * the game's existing toon-shaded style regardless of which body it's
 * attached to. */
export default function Gun({ primary, secondary, emissive }: GunProps) {
  const gradientMap = useMemo(() => getToonGradientMap(), []);
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* body/slide */}
      <mesh position={[0, 0, 0.06]} castShadow>
        <boxGeometry args={[0.045, 0.05, 0.16]} />
        <meshToonMaterial color={primary} gradientMap={gradientMap} />
      </mesh>
      {/* barrel accent */}
      <mesh position={[0, 0.012, 0.15]} castShadow>
        <boxGeometry args={[0.03, 0.03, 0.05]} />
        <meshToonMaterial color={secondary} gradientMap={gradientMap} />
      </mesh>
      {/* grip */}
      <mesh position={[0, -0.06, -0.02]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.04, 0.11, 0.045]} />
        <meshToonMaterial color={secondary} gradientMap={gradientMap} />
      </mesh>
      {/* trigger guard */}
      <mesh position={[0, -0.015, 0.02]}>
        <torusGeometry args={[0.018, 0.006, 6, 10, Math.PI]} />
        <meshToonMaterial color={primary} gradientMap={gradientMap} />
      </mesh>
      {/* energy cell / muzzle glow */}
      <mesh position={[0, 0, 0.185]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.01, 8]} />
        <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.012, 0.06]}>
        <boxGeometry args={[0.008, 0.015, 0.1]} />
        <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}
