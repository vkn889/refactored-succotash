// Story Mode: a fixed ladder of fights, ending in two encounters that never
// appear in normal versus-mode opponent selection.
//
// Viraat is the gatekeeper, not the final boss — he built the Mogsphere,
// but he doesn't get to be what's waiting at the bottom of it. Overmog, the
// true final boss, isn't a thirteenth friend at all: it's what happens when
// a pocket dimension has been fed twelve people's egos for years (see
// lib/lore.ts). It gets a completely different body — see BossFighter.tsx —
// not just a recolor of the standard rig.
export const STORY_LADDER: string[] = [
  "chandan",
  "ryan",
  "elango",
  "dev",
  "rishi",
  "ronith",
  "tej",
  "viraat",
  "overmog",
];

export function isLastStoryFight(index: number): boolean {
  return index === STORY_LADDER.length - 1;
}
