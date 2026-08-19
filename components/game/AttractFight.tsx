"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AttractSim } from "@/lib/attractSim";
import { ARENAS } from "@/lib/arenas";
import Arena from "./Arena";
import MixamoFighter from "./MixamoFighter";

/** The home screen's live "attract mode" — Gautham vs Garv looping forever
 * in Gautham's arena, shot with a slow cinematic orbit instead of the
 * first-person gameplay camera. Runs its own tiny AI-vs-AI sim
 * (lib/attractSim.ts), completely decoupled from the real match store. */
export default function AttractFight() {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      camera={{ position: [4, 2.4, 6], fov: 50, near: 0.1, far: 150 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
    >
      <Scene />
    </Canvas>
  );
}

function Scene() {
  const sim = useMemo(() => new AttractSim(), []);
  const arena = ARENAS.fire;

  return (
    <>
      <fog attach="fog" args={[arena.fogColor, 8, 55]} />
      <Arena arena={arena} />
      <MixamoFighter characterId="gautham" getFrame={() => sim.frame("a")} />
      <MixamoFighter characterId="garv" getFrame={() => sim.frame("b")} />
      <SimDriver sim={sim} />
      <OrbitCamera sim={sim} />
    </>
  );
}

function SimDriver({ sim }: { sim: AttractSim }) {
  useFrame((_, rawDt) => {
    sim.tick(Math.min(50, rawDt * 1000));
  });
  return null;
}

function OrbitCamera({ sim }: { sim: AttractSim }) {
  const { camera } = useThree();
  const t0 = useRef<number | null>(null);

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    if (t0.current === null) t0.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - t0.current;

    const midX = (sim.a.x + sim.b.x) / 2;
    const midZ = (sim.a.z + sim.b.z) / 2;

    const angle = t * 0.09;
    const radius = 5.5 + Math.sin(t * 0.15) * 1.2;
    const height = 2.1 + Math.sin(t * 0.11) * 0.6;

    const targetPos = new THREE.Vector3(midX + Math.cos(angle) * radius, height, midZ + Math.sin(angle) * radius);
    camera.position.lerp(targetPos, 1 - Math.exp(-1.2 * dt));

    const lookAt = new THREE.Vector3(midX, 1.15, midZ);
    const m = new THREE.Camera();
    m.position.copy(camera.position);
    m.lookAt(lookAt);
    camera.quaternion.slerp(m.quaternion, 1 - Math.exp(-3 * dt));
  });

  return null;
}
