"use client";

import { useGameStore } from "@/lib/store";
import HomeScreen from "@/components/screens/HomeScreen";
import StoryIntroScreen from "@/components/screens/StoryIntroScreen";
import MultiplayerMenuScreen from "@/components/screens/MultiplayerMenuScreen";
import OnlineLobbyScreen from "@/components/screens/OnlineLobbyScreen";
import CharacterSelect from "@/components/screens/CharacterSelect";
import FightScreen from "@/components/screens/FightScreen";
import ResultScreen from "@/components/screens/ResultScreen";

export default function Home() {
  const phase = useGameStore((s) => s.phase);
  // Only the live fight needs a locked, non-scrolling viewport (movement
  // keys like arrows/space would otherwise scroll the page). Every other
  // screen is a normal page that scrolls like the rest of the web.
  const locked = phase === "fight";

  return (
    <>
      <main className={locked ? "flex h-dvh w-dvw flex-1 flex-col overflow-hidden" : "flex min-h-dvh w-dvw flex-1 flex-col"}>
        {phase === "home" && <HomeScreen />}
        {phase === "story_intro" && <StoryIntroScreen />}
        {phase === "multiplayer_menu" && <MultiplayerMenuScreen />}
        {phase === "online_lobby" && <OnlineLobbyScreen />}
        {phase === "select" && <CharacterSelect />}
        {phase === "story_select" && <CharacterSelect storyMode />}
        {phase === "fight" && <FightScreen />}
        {phase === "result" && <ResultScreen />}
      </main>
      {/* Arcade-cabinet CRT scanline/vignette texture, on top of every
          screen — see .crt-overlay in globals.css. */}
      <div className="crt-overlay" />
    </>
  );
}
