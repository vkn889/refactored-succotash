"use client";

import { useEffect, useRef } from "react";
import { useBRStore } from "@/lib/storeBR";
import { sendBRInput } from "@/lib/onlineBR";

const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);
const KEY_JUMP = new Set(["KeyW", "ArrowUp", "Space"]);
const HANDLED = new Set(["KeyA", "KeyD", "KeyW", "ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyJ", "KeyK", "KeyL", "KeyU"]);

/** Every connected player's own input — same single-scheme keys as 1v1
 * single-player (A/D move, W jump, J punch, K kick, L block, U special),
 * since here everyone's on their own device instead of sharing a
 * keyboard. The host applies its own input straight to its local slot;
 * every other client sends it over the wire instead (see lib/onlineBR.ts)
 * — same host-authoritative split as the 1v1 game. */
export default function BRInput() {
  const held = useRef(new Set<string>());
  const lastDir = useRef<-1 | 0 | 1>(0);

  useEffect(() => {
    const dispatch = (msg: Parameters<typeof sendBRInput>[0]) => {
      const s = useBRStore.getState();
      if (s.isHost && s.localSlot !== null) {
        const slot = s.localSlot;
        switch (msg.t) {
          case "move":
            s.setMoveDir(slot, msg.dir);
            break;
          case "punch":
            s.punch(slot);
            break;
          case "kick":
            s.kick(slot);
            break;
          case "block":
            s.setBlocking(slot, msg.on);
            break;
          case "jump":
            s.jump(slot);
            break;
          case "special":
            s.special(slot);
            break;
        }
      } else {
        sendBRInput(msg);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (held.current.has(e.code)) return;
      held.current.add(e.code);
      if (useBRStore.getState().phase !== "fight") return;
      switch (e.code) {
        case "KeyJ":
          dispatch({ t: "punch" });
          break;
        case "KeyK":
          dispatch({ t: "kick" });
          break;
        case "KeyL":
          dispatch({ t: "block", on: true });
          break;
        case "KeyU":
          dispatch({ t: "special" });
          break;
      }
      if (KEY_JUMP.has(e.code)) dispatch({ t: "jump" });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      if (e.code === "KeyL") dispatch({ t: "block", on: false });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf: number;
    const loop = () => {
      if (useBRStore.getState().phase === "fight") {
        let left = false;
        let right = false;
        held.current.forEach((k) => {
          if (KEY_LEFT.has(k)) left = true;
          if (KEY_RIGHT.has(k)) right = true;
        });
        const dir: -1 | 0 | 1 = left !== right ? (left ? -1 : 1) : 0;
        if (dir !== lastDir.current) {
          lastDir.current = dir;
          dispatch({ t: "move", dir });
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
