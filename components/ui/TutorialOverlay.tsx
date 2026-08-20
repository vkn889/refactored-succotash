"use client";

import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";

const CONTROLS: { keys: string; action: string }[] = [
  { keys: "A / D", action: "Move left / right" },
  { keys: "W", action: "Jump" },
  { keys: "S (hold)", action: "Crouch" },
  { keys: "J / Click", action: "Punch — fast, light" },
  { keys: "K / Right-click", action: "Kick — slower, hits harder" },
  { keys: "L (hold)", action: "Block — chips damage down a lot" },
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
          hits and build your meter; block to cut incoming damage way down. Once your meter is full, U unleashes
          your character&apos;s signature special move.
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
