"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { inputState } from "@/lib/inputState";

/** Camera FSM (SRD 3.2): FIRST_PERSON <-> CINEMATIC_TRANSITION/SCRIPTED_SHOT
 * <-> RETURN_TRANSITION. Outside of scripted cinematic beats (charge-up,
 * specials) the camera is third-person, over-the-shoulder: positioned
 * behind + above + slightly right of the player, rotation still driven
 * straight from mouse yaw/pitch (same free-look feel, just not glued to the
 * character's own eyes) — so the reticle at screen center is always "where
 * the camera itself is looking," and the player's own MixamoFighter body
 * (rendered in GameCanvas) is what you see doing the aiming. */
export default function CameraRig() {
  const { camera } = useThree();
  // NOTE: must be a THREE.Camera, not a plain Object3D — Object3D.lookAt()
  // orients a mesh's local +Z toward the target, while Camera/Light.lookAt()
  // orients local -Z toward it. Using a plain Object3D here silently
  // produces a quaternion facing 180° away from what `camera` needs.
  const dummy = useMemo(() => new THREE.Camera(), []);
  const shake = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const s = useGameStore.getState();
    const cinematic = s.cameraState === "CINEMATIC_TRANSITION" || s.cameraState === "SCRIPTED_SHOT";

    const pp = s.playerPos;
    const op = s.opponentPos;

    let basePos: THREE.Vector3;
    let targetQuat: THREE.Quaternion;
    let fov = 62;
    let lerpSpeed = 8;

    if (cinematic && s.cameraOwner === "opponent") {
      const toOppX = op.x - pp.x;
      const toOppZ = op.z - pp.z;
      const toOppLen = Math.hypot(toOppX, toOppZ) || 1;
      const toOpp = { x: toOppX / toOppLen, z: toOppZ / toOppLen };
      const tangent = { x: -toOpp.z, z: toOpp.x };
      basePos = new THREE.Vector3(op.x + tangent.x * 1.9 - toOpp.x * 1.5, 1.85, op.z + tangent.z * 1.9 - toOpp.z * 1.5);
      dummy.position.copy(basePos);
      dummy.lookAt(new THREE.Vector3(op.x, 1.6, op.z));
      targetQuat = dummy.quaternion.clone();
      fov = 42;
      lerpSpeed = 3.2;
    } else if (cinematic && s.cameraOwner === "player") {
      const toOppX = op.x - pp.x;
      const toOppZ = op.z - pp.z;
      const toOppLen = Math.hypot(toOppX, toOppZ) || 1;
      const toOpp = { x: toOppX / toOppLen, z: toOppZ / toOppLen };
      basePos = new THREE.Vector3(pp.x + toOpp.x * 0.3, 1.52 + s.playerY, pp.z + toOpp.z * 0.3);
      dummy.position.copy(basePos);
      dummy.lookAt(new THREE.Vector3(op.x, 1.55, op.z));
      targetQuat = dummy.quaternion.clone();
      fov = 38;
      lerpSpeed = 4;
    } else {
      // Third-person free look: yaw around world up, then pitch in that
      // local frame — same rotation math as the old first-person rig, just
      // positioned behind/above/right of the player instead of at their
      // eyes. forward/right from yaw match moveAxis's convention exactly
      // (forward = (-sin,-cos), right = (cos,-sin)) so "behind" here means
      // the same thing "behind" means for movement.
      const yaw = inputState.yaw;
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const camDist = 4.2;
      const shoulderOffset = 0.55;
      const camHeight = 1.95;
      basePos = new THREE.Vector3(
        pp.x - forward.x * camDist + right.x * shoulderOffset,
        camHeight + s.playerY,
        pp.z - forward.z * camDist + right.z * shoulderOffset
      );
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), inputState.pitch);
      targetQuat = yawQuat.multiply(pitchQuat);
      fov = 58;
      lerpSpeed = 9;
    }

    const shakeMag = s.screenShake * 0.05 + (s.hitStop > 0 ? 0.035 : 0);
    shake.current.set((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag, 0);

    const posAlpha = 1 - Math.exp(-lerpSpeed * dt);
    camera.position.lerp(basePos.clone().add(shake.current), posAlpha);

    const rotAlpha = 1 - Math.exp(-(cinematic ? 4 : 16) * dt);
    camera.quaternion.slerp(targetQuat, rotAlpha);

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      persp.fov = THREE.MathUtils.lerp(persp.fov, fov, 1 - Math.exp(-4 * dt));
      persp.updateProjectionMatrix();
    }
  });

  return null;
}
