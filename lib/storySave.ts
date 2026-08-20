// Story-mode save data — one slot, localStorage-backed. Kept as a plain
// data module (not store state) so it's trivial to read on the story
// landing screen before any match/store machinery spins up.

export interface StorySave {
  playerId: string;
  storyIndex: number;
}

const KEY = "mogoff_story_save";

export function loadStorySave(): StorySave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorySave>;
    if (typeof parsed.playerId !== "string" || typeof parsed.storyIndex !== "number") return null;
    return { playerId: parsed.playerId, storyIndex: parsed.storyIndex };
  } catch {
    return null;
  }
}

export function saveStoryProgress(save: StorySave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignore — private browsing / storage full, story mode still works, just won't resume */
  }
}

export function clearStorySave(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
