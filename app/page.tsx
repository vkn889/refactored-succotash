"use client";

import { useGameStore } from "@/lib/store";
import HomeScreen from "@/components/screens/HomeScreen";
import CharacterSelect from "@/components/screens/CharacterSelect";
import FightScreen from "@/components/screens/FightScreen";
import ResultScreen from "@/components/screens/ResultScreen";

export default function Home() {
  const phase = useGameStore((s) => s.phase);
  // Only the live 3D fight needs a locked, non-scrolling viewport (it's a
  // pointer-locked first-person game). Every other screen is a normal page
  // that scrolls like the rest of the web.
  const locked = phase === "fight";

  return (
    <main className={locked ? "flex h-dvh w-dvw flex-1 flex-col overflow-hidden" : "flex min-h-dvh w-dvw flex-1 flex-col"}>
      {phase === "home" && <HomeScreen />}
      {phase === "select" && <CharacterSelect />}
      {phase === "story_select" && <CharacterSelect storyMode />}
      {phase === "fight" && <FightScreen />}
      {phase === "result" && <ResultScreen />}
    </main>
  );
}
