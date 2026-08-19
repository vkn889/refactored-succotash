"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";

/** Ground pickups (PRD follow-up: "loot on the ground... heal the person or
 * change the stadium"). Purely visual here — spawn/pickup logic lives in
 * lib/store.ts's runLoot(); this just renders whatever's currently active. */
export default function LootField() {
  const lootItems = useGameStore((s) => s.lootItems);

  return (
    <group>
      {lootItems.map((item) => (
        <LootPickup key={item.id} kind={item.kind} x={item.x} z={item.z} />
      ))}
    </group>
  );
}

function LootPickup({ kind, x, z }: { kind: "heal" | "stadium"; x: number; z: number }) {
  const ref = useRef<THREE.Group>(null);
  const color = kind === "heal" ? "#5dffa0" : "#ffd24a";

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = 0.55 + Math.sin(t * 2) * 0.08;
    ref.current.rotation.y = t * 1.4;
  });

  return (
    <group position={[x, 0, z]}>
      <pointLight color={color} intensity={1.2} distance={4} position={[0, 0.6, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.35, 0.5, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <group ref={ref}>
        {kind === "heal" ? (
          <group>
            <mesh castShadow>
              <icosahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.28, 0.07, 0.07]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1} toneMapped={false} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.07, 0.28, 0.07]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1} toneMapped={false} />
            </mesh>
          </group>
        ) : (
          <group>
            <mesh castShadow>
              <torusKnotGeometry args={[0.16, 0.05, 64, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}
