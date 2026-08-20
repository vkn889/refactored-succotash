"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

// P1: arrow keys to move/jump/crouch, a cluster near them to attack.
const P1_LEFT = new Set(["ArrowLeft"]);
const P1_RIGHT = new Set(["ArrowRight"]);
const P1_CROUCH = new Set(["ArrowDown"]);
const P1_JUMP = new Set(["ArrowUp"]);

// P2: WASD to move/jump/crouch, F/G/Shift/E to attack — the other hand's
// natural home-row cluster.
const P2_LEFT = new Set(["KeyA"]);
const P2_RIGHT = new Set(["KeyD"]);
const P2_CROUCH = new Set(["KeyS"]);
const P2_JUMP = new Set(["KeyW"]);

const HANDLED = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Slash", "Quote", "ShiftRight", "Enter",
  "KeyA", "KeyD", "KeyW", "KeyS", "KeyF", "KeyG", "ShiftLeft", "KeyE",
]);

/** Local same-keyboard 2-player controls — replaces PlayerInput2D entirely
 * while `localMultiplayer` is active (see FightScreen). P1 = arrows +
 * Slash/Quote/ShiftRight/Enter (punch/kick/block/special). P2 = WASD +
 * F/G/ShiftLeft/E (punch/kick/block/special). Mouse click stays P1-only
 * (see PlayerInput2D's comment) since a shared mouse can't serve both. */
export default function LocalMultiplayerInput() {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (held.current.has(e.code)) return;
      held.current.add(e.code);
      const s = useGameStore.getState();
      if (s.phase !== "fight" || s.paused) return;
      switch (e.code) {
        case "Slash":
          s.punch();
          break;
        case "Quote":
          s.kick();
          break;
        case "ShiftRight":
          s.setBlocking(true);
          break;
        case "Enter":
          s.special();
          break;
        case "KeyF":
          s.punch2();
          break;
        case "KeyG":
          s.kick2();
          break;
        case "ShiftLeft":
          s.setBlocking2(true);
          break;
        case "KeyE":
          s.special2();
          break;
      }
      if (P1_JUMP.has(e.code)) s.jump();
      if (P1_CROUCH.has(e.code)) s.setCrouching(true);
      if (P2_JUMP.has(e.code)) s.jump2();
      if (P2_CROUCH.has(e.code)) s.setCrouching2(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      const s = useGameStore.getState();
      if (e.code === "ShiftRight") s.setBlocking(false);
      if (P1_CROUCH.has(e.code)) s.setCrouching(false);
      if (e.code === "ShiftLeft") s.setBlocking2(false);
      if (P2_CROUCH.has(e.code)) s.setCrouching2(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const s = useGameStore.getState();
      if (s.phase === "fight" && !s.paused) {
        let p1Left = false;
        let p1Right = false;
        let p2Left = false;
        let p2Right = false;
        held.current.forEach((k) => {
          if (P1_LEFT.has(k)) p1Left = true;
          if (P1_RIGHT.has(k)) p1Right = true;
          if (P2_LEFT.has(k)) p2Left = true;
          if (P2_RIGHT.has(k)) p2Right = true;
        });
        if (p1Left !== p1Right) s.move(p1Left ? -1 : 1, dt);
        if (p2Left !== p2Right) s.move2(p2Left ? -1 : 1, dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
