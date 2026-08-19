"use client";

import { Howl, Howler } from "howler";

// Thin audio manager over Howler. All game code plays sound through this
// module so the store/combat logic stays framework-agnostic and SSR-safe
// (Howl instances are only ever created in the browser, lazily, on first use).

type Bank = Record<string, Howl>;

const sfxBank: Bank = {};
const voiceBank: Bank = {};
const ambientBank: Bank = {};
let themeHowl: Howl | null = null;
let currentAmbient: Howl | null = null;

const SFX_IDS = [
  "hit_light",
  "hit_heavy",
  "block",
  "dodge",
  "gunshot",
  "meter_full",
  "charge_rumble",
  "special_release",
  "ko_slam",
  "menu_select",
  "menu_confirm",
] as const;
export type SfxId = (typeof SFX_IDS)[number];

function getSfx(id: SfxId): Howl {
  if (!sfxBank[id]) {
    sfxBank[id] = new Howl({ src: [`/audio/sfx/${id}.mp3`], volume: 0.8 });
  }
  return sfxBank[id];
}

function getVoice(characterId: string): Howl {
  if (!voiceBank[characterId]) {
    voiceBank[characterId] = new Howl({
      src: [`/audio/voices/${characterId}.mp3`],
      volume: 1,
    });
  }
  return voiceBank[characterId];
}

function getAmbient(trackId: string): Howl {
  if (!ambientBank[trackId]) {
    ambientBank[trackId] = new Howl({
      src: [`/audio/ambient/${trackId}.mp3`],
      volume: 0,
      loop: true,
    });
  }
  return ambientBank[trackId];
}

export const audio = {
  /** Warm the Howl cache for every core SFX so the first hit of a match
   * doesn't pay a network+decode cost mid-combat (SRD "combat feels
   * responsive" target). Call once, e.g. on the home screen mount. */
  preloadSfx() {
    if (typeof window === "undefined") return;
    for (const id of SFX_IDS) getSfx(id);
  },

  unlock() {
    // Howler auto-resumes on first user gesture; calling this from a click
    // handler makes the resume happen deterministically in all browsers.
    if (typeof window === "undefined") return;
    if (Howler.ctx && Howler.ctx.state === "suspended") {
      Howler.ctx.resume();
    }
  },

  playSfx(id: SfxId, opts: { volume?: number; rate?: number } = {}) {
    if (typeof window === "undefined") return;
    const h = getSfx(id);
    const soundId = h.play();
    if (opts.volume !== undefined) h.volume(opts.volume, soundId);
    if (opts.rate !== undefined) h.rate(opts.rate, soundId);
  },

  playVoiceLine(characterId: string) {
    if (typeof window === "undefined") return;
    getVoice(characterId).play();
  },

  playTheme() {
    if (typeof window === "undefined") return;
    if (!themeHowl) {
      themeHowl = new Howl({
        src: ["/audio/theme.mp3"],
        loop: true,
        volume: 0.55,
      });
    }
    if (!themeHowl.playing()) themeHowl.play();
  },

  stopTheme(fadeMs = 600) {
    if (!themeHowl) return;
    themeHowl.fade(themeHowl.volume(), 0, fadeMs);
    window.setTimeout(() => themeHowl?.stop(), fadeMs);
  },

  setThemeVolume(v: number) {
    themeHowl?.volume(v);
  },

  playAmbient(trackId: string) {
    if (typeof window === "undefined") return;
    if (currentAmbient) {
      const prev = currentAmbient;
      prev.fade(prev.volume(), 0, 800);
      window.setTimeout(() => prev.stop(), 850);
    }
    const next = getAmbient(trackId);
    next.play();
    next.fade(0, 0.35, 1200);
    currentAmbient = next;
  },

  stopAmbient() {
    if (!currentAmbient) return;
    const prev = currentAmbient;
    prev.fade(prev.volume(), 0, 600);
    window.setTimeout(() => prev.stop(), 650);
    currentAmbient = null;
  },

  muteAll(muted: boolean) {
    Howler.mute(muted);
  },
};
