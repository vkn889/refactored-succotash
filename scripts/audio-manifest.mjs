// Central manifest describing every AI-generated audio asset in Mog Off.
// Voice lines use ElevenLabs Text-to-Speech (one distinct cast voice per fighter).
// SFX + ambient beds use ElevenLabs Sound Generation.
// This file is imported by scripts/generate-audio.mjs (Node, offline, one-time)
// AND by lib/characters.ts (browser) for voiceId/line metadata — keep it dependency-free.

export const VOICES = {
  harry: "SOYHLrjzK2X1ezoPC6cr", // Fierce Warrior
  daniel: "onwK4e9ZLuTAKqWW03F9", // Steady Broadcaster
  river: "SAz9YHcvj6GT2YYXdXww", // Relaxed, Neutral
  callum: "N2lVS1w4EtoT3dr4eOWO", // Husky Trickster
  liam: "TX3LPaxmHKxFdv7VOQHJ", // Energetic
  brian: "nPczCjzI2devNBz1zQrb", // Deep, Resonant
  eric: "cjVigY5qzO86Huf0OWal", // Smooth, Trustworthy
  chris: "iP95p4xoKVk53GoZ742B", // Charming, Down-to-Earth
  adam: "pNInz6obpgDQGcFmaJgB", // Dominant, Firm
  charlie: "IKne3meq5aSn9XLyUdCD", // Deep, Confident, Energetic
  will: "bIHbv24MWmeRgasZH58o", // Relaxed Optimist
  bill: "pqHfZKP75CvOlQylNhV4", // Wise, Mature, Balanced
};

// character id -> { voice, line, settings }
export const VOICE_LINES = {
  gautham: { voice: VOICES.harry, line: "Burn with me!", stability: 0.35, style: 0.75 },
  garv: { voice: VOICES.daniel, line: "Everything ends in silence.", stability: 0.75, style: 0.2 },
  anvith: { voice: VOICES.river, line: "Feel the current.", stability: 0.6, style: 0.3 },
  ryan: { voice: VOICES.callum, line: "Down you go!", stability: 0.3, style: 0.8 },
  chandan: { voice: VOICES.liam, line: "Catch me if you can.", stability: 0.3, style: 0.85 },
  elango: { voice: VOICES.brian, line: "The ground remembers.", stability: 0.7, style: 0.35 },
  dev: { voice: VOICES.eric, line: "Running final sequence.", stability: 0.65, style: 0.2 },
  aadit: { voice: VOICES.chris, line: "I've already won this fight.", stability: 0.4, style: 0.6 },
  rishi: { voice: VOICES.adam, line: "One cut is enough.", stability: 0.65, style: 0.3 },
  ronith: { voice: VOICES.charlie, line: "Try to keep up.", stability: 0.35, style: 0.7 },
  tej: { voice: VOICES.will, line: "Too fast, too late.", stability: 0.3, style: 0.8 },
  viraat: { voice: VOICES.bill, line: "I built this arena. I decide who leaves it.", stability: 0.75, style: 0.4 },
};

// Core gameplay SFX, shared across the whole roster.
export const SFX = {
  hit_light: "quick light punch impact hit, snappy anime fight whack, short",
  hit_heavy: "heavy powerful punch impact, deep anime fight boom thud",
  block: "metallic energy shield block impact, sharp clang with a ring",
  dodge: "fast whoosh swipe, air dash movement sound",
  gunshot: "sharp punchy energy blaster gunshot, quick sci-fi laser pistol crack",
  meter_full: "short rising power-up chime, energy meter full notification",
  charge_rumble: "low rising energy charge-up rumble building tension, one second",
  special_release: "explosive elemental power release, dramatic anime special attack burst",
  ko_slam: "heavy knockout slam impact with a low boom, dust hit",
  menu_select: "short crisp ui hover blip, futuristic menu tick",
  menu_confirm: "satisfying ui confirm chime, short positive interface sound",
};

// Ambient arena beds — one per character's home arena, looped low in the mix.
export const AMBIENT = {
  fire: "low rumbling volcanic lava arena ambience with crackling embers, looping",
  ice: "cold wind howling over a frozen crystal glacier, subtle ice creaking, looping",
  storm_zen: "distant electrical crackle over a still mountain temple wind, calm but charged, looping",
  concrete_arena: "gritty underground fight club ambience, distant crowd murmur and metal creaks, looping",
  neon_alley: "rain-slick neon city alley ambience, distant synth hum and dripping water, looping",
  stone_quarry: "deep rock quarry ambience, distant rumble and loose gravel settling, looping",
  server_core: "humming server room ambience, electronic drones and cooling fans, looping",
  mirror_hall: "eerie shifting glass hall ambience, glassy resonant tones, looping",
  dojo: "quiet wooden dojo ambience, faint wind through paper walls, looping",
  sky_temple: "high altitude wind temple ambience, strong gusts and distant chimes, looping",
  storm_ring: "crackling thunderstorm arena ambience, rolling thunder and static, looping",
  void_throne: "vast dark cosmic throne room ambience, deep resonant drone, looping",
};
