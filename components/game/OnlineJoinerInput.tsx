"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { sendInput } from "@/lib/online";

const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);
const KEY_CROUCH = new Set(["KeyS", "ArrowDown"]);
const KEY_JUMP = new Set(["KeyW", "ArrowUp", "Space"]);
const HANDLED = new Set(["KeyA", "KeyD", "KeyS", "KeyW", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "KeyJ", "KeyK", "KeyL", "KeyU"]);

/** The joiner's own input, for an online match — same key layout as
 * single-player (PlayerInput2D), but every action sends a message over
 * the realtime channel instead of calling a local store action: the
 * joiner's local store never runs its own simulation, it's a pure mirror
 * of whatever the host broadcasts (see lib/online.ts). Movement is sent
 * as a steady stream of "move" messages while held, at a fixed rate, so
 * the host's move2() sees the same "still holding this direction" shape
 * a local second keyboard would produce. */
export default function OnlineJoinerInput() {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (held.current.has(e.code)) return;
      held.current.add(e.code);
      if (useGameStore.getState().phase !== "fight") return;
      switch (e.code) {
        case "KeyJ":
          sendInput({ t: "punch" });
          break;
        case "KeyK":
          sendInput({ t: "kick" });
          break;
        case "KeyL":
          sendInput({ t: "block", on: true });
          break;
        case "KeyU":
          sendInput({ t: "special" });
          break;
      }
      if (KEY_JUMP.has(e.code)) sendInput({ t: "jump" });
      if (KEY_CROUCH.has(e.code)) sendInput({ t: "crouch", on: true });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      if (e.code === "KeyL") sendInput({ t: "block", on: false });
      if (KEY_CROUCH.has(e.code)) sendInput({ t: "crouch", on: false });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf: number;
    let lastSend = 0;
    const loop = (t: number) => {
      if (useGameStore.getState().phase === "fight" && t - lastSend > 50) {
        lastSend = t;
        let left = false;
        let right = false;
        held.current.forEach((k) => {
          if (KEY_LEFT.has(k)) left = true;
          if (KEY_RIGHT.has(k)) right = true;
        });
        if (left !== right) sendInput({ t: "move", dir: left ? -1 : 1 });
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
