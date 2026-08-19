"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { getToonGradientMap } from "@/lib/toonGradient";

interface CrowdProps {
  /** Radius of the seating ring the crowd sits on. */
  radius: number;
  /** How high above the arena floor this row of seating sits. */
  y: number;
  count: number;
  palette: string[];
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _white = new THREE.Color("#ffffff");

/** A ring of low-poly spectators packed onto a coliseum's seating tier
 * (PRD follow-up: "an audience outside of each arena like its an actual
 * colosseum"). One InstancedMesh per body part keeps a few hundred fans
 * cheap to draw — each instance gets a random seat offset, a random idle
 * bob phase, and one of a few jersey colors so the stands read as a real
 * crowd instead of a single reskinned mesh repeated. They flinch upright
 * and flash brighter for a moment whenever a hit lands, so the arena feels
 * like it's actually watching the fight. */
export default function Crowd({ radius, y, count, palette }: CrowdProps) {
  const gradientMap = useMemo(() => getToonGradientMap(), []);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const roarUntil = useRef(0);
  const hitEventCount = useRef(-1);

  const seats = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.02;
      const jitterR = (Math.random() - 0.5) * 0.6;
      const r = radius + jitterR;
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        rotY: -a + Math.PI / 2 + (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.6,
        bodyH: 0.55 + Math.random() * 0.25,
        color: palette[i % palette.length],
      };
    });
  }, [radius, count, palette]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = useGameStore.getState();
    if (hitEventCount.current === -1) hitEventCount.current = s.hitEvents.length;
    if (s.hitEvents.length !== hitEventCount.current) {
      hitEventCount.current = s.hitEvents.length;
      roarUntil.current = t + 0.6;
    }
    const roaring = t < roarUntil.current;

    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;

    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      const bob = Math.sin(t * seat.speed + seat.phase) * (roaring ? 0.16 : 0.05);
      const jump = roaring ? Math.abs(Math.sin(t * 4 + seat.phase)) * 0.22 : 0;

      _dummy.position.set(seat.x, y + seat.bodyH / 2 + bob + jump, seat.z);
      _dummy.rotation.set(0, seat.rotY, 0);
      _dummy.scale.set(0.32, seat.bodyH, 0.22);
      _dummy.updateMatrix();
      body.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(seat.x, y + seat.bodyH + 0.16 + bob + jump, seat.z);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      head.setMatrixAt(i, _dummy.matrix);

      _color.set(seat.color);
      if (roaring) _color.lerp(_white, 0.3);
      body.setColorAt(i, _color);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, seats.length]} castShadow>
        <capsuleGeometry args={[0.5, 0.6, 3, 6]} />
        <meshToonMaterial gradientMap={gradientMap} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, seats.length]}>
        <sphereGeometry args={[0.13, 6, 5]} />
        <meshToonMaterial color="#e8c4a0" gradientMap={gradientMap} />
      </instancedMesh>
    </group>
  );
}
