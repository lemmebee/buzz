import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

interface WhisperChunk {
  text: string;
  timestamp: [number | null, number | null];
}

interface WhisperResult {
  text?: string;
  chunks?: WhisperChunk[];
}

let cachedTranscriber: unknown | null = null;

async function getTranscriber() {
  if (cachedTranscriber) return cachedTranscriber;
  const { pipeline, env } = await import("@xenova/transformers");
  env.cacheDir = join(process.cwd(), ".cache", "transformers");
  cachedTranscriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
  return cachedTranscriber;
}

function decodeAudioToFloat32(audioPath: string, sampleRate = 16000): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static missing"));
    const proc = spawn(ffmpegStatic, [
      "-i", audioPath,
      "-ac", "1",
      "-ar", String(sampleRate),
      "-f", "f32le",
      "-",
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", () => { /* discard ffmpeg progress noise */ });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}`));
      const buf = Buffer.concat(chunks);
      const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      resolve(new Float32Array(f32)); // copy out of pooled buffer
    });
  });
}

function fmtTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

function chunksToSrt(chunks: WhisperChunk[]): string {
  const lines: string[] = [];
  let idx = 1;
  for (const chunk of chunks) {
    const [start, end] = chunk.timestamp;
    if (start == null || end == null) continue;
    const text = chunk.text.trim();
    if (!text) continue;
    lines.push(String(idx));
    lines.push(`${fmtTimestamp(start)} --> ${fmtTimestamp(end)}`);
    lines.push(text);
    lines.push("");
    idx++;
  }
  return lines.join("\n");
}

export async function transcribeToSrt(audioPath: string): Promise<string | null> {
  try {
    const transcriber = (await getTranscriber()) as (
      audio: Float32Array,
      opts: { return_timestamps: boolean; chunk_length_s?: number }
    ) => Promise<WhisperResult>;

    const audio = await decodeAudioToFloat32(audioPath, 16000);
    const result = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30 });
    if (!result.chunks || result.chunks.length === 0) return null;

    const srt = chunksToSrt(result.chunks);
    if (!srt.trim()) return null;

    const mediaDir = join(process.cwd(), "public", "media");
    mkdirSync(mediaDir, { recursive: true });
    const filename = `captions-${Date.now()}.srt`;
    const localPath = join(mediaDir, filename);
    writeFileSync(localPath, srt, "utf-8");
    return localPath;
  } catch (err) {
    console.error("[captions] transcription failed, continuing without captions:", err);
    return null;
  }
}
