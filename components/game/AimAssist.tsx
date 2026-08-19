"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameStore } from "@/lib/store";
import { inputState } from "@/lib/inputState";
import { GUN } from "@/lib/combat";

/** Drives `aimAssist` in the store: true exactly when the reticle is close
 * enough to the opponent that firing right now would land — same cone
 * (GUN.aimConeRad) resolveShot checks, so "reticle red" and "this shot
 * hits" are never out of sync. Lives outside the fixed-tick loop (needs
 * per-render-frame camera yaw from inputState, not the store's own tick
 * cadence), and only calls setState when the boolean actually flips, so it
 * doesn't spam re-renders on every frame. */
export default function AimAssist() {
  const wasAssisted = useRef(false);

  useFrame(() => {
    const s = useGameStore.getState();
    if (s.phase !== "fight" || s.opponent.action === "ko") {
      if (wasAssisted.current) {
        wasAssisted.current = false;
        useGameStore.setState({ aimAssist: false });
      }
      return;
    }

    const dx = s.opponentPos.x - s.playerPos.x;
    const dz = s.opponentPos.z - s.playerPos.z;
    const distance = Math.hypot(dx, dz);

    let assisted = false;
    if (distance <= GUN.range) {
      const toTargetYaw = Math.atan2(-dx, -dz);
      let diff = toTargetYaw - inputState.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      assisted = Math.abs(diff) <= GUN.aimConeRad;
    }

    if (assisted !== wasAssisted.current) {
      wasAssisted.current = assisted;
      useGameStore.setState({ aimAssist: assisted });
    }
  });

  return null;
}
