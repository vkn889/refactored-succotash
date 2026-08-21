"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { useBRStore } from "@/lib/storeBR";
import { stopBROnline } from "@/lib/onlineBR";
import BattleRoyaleLobbyScreen from "./BattleRoyaleLobbyScreen";
import BattleRoyaleFightScreen from "./BattleRoyaleFightScreen";
import BattleRoyaleResultScreen from "./BattleRoyaleResultScreen";

/** Mounted whenever the MAIN store's phase is "battle_royale" — from here
 * on, everything routes off useBRStore's own (much simpler) phase instead,
 * fully independent of the 1v1 game's phase machine. Unmounting (leaving
 * back to Home) always tears down any live connection and resets the BR
 * store, so a stale room/tick loop never lingers in the background. */
export default function BattleRoyaleRoot() {
  const goHome = useGameStore((s) => s.goHome);
  const phase = useBRStore((s) => s.phase);
  const resetRoom = useBRStore((s) => s.resetRoom);
  const leaving = useRef(false);

  useEffect(() => {
    return () => {
      if (!leaving.current) {
        stopBROnline();
        resetRoom();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    leaving.current = true;
    stopBROnline();
    resetRoom();
    goHome();
  };

  if (phase === "lobby") return <BattleRoyaleLobbyScreen onLeave={leave} />;
  if (phase === "fight") return <BattleRoyaleFightScreen />;
  return <BattleRoyaleResultScreen onLeave={leave} />;
}
