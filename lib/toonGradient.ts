"use client";

import * as THREE from "three";

// A tiny stepped gradient ramp so MeshToonMaterial reads as cel-shaded
// (anime-style hard shadow bands) instead of three.js's default 2-step ramp.
let cached: THREE.DataTexture | null = null;

export function getToonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  const steps = new Uint8Array([95, 150, 200, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  cached = tex;
  return tex;
}
