"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

/** Drives the match store's fixed-ish tick every animation frame — the 2D
 * equivalent of the old R3F useFrame-driven GameLoop, just a plain rAF loop
 * now that there's no three.js render loop to piggyback on. */
export default function GameLoop2D() {
  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      useGameStore.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
