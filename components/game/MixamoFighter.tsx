"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "@/lib/vendor/FBXLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getCharacter } from "@/lib/combat";
import type { ModelKey } from "@/lib/types";
import type { FighterFrame } from "@/lib/fighterFrame";
import Gun from "./Gun";

interface MixamoFighterProps {
  characterId: string;
  getFrame: () => FighterFrame;
  staticPose?: boolean;
}

// Every clip name maps 1:1 to a game state below. Sourced from the "Basic
// Shooter Pack" for locomotion/aim/fire, plus a punch/death clip pulled
// from a second pack per model ("Creature Pack" for Ely, "Sword and Shield
// Pack" for Vanguard) — every clip is exported from Mixamo against this
// same character's own skeleton, so no cross-rig retargeting is needed.
// "fast-run"/"run-start"/"jumping" were added later (see MixamoFighter's
// directional-locomotion comment below) — same per-model-skeleton export
// convention, one file per model except "jumping", which only came as a
// single export; Mixamo's standard rig naming is shared across all of its
// characters, so that one clip drives both models' skeletons directly with
// no retargeting step needed either. Despite the filename, "run-start" is
// Mixamo's "Standing Jump Running To Run Forward" clip — a genuine jump
// arc (confirmed visually: the character clears real height, not a subtle
// hop), so it's used as the *running* jump, not a start-of-run transition.
// "rifle-run" (old single-direction forward jog) is retired in favor of
// "fast-run".
const CLIP_FILES = [
  "rifle-aiming-idle",
  "run-start",
  "fast-run",
  "walking-backwards",
  "strafe-left",
  "strafe-right",
  "firing-rifle",
  "hit-reaction",
  "jumping",
  "toss-grenade",
  "punch",
  "dying",
  "reloading",
] as const;
type ClipName = (typeof CLIP_FILES)[number];

interface LoadedModel {
  base: THREE.Group;
  clips: Partial<Record<ClipName, THREE.AnimationClip>>;
}

// Module-level caches: the FBX network fetch + parse cost is paid once per
// model for the whole session, no matter how many fighters use it.
const modelCache: Partial<Record<ModelKey, Promise<LoadedModel>>> = {};

function loadModel(model: ModelKey): Promise<LoadedModel> {
  if (!modelCache[model]) {
    // The vendored loader (lib/vendor/FBXLoader.js — see its README) has no
    // .d.ts of its own, so its methods come back untyped; assert the same
    // shapes @types/three declares for the stock module.
    const loader = new FBXLoader() as { loadAsync(url: string): Promise<THREE.Group & { animations: THREE.AnimationClip[] }> };
    modelCache[model] = Promise.all([
      loader.loadAsync(`/models/${model}/base.fbx`),
      Promise.all(CLIP_FILES.map((name) => loader.loadAsync(`/models/${model}/anims/${name}.fbx`).then((fbx) => [name, fbx.animations[0]] as const))),
    ]).then(([base, clipEntries]) => {
      base.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      const clips = Object.fromEntries(clipEntries.filter(([, c]) => !!c)) as LoadedModel["clips"];
      return { base, clips };
    });
  }
  return modelCache[model]!;
}

function findBone(root: THREE.Object3D, includes: string): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((o) => {
    if (found) return;
    if ((o as THREE.Bone).isBone && o.name.toLowerCase().includes(includes)) found = o as THREE.Bone;
  });
  return found;
}

