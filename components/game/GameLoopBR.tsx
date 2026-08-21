"use client";

import { useEffect } from "react";
import { useBRStore } from "@/lib/storeBR";

/** Drives the Battle Royale store's tick every animation frame — host
 * only, same discipline as GameLoop2D/lib/online.ts: every other
 * connected client's store is a pure mirror of the host's broadcasts and
 * never runs its own simulation. */
export default function GameLoopBR() {
  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      useBRStore.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
