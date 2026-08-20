"use client";

import { Howl, Howler } from "howler";

// Thin audio manager over Howler. All game code plays sound through this
// module so the store/combat logic stays framework-agnostic and SSR-safe
// (Howl instances are only ever created in the browser, lazily, on first use).

type Bank = Record<string, Howl>;

const sfxBank: Bank = {};
const voiceBank: Bank = {};
const ambientBank: Bank = {};
let currentAmbient: Howl | null = null;

// Named full-length music cues — only one plays at a time, crossfaded via
// playMusic(). "theme" is the original home-screen loop; the other three
// were supplied later (see AGENTS notes / user-provided assets) for
// stage-select, in-battle, and the story-mode prelude respectively.
const MUSIC_TRACKS = {
  theme: { src: "/audio/theme.mp3", volume: 0.55 },
  fighting: { src: "/audio/fighting.mp3", volume: 0.5 },
  stageSelect: { src: "/audio/stage-select.mp3", volume: 0.5 },
  prelude: { src: "/audio/prelude.mp3", volume: 0.45 },
} as const;
export type MusicTrack = keyof typeof MUSIC_TRACKS;

const musicBank: Partial<Record<MusicTrack, Howl>> = {};
let currentMusicKey: MusicTrack | null = null;

function getMusic(key: MusicTrack): Howl {
  if (!musicBank[key]) {
    musicBank[key] = new Howl({ src: [MUSIC_TRACKS[key].src], loop: true, volume: 0 });
  }
  return musicBank[key]!;
}

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

  /** Crossfades to a named music cue (see MUSIC_TRACKS) — no-op if it's
   * already the one playing. Only one plays at a time; the previous one
   * fades out while the new one fades in. */
  playMusic(key: MusicTrack, fadeMs = 700) {
    if (typeof window === "undefined") return;
    if (currentMusicKey === key) return;
    const prevKey = currentMusicKey;
    if (prevKey) {
      const prev = musicBank[prevKey]!;
      prev.fade(prev.volume(), 0, fadeMs);
      window.setTimeout(() => prev.stop(), fadeMs + 50);
    }
    const next = getMusic(key);
    next.play();
    next.fade(next.volume(), MUSIC_TRACKS[key].volume, fadeMs);
    currentMusicKey = key;
  },

  stopMusic(fadeMs = 600) {
    if (!currentMusicKey) return;
    const prev = musicBank[currentMusicKey]!;
    prev.fade(prev.volume(), 0, fadeMs);
    window.setTimeout(() => prev.stop(), fadeMs + 50);
    currentMusicKey = null;
  },

  setMusicVolume(v: number) {
    if (currentMusicKey) musicBank[currentMusicKey]!.volume(v);
  },

  // --- back-compat aliases for the original theme-only API ---
  playTheme() {
    this.playMusic("theme");
  },
  stopTheme(fadeMs = 600) {
    this.stopMusic(fadeMs);
  },
  setThemeVolume(v: number) {
    this.setMusicVolume(v);
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
