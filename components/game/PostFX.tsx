"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import type { ChromaticAberrationEffect, VignetteEffect } from "postprocessing";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";

/** Bloom for elemental emissive glow (always on) + a dynamic chromatic
 * aberration/vignette pulse during charge-up and special release — the
 * "intensified elemental screen effects" called for in PRD 6.1.1. */
export default function PostFX() {
  const caRef = useRef<ChromaticAberrationEffect>(null);
  const vigRef = useRef<VignetteEffect>(null);
  const offset = useRef(new THREE.Vector2(0, 0));

  useFrame(() => {
    const s = useGameStore.getState();
    const charging = s.player.action === "charge";
    const special = s.player.action === "special" || s.opponent.action === "special";
    const chargeP = charging ? Math.min(1, s.player.chargeHeld / 2200) : 0;
    const intensity = charging ? chargeP * 0.006 : special ? 0.01 : 0.0015;

    if (caRef.current) {
      offset.current.set(intensity, intensity * 0.6);
      caRef.current.offset = offset.current;
    }
    if (vigRef.current) {
      vigRef.current.darkness = 0.5 + (charging ? chargeP * 0.3 : 0) + (special ? 0.25 : 0);
    }
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.3} />
      <ChromaticAberration ref={caRef} offset={new THREE.Vector2(0, 0)} />
      <Vignette ref={vigRef} eskil={false} offset={0.25} darkness={0.5} />
    </EffectComposer>
  );
}
