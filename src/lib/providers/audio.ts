import { mkdirSync, statSync, renameSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { AudioProvider, AudioGenerationInput, AudioGenerationOutput } from "./types";

const DEFAULT_VOICE = "en-US-AvaMultilingualNeural";
const MIN_VALID_BYTES = 1024;
const MAX_ATTEMPTS = 3;

async function synthesizeOnce(
  script: string,
  voice: string,
  mediaDir: string,
  filename: string
): Promise<string> {
  const targetPath = join(mediaDir, filename);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // Add subtle pause cues by injecting commas/ellipses into script for natural cadence,
  // since toFile only supports plain prosody, not SSML breaks.
  const cued = script
    .replace(/([.!?])\s+/g, "$1 ... ")
    .replace(/,\s+/g, ", ");

  const { audioFilePath } = await tts.toFile(mediaDir, cued, {
    rate: "-7%",
    pitch: "-1st",
    volume: "default",
  });
  tts.close();

  if (audioFilePath !== targetPath) {
    if (existsSync(targetPath)) unlinkSync(targetPath);
    renameSync(audioFilePath, targetPath);
  }

  const size = statSync(targetPath).size;
  if (size < MIN_VALID_BYTES) {
    unlinkSync(targetPath);
    throw new Error(`msedge-tts produced empty/short mp3 (${size} bytes)`);
  }
  return targetPath;
}

export function createMsEdgeTtsAudioProvider(): AudioProvider {
  return {
    name: "msedge-tts",

    async generate(input: AudioGenerationInput): Promise<AudioGenerationOutput> {
      const script = (input.script || "").trim();
      if (!script) throw new Error("msedge-tts requires non-empty script");

      const voice = input.voice || process.env.TTS_VOICE || DEFAULT_VOICE;
      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });

      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const filename = `tts-${Date.now()}.mp3`;
        try {
          const localPath = await synthesizeOnce(script, voice, mediaDir, filename);
          return { url: `/api/media/${filename}`, localPath };
        } catch (err) {
          lastErr = err;
          console.warn(`[msedge-tts] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err instanceof Error ? err.message : err);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
      }
      throw new Error(
        `msedge-tts failed after ${MAX_ATTEMPTS} attempts: ${lastErr instanceof Error ? lastErr.message : lastErr}`
      );
    },
  };
}
