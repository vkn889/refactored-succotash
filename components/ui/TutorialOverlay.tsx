"use client";

import { useGameStore } from "@/lib/store";
import { audio } from "@/lib/audio";

const CONTROLS: { keys: string; action: string }[] = [
  { keys: "Mouse", action: "Free look — turn and aim anywhere" },
  { keys: "WASD", action: "Move relative to where you're looking" },
  { keys: "Left Click", action: "Fire your gun — reticle turns red when it'll land" },
  { keys: "R", action: "Reload once your magazine runs dry" },
  { keys: "Right Click", action: "Punch — short range, forgiving aim" },
  { keys: "Shift (hold)", action: "Block — chips damage down a lot" },
  { keys: "Ctrl", action: "Dodge sideways" },
  { keys: "Space", action: "Jump" },
  { keys: "Hold E", action: "Charge your special once the meter is full — release to unleash it" },
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
          Click the arena to lock your mouse and look freely — this is third-person, so you&apos;ll see your own
          fighter over their shoulder. Every fighter carries a gun with a limited magazine — left click fires it,
          the reticle turns red the instant it&apos;s close enough to land, and R reloads. Right click throws a
          punch instead — shorter range, easier to land. Landing hits fills your meter; hold E once it&apos;s full
          for your cinematic special.
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
