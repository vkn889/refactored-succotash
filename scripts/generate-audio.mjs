// One-time, offline asset generation. Run manually: `node scripts/generate-audio.mjs`
// Requires ELEVENLABS_API_KEY in the environment (see .env.local).
// Produces public/audio/voices/<id>.mp3, public/audio/sfx/<id>.mp3, public/audio/ambient/<id>.mp3
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { VOICE_LINES, SFX, AMBIENT } from "./audio-manifest.mjs";

/** ElevenLabs TTS comes back quiet (~-22dB mean) for this voice set — loudness-
 * normalize + limit voice lines so they read clearly over SFX/ambience/music
 * without re-tuning every call site's volume. No-op (keeps the raw file) if
 * ffmpeg isn't on PATH. */
function loudnessBoost(file) {
  try {
    const tmp = `${file}.boosted.mp3`;
    execFileSync("ffmpeg", [
      "-y",
      "-i", file,
      "-af", "loudnorm=I=-12:TP=-1.0:LRA=8,alimiter=limit=0.98",
      "-ar", "44100",
      "-b:a", "192k",
      tmp,
      "-loglevel", "error",
    ]);
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn(`  (skipping loudness boost for ${path.basename(file)}: ${e.message})`);
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set");
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const dirs = {
  voices: path.join(ROOT, "public/audio/voices"),
  sfx: path.join(ROOT, "public/audio/sfx"),
  ambient: path.join(ROOT, "public/audio/ambient"),
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

async function withRetry(fn, label, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.warn(`  retry ${i}/${tries} for ${label}: ${e.message}`);
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function ttsToFile(voiceId, text, outFile, settings = {}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: settings.stability ?? 0.5,
        similarity_boost: 0.8,
        style: settings.style ?? 0.4,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  return buf.length;
}

async function sfxToFile(prompt, outFile, durationSeconds = 2) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: durationSeconds,
      prompt_influence: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`SFX ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  return buf.length;
}

async function main() {
  console.log(`Generating ${Object.keys(VOICE_LINES).length} voice lines...`);
  for (const [id, cfg] of Object.entries(VOICE_LINES)) {
    const out = path.join(dirs.voices, `${id}.mp3`);
    if (fs.existsSync(out) && process.env.FORCE !== "1") {
      console.log(`  skip ${id} (exists)`);
      continue;
    }
    const size = await withRetry(
      () => ttsToFile(cfg.voice, cfg.line, out, cfg),
      `voice:${id}`
    );
    loudnessBoost(out);
    console.log(`  ${id}: "${cfg.line}" -> ${size} bytes`);
  }

  console.log(`Generating ${Object.keys(SFX).length} SFX...`);
  for (const [id, prompt] of Object.entries(SFX)) {
    const out = path.join(dirs.sfx, `${id}.mp3`);
    if (fs.existsSync(out) && process.env.FORCE !== "1") {
      console.log(`  skip ${id} (exists)`);
      continue;
    }
    const size = await withRetry(
      () => sfxToFile(prompt, out, id.includes("charge") || id.includes("clash") ? 2 : 1.2),
      `sfx:${id}`
    );
    console.log(`  ${id} -> ${size} bytes`);
  }

  console.log(`Generating ${Object.keys(AMBIENT).length} ambient beds...`);
  for (const [id, prompt] of Object.entries(AMBIENT)) {
    const out = path.join(dirs.ambient, `${id}.mp3`);
    if (fs.existsSync(out) && process.env.FORCE !== "1") {
      console.log(`  skip ${id} (exists)`);
      continue;
    }
    const size = await withRetry(() => sfxToFile(prompt, out, 20), `ambient:${id}`);
    console.log(`  ${id} -> ${size} bytes`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
