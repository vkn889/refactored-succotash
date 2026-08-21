"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { sendInput } from "@/lib/online";

const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);
const KEY_CROUCH = new Set(["KeyS", "ArrowDown"]);
const KEY_JUMP = new Set(["KeyW", "ArrowUp", "Space"]);
const HANDLED = new Set(["KeyA", "KeyD", "KeyS", "KeyW", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "KeyJ", "KeyK", "KeyL", "KeyU", "KeyI"]);

/** The joiner's own input, for an online match — same key layout as
 * single-player (PlayerInput2D), but every action sends a message over
 * the realtime channel instead of calling a local store action: the
 * joiner's local store never runs its own simulation, it's a pure mirror
 * of whatever the host broadcasts (see lib/online.ts). Movement sends one
 * "move" message only when the held direction actually CHANGES (down,
 * release, or flip) — the host then applies that direction continuously
 * every one of ITS OWN frames (see joinerMoveDir in lib/store.ts) instead
 * of this side pushing periodic distance nudges that got applied as
 * isolated instant jumps, which is what used to make the joiner's fighter
 * visibly steppy for both players. */
export default function OnlineJoinerInput() {
  const held = useRef(new Set<string>());
  const lastDir = useRef<-1 | 0 | 1>(0);

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
        case "KeyI":
          sendInput({ t: "throw" });
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
    const loop = () => {
      if (useGameStore.getState().phase === "fight") {
        let left = false;
        let right = false;
        held.current.forEach((k) => {
          if (KEY_LEFT.has(k)) left = true;
          if (KEY_RIGHT.has(k)) right = true;
        });
        const dir: -1 | 0 | 1 = left !== right ? (left ? -1 : 1) : 0;
        if (dir !== lastDir.current) {
          lastDir.current = dir;
          sendInput({ t: "move", dir });
        }
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
