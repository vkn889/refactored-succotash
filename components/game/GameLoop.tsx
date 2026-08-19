"use client";

import { useFrame } from "@react-three/fiber";
import { useGameStore } from "@/lib/store";

/** Drives the combat/match simulation from the render loop (SRD "Game State
 * Manager"). Kept as its own no-render component so it's easy to pause. */
export default function GameLoop() {
  useFrame((_, delta) => {
    useGameStore.getState().tick(Math.min(50, delta * 1000));
  });
  return null;
}