const damp = (current: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

/** Third-person fighter body built from an imported, fully-animated Mixamo
 * rig — used for both the player's own body and the opponent's (see
 * BossFighter.tsx for the one exception, Overmog). Takes a
 * characterId/getFrame/staticPose contract (lib/fighterFrame.ts) so it
 * slots into GameCanvas, MatchupIntro, CharacterSelect's preview, and the
 * home-screen attract fight identically. */
export default function MixamoFighter({ characterId, getFrame, staticPose = false }: MixamoFighterProps) {
  const character = getCharacter(characterId);
  const modelKey: ModelKey = character.modelKey ?? "vanguard";
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);

  const group = useRef<THREE.Group>(null);
  const instanceRoot = useRef<THREE.Object3D | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<Partial<Record<ClipName, THREE.AnimationAction>>>({});
  const currentClip = useRef<ClipName | null>(null);
  const gunAnchor = useRef<THREE.Group>(null);

  const knockback = useRef(new THREE.Vector3());
  const lastHitToken = useRef(-1);
  const initialized = useRef(false);
  const lastPos = useRef({ x: 0, z: 0 });
  const speedSmoothed = useRef(0);
  // Smoothed, normalized movement direction in world space — separate from
  // speed so locomotion can tell forward from backward from strafing (see
  // the directional-locomotion comment in useFrame below).
  const moveDir = useRef({ x: 0, z: 1 });
  const ySmoothed = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadModel(modelKey)
      .then((m) => {
        if (cancelled) return;
        setLoaded(m);
      })
      .catch((err) => {
        console.error(`MixamoFighter: failed to load model "${modelKey}" for ${characterId}`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [modelKey, characterId]);

  // Build the per-instance skeleton clone + mixer once the shared asset has
  // loaded — every fighter using the same model needs its OWN clone so two
  // characters on screen at once don't share (and fight over) one skeleton.
  useEffect(() => {
    if (!loaded || !group.current) return;
    const clone = cloneSkeleton(loaded.base) as THREE.Group;
    // Ely's FBX is already authored at roughly real-world scale (~2 units
    // tall) rather than the centimeters-needing-0.01x-scale convention
    // some Mixamo exports use — confirmed via a bounding-box check that
    // showed a 0.011 multiplier shrinking it to ~0.02 units (a few visible
    // pixels at any normal camera distance, i.e. effectively invisible).
    // Ely's raw FBX geometry is ~161 units tall (confirmed via a post-mixer
    // bounding-box check — a naive check taken before any mixer.update()
    // call reported a wildly wrong ~0.02, since SkinnedMesh bounds aren't
    // reliable before the skeleton has actually been posed at least once),
    // i.e. authored in centimeters — scale down to the game's ~1.8-unit
    // convention.
    clone.scale.setScalar(0.0115);

    // Recolor: tint every material toward this character's palette instead
    // of leaving all twelve fighters wearing the same default outfit —
    // that's "just change the colors" (per-instance clones so this never
    // mutates the shared cached asset other fighters read from).
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.color = new THREE.Color(character.colors.secondary);
      mesh.material = mat;
    });

    group.current.add(clone);
    instanceRoot.current = clone;

    const m = new THREE.AnimationMixer(clone);
    mixer.current = m;
    actions.current = {};
    const oneShot: ClipName[] = ["firing-rifle", "hit-reaction", "jumping", "toss-grenade", "punch", "dying", "reloading", "run-start"];
    for (const name of CLIP_FILES) {
      const clip = loaded.clips[name];
      if (!clip) continue;
      const action = m.clipAction(clip);
      if (oneShot.includes(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.current[name] = action;
    }
    const idle = actions.current["rifle-aiming-idle"];
    if (idle) {
      idle.play();
      currentClip.current = "rifle-aiming-idle";
    }

    const rightHand = findBone(clone, "righthand");
    if (rightHand && gunAnchor.current) {
      rightHand.add(gunAnchor.current);
      gunAnchor.current.position.set(0, 3, 8);
      gunAnchor.current.rotation.set(0, Math.PI, 0);
      gunAnchor.current.scale.setScalar(9);
    }

    const groupNode = group.current;
    return () => {
      groupNode?.remove(clone);
      mixer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function crossfadeTo(name: ClipName, duration = 0.2) {
    if (currentClip.current === name) return;
    const next = actions.current[name];
    if (!next) return;
    const prev = currentClip.current ? actions.current[currentClip.current] : null;
    next.reset().fadeIn(duration).play();
    if (prev && prev !== next) prev.fadeOut(duration);
    currentClip.current = name;
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const f = getFrame();
    const root = instanceRoot.current;
    if (!root || !mixer.current) return;

    const dx = f.x - lastPos.current.x;
    const dz = f.z - lastPos.current.z;
    const rawSpeed = Math.hypot(dx, dz) / Math.max(dt, 0.0001);
    lastPos.current = { x: f.x, z: f.z };
    speedSmoothed.current = THREE.MathUtils.lerp(speedSmoothed.current, Math.min(1, rawSpeed / 3.5), 1 - Math.exp(-10 * dt));
    const moving = (f.action === "idle" || f.action === "block") && speedSmoothed.current > 0.06;

    // Smooth the actual movement direction (not just its magnitude) so
    // locomotion can distinguish forward/backward/strafing instead of
    // always playing a forward-run clip no matter which way the body is
    // actually sliding — that mismatch (e.g. visibly moonwalking backward
    // while the forward-run animation plays) was the biggest source of
    // "not smooth"-looking movement. Direction is only meaningful once
    // actually moving; hold the last direction otherwise so it doesn't
    // snap to garbage from a near-zero vector.
    const moveMag = Math.hypot(dx, dz);
    if (moveMag > 0.0008) {
      moveDir.current.x = damp(moveDir.current.x, dx / moveMag, 14, dt);
      moveDir.current.z = damp(moveDir.current.z, dz / moveMag, 14, dt);
    }
    // This rig's bind-pose front is local +Z (see the rotation comment
    // below), so world-forward/world-right from the body's current facing
    // angle are (sinθ,cosθ) / (cosθ,-sinθ) — same derivation CameraRig uses
    // for camera-relative movement, just off the body's own yaw instead of
    // the camera's.
    const theta = group.current?.rotation.y ?? 0;
    const fwdX = Math.sin(theta);
    const fwdZ = Math.cos(theta);
    const rightX = Math.cos(theta);
    const rightZ = -Math.sin(theta);
    const forwardAmt = moveDir.current.x * fwdX + moveDir.current.z * fwdZ;
    const rightAmt = moveDir.current.x * rightX + moveDir.current.z * rightZ;
    const airborne = (f.y ?? 0) > 0.02;

    // Pick the clip for this frame's state — explicit actions win over
    // locomotion, locomotion wins over idle. Punch/death use real authored
    // clips (exported against this same skeleton) rather than a hand-rolled
    // bone override.
    if (f.action === "attack_light" || f.action === "attack_heavy") crossfadeTo("punch", 0.05);
    else if (f.action === "ko") crossfadeTo("dying", 0.15);
    else if (f.action === "reload") crossfadeTo("reloading", 0.1);
    else if (f.action === "shoot") crossfadeTo("firing-rifle", 0.05);
    else if (f.action === "hitstun") crossfadeTo("hit-reaction", 0.08);
    else if (f.action === "charge" || f.action === "special") crossfadeTo("toss-grenade", 0.15);
    else if (airborne && moving && forwardAmt >= 0 && forwardAmt >= Math.abs(rightAmt)) crossfadeTo("run-start", 0.12);
    else if (airborne) crossfadeTo("jumping", 0.12);
    else if (!moving) crossfadeTo("rifle-aiming-idle", 0.2);
    else if (Math.abs(forwardAmt) >= Math.abs(rightAmt) && forwardAmt >= 0) crossfadeTo("fast-run", 0.15);
    else if (forwardAmt < 0) crossfadeTo("walking-backwards", 0.15);
    else if (rightAmt >= 0) crossfadeTo("strafe-right", 0.15);
    else crossfadeTo("strafe-left", 0.15);

    mixer.current.update(dt);

    // knockback impulse on a fresh, non-blocked hit
    if (f.hitToken !== lastHitToken.current) {
      const isFirstFrame = lastHitToken.current === -1;
      lastHitToken.current = f.hitToken;
      if (!isFirstFrame && f.hitToken > 0) {
        const kdx = f.x - f.faceX;
        const kdz = f.z - f.faceZ;
        const d = Math.hypot(kdx, kdz) || 1;
        knockback.current.set((kdx / d) * 0.24, 0, (kdz / d) * 0.24);
      }
    }
    knockback.current.multiplyScalar(Math.exp(-dt * 8));

    if (group.current) {
      if (!initialized.current && !staticPose) {
        group.current.position.set(f.x, 0, f.z);
        lastPos.current = { x: f.x, z: f.z };
        initialized.current = true;
      }
      if (staticPose) {
        group.current.rotation.y = Math.PI * 0.15 + Math.sin(state.clock.elapsedTime * 0.4) * 0.25;
      } else {
        const targetX = f.x + knockback.current.x;
        const targetZ = f.z + knockback.current.z;
        group.current.position.x = damp(group.current.position.x, targetX, 18, dt);
        group.current.position.z = damp(group.current.position.z, targetZ, 18, dt);
        // Actually lift the body during a jump — previously only the clip
        // selection reacted to airborne state while the group's own
        // position.y stayed pinned at 0, so a "jumping" animation played
        // with the character's feet still glued to the floor.
        ySmoothed.current = damp(ySmoothed.current, f.y ?? 0, 18, dt);
        group.current.position.y = ySmoothed.current;
        const fdx = f.faceX - f.x;
        const fdz = f.faceZ - f.z;
        if (Math.hypot(fdx, fdz) > 0.01) {
          // Same convention as Fighter.tsx: this rig's bind-pose front is
          // local +Z too, so no offset — rotating (0,0,1) by rotation.y=θ
          // gives world (sinθ,cosθ), so θ=atan2(dx,dz) points +Z at the
          // target. A stray +Math.PI here previously made every fighter
          // face away from their target (confirmed via a screenshot showing
          // the opponent's back, not front, from a head-on camera).
          const targetYaw = Math.atan2(fdx, fdz);
          group.current.rotation.y = dampAngle(group.current.rotation.y, targetYaw, 9, dt);
        }
      }
    }
  });

  return (
    <group ref={group}>
      <group ref={gunAnchor}>
        <Gun primary={character.colors.primary} secondary={character.colors.secondary} emissive={character.colors.emissive} />
      </group>
    </group>
  );
}
