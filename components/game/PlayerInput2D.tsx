"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);
const KEY_CROUCH = new Set(["KeyS", "ArrowDown"]);
const KEY_JUMP = new Set(["KeyW", "ArrowUp", "Space"]);
const HANDLED = new Set([
  "KeyA", "KeyD", "KeyS", "KeyW", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp",
  "Space", "KeyJ", "KeyK", "KeyL", "KeyU",
]);

/** Keyboard + mouse 2D fighting-game controls — no pointer-lock needed now
 * that there's no free camera to look around with (see CameraRig's old
 * job, gone entirely). Movement keys are read every animation frame (held
 * down = keep walking); attack/block/special/jump fire once per keydown.
 * Left/right mouse click punch/kick as an alternative to J/K. */
export default function PlayerInput2D() {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (held.current.has(e.code)) return;
      held.current.add(e.code);
      const s = useGameStore.getState();
      if (s.phase !== "fight" || s.paused) return;
      switch (e.code) {
        case "KeyJ":
          s.punch();
          break;
        case "KeyK":
          s.kick();
          break;
        case "KeyL":
          s.setBlocking(true);
          break;
        case "KeyU":
          s.special();
          break;
      }
      if (KEY_JUMP.has(e.code)) s.jump();
      if (KEY_CROUCH.has(e.code)) s.setCrouching(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      const s = useGameStore.getState();
      if (e.code === "KeyL") s.setBlocking(false);
      if (KEY_CROUCH.has(e.code)) s.setCrouching(false);
    };
    // Mouse click as an alternate attack input, alongside J/K — left click
    // punches, right click kicks. Right-click needs the browser's own
    // context menu suppressed during a fight or every kick would pop one up.
    const onMouseDown = (e: MouseEvent) => {
      const s = useGameStore.getState();
      if (s.phase !== "fight" || s.paused) return;
      if (e.button === 0) s.punch();
      else if (e.button === 2) s.kick();
    };
    const onContextMenu = (e: MouseEvent) => {
      if (useGameStore.getState().phase === "fight") e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);

    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const s = useGameStore.getState();
      if (s.phase === "fight" && !s.paused) {
        let left = false;
        let right = false;
        held.current.forEach((k) => {
          if (KEY_LEFT.has(k)) left = true;
          if (KEY_RIGHT.has(k)) right = true;
        });
        if (left !== right) s.move(left ? -1 : 1, dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
