"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGameStore } from "@/lib/store";
import { inputState, resetInputState } from "@/lib/inputState";
import { audio } from "@/lib/audio";

const PITCH_LIMIT = 1.5; // ~86°, just short of straight up/down to avoid gimbal flip
const TWO_PI = Math.PI * 2;

/** Keyboard + mouse -> store action mapping (SRD "Input System": an
 * abstraction layer so bindings can be remapped later without touching
 * combat/camera code). Rendered once inside <Canvas> during the fight.
 *
 * Controls: mouse = completely free look (no auto-facing the opponent).
 * WASD moves relative to where the camera is actually looking. FPS + melee:
 * LMB fires your gun (hitscan, long range, real aim — a fire-rate cooldown
 * but no delayed re-check, so a shot resolves the instant you pull the
 * trigger) — limited magazine, R reloads. RMB throws a punch (short reach,
 * forgiving aim cone) — the gun lives in your right hand, so the punch is
 * always a left hook. Space jumps, Ctrl dodges sideways. */
export default function PlayerInput() {
  const { gl } = useThree();
  const held = useRef({ w: false, a: false, s: false, d: false, lastStrafe: 1 as -1 | 1 });

  useEffect(() => {
    resetInputState();
    const canvas = gl.domElement;

    const onClick = () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
      audio.unlock();
    };
    const onPointerLockChange = () => {
      inputState.pointerLocked = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!inputState.pointerLocked) return;
      let yaw = inputState.yaw - e.movementX * 0.0022;
      // wrap so it never grows unbounded over a long play session
      if (yaw > Math.PI) yaw -= TWO_PI;
      if (yaw < -Math.PI) yaw += TWO_PI;
      inputState.yaw = yaw;
      inputState.pitch = clamp(inputState.pitch - e.movementY * 0.0018, -PITCH_LIMIT, PITCH_LIMIT);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!inputState.pointerLocked) return;
      const s = useGameStore.getState();
      if (e.button === 0) s.shootGun(inputState.yaw);
      if (e.button === 2) s.heavyAttack(inputState.yaw);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      switch (e.code) {
        case "KeyW":
          held.current.w = true;
          break;
        case "KeyS":
          held.current.s = true;
          break;
        case "KeyA":
          held.current.a = true;
          held.current.lastStrafe = -1;
          break;
        case "KeyD":
          held.current.d = true;
          held.current.lastStrafe = 1;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          s.setBlocking(true);
          break;
        case "Space":
          e.preventDefault();
          s.jump();
          break;
        case "ControlLeft":
        case "ControlRight":
          s.dodge(held.current.lastStrafe, inputState.yaw);
          break;
        case "KeyE":
          s.chargeStart();
          break;
        case "KeyR":
          s.reload();
          break;
        case "Escape":
          document.exitPointerLock?.();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      switch (e.code) {
        case "KeyW":
          held.current.w = false;
          break;
        case "KeyS":
          held.current.s = false;
          break;
        case "KeyA":
          held.current.a = false;
          break;
        case "KeyD":
          held.current.d = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          s.setBlocking(false);
          break;
        case "KeyE":
          s.chargeRelease();
          break;
      }
    };

    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const fwd = (held.current.w ? 1 : 0) - (held.current.s ? 1 : 0);
    const strafe = (held.current.d ? 1 : 0) - (held.current.a ? 1 : 0);
    inputState.forward = fwd;
    inputState.strafe = strafe;
    if (fwd !== 0 || strafe !== 0) {
      useGameStore.getState().moveAxis(fwd, strafe, delta, inputState.yaw);
    }
  });

  return null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
