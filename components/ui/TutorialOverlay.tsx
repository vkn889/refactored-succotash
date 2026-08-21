"use client";

import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";

const CONTROLS: { keys: string; action: string }[] = [
  { keys: "A / D", action: "Move left / right" },
  { keys: "W", action: "Jump — press again mid-air to double jump" },
  { keys: "S (hold)", action: "Crouch" },
  { keys: "J / Click", action: "Punch — fast, light" },
  { keys: "K / Right-click", action: "Kick — slower, hits harder" },
  { keys: "S + K", action: "Sweep — a low kick with long reach and a hard knockdown" },
  { keys: "W + K", action: "Jump kick — biggest damage in the game, but committal" },
  { keys: "L (hold)", action: "Block — chips damage down a lot" },
  { keys: "I", action: "Throw — grabs through block, can't be blocked" },
  { keys: "U", action: "Special, once your meter is full" },
  { keys: "Esc", action: "Pause" },
];

/** First-fight onboarding — dismissible, remembered in localStorage, and
 * reopenable anytime from the HUD's "?" button. */
export default function TutorialOverlay() {
  const dismissTutorial = useGameStore((s) => s.dismissTutorial);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-lg rounded-xl border border-white/10 bg-[#0a0a0f] p-6 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.3em] text-orange-400/80">Before you step into the ring</div>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-wide text-white">How to Fight</h2>
        <p className="mt-2 text-sm text-white/60">
          Classic side-view fighting — you always face your opponent, no aiming required. Punch and kick to land
          hits and build your meter; the same buttons throw different moves depending on your stance — crouch for a
          sweeping low kick, or kick in mid-air for a hard-hitting jump kick. Block to cut incoming damage way down.
          Once your meter is full, U unleashes your character&apos;s signature special move. Chain{" "}
          <span className="text-white/80">Punch → Punch → Kick</span>,{" "}
          <span className="text-white/80">Kick → Kick → Punch</span>, or{" "}
          <span className="text-white/80">Punch → Kick → Punch</span> in quick succession to land a bonus combo
          finisher — extra damage and meter on the last hit. Your opponent can throw these back at you too, so
          don&apos;t just trade hits blindly — the AI will punish an attack the instant your recovery ends. Blocking
          beats normal attacks but not throws — grab a turtling opponent instead. Block right as a hit lands to
          parry it instead, no damage taken and a hard punish window on the attacker. Drop below a quarter health
          and you enter &ldquo;Real Mog&rdquo; — your attacks hit harder and build meter faster. Land the
          match-winning blow and watch it play out as a finisher.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {CONTROLS.map((c) => (
            <div key={c.keys} className="flex items-baseline gap-2 text-sm">
              <span className="min-w-[104px] shrink-0 rounded bg-white/10 px-2 py-0.5 text-center text-[11px] font-bold tracking-wide text-white/90">
                {c.keys}
              </span>
              <span className="text-white/60">{c.action}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            audio.playSfx("menu_confirm");
            dismissTutorial();
          }}
          className="mt-6 w-full rounded-lg bg-gradient-to-br from-orange-500 to-red-600 py-3 font-[family-name:var(--font-display)] text-lg tracking-widest text-white shadow-[0_0_20px_rgba(255,90,30,0.35)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          GOT IT — ENTER THE RING
        </button>
      </div>
    </div>
  );
}
