import { statSync, unlinkSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveVisionProvider } from "@/lib/image/vision-judge";

const execFileP = promisify(execFile);

// Governance contract (adapted from OpenMontage): NEVER present a rendered video
// as done without probing the actual output. All checks are free/local — ffprobe,
// ffmpeg volumedetect, frame extraction — plus one vision spot-check of sampled
// frames. A hard-fail (unplayable / silent-when-narrated) blocks; softer issues
// are surfaced but don't block a one-shot pipeline.

export type ReviewStatus = "pass" | "revise" | "fail";

export interface FinalReview {
  status: ReviewStatus;
  issues: string[];
  durationSec: number | null;
  hasAudio: boolean;
  frameUrls: string[];
}

const BLACK_FRAME_BYTES = 2000; // a 1080p pure-black JPEG is ~5KB; below this = black
const FRAME_POSITIONS = [0.1, 0.35, 0.65, 0.9];

interface ProbeResult { durationSec: number | null; width: number; height: number; hasAudio: boolean; valid: boolean }

async function ffprobe(file: string): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=width,height,codec_type",
      "-of", "json", file,
    ]);
    const data = JSON.parse(stdout);
    const streams: Array<{ codec_type?: string; width?: number; height?: number }> = data.streams ?? [];
    const v = streams.find((s) => s.codec_type === "video");
    const durationSec = data.format?.duration ? parseFloat(data.format.duration) : null;
    return {
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      width: v?.width ?? 0,
      height: v?.height ?? 0,
      hasAudio: streams.some((s) => s.codec_type === "audio"),
      valid: !!v,
    };
  } catch {
    return { durationSec: null, width: 0, height: 0, hasAudio: false, valid: false };
  }
}

// mean/max dBFS from ffmpeg's volumedetect; null when it can't be measured.
async function detectVolume(file: string): Promise<{ mean: number | null; max: number | null }> {
  try {
    const { stderr } = await execFileP("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    const mean = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    const max = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
    return { mean: mean ? parseFloat(mean[1]) : null, max: max ? parseFloat(max[1]) : null };
  } catch {
    return { mean: null, max: null };
  }
}

// Extract frames into public/media so the vision provider can read them by url.
async function extractFrames(file: string, durationSec: number): Promise<string[]> {
  const mediaDir = path.join(process.cwd(), "public", "media");
  const stamp = path.basename(file).replace(/\.[^.]+$/, "");
  const urls: string[] = [];
  for (let i = 0; i < FRAME_POSITIONS.length; i++) {
    const at = Math.max(0, durationSec * FRAME_POSITIONS[i] - 0.05);
    const name = `review-${stamp}-${i}.jpg`;
    const out = path.join(mediaDir, name);
    try {
      await execFileP("ffmpeg", ["-hide_banner", "-y", "-ss", at.toFixed(2), "-i", file, "-frames:v", "1", "-q:v", "3", out]);
      urls.push(`/api/media/${name}`);
    } catch {
      /* skip a frame that fails to extract */
    }
  }
  return urls;
}

interface VisionSpot { textOverlaps: boolean; unreadable: boolean; brokenLayout: boolean; worst: string }

async function spotCheckFrames(frameUrls: string[]): Promise<VisionSpot | null> {
  if (frameUrls.length === 0) return null;
  const provider = resolveVisionProvider();
  try {
    const res = await provider.generate({
      systemPrompt:
        "You are a QA reviewer looking at frames sampled across a rendered marketing video. " +
        "Report only real, visible defects.",
      userPrompt:
        "These frames are sampled across one video. Reply with ONLY JSON: " +
        '{"textOverlaps": <bool>, "unreadable": <bool>, "brokenLayout": <bool>, "worst": "<one line, or empty>"}',
      images: frameUrls,
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const v = JSON.parse(m[0]);
    return {
      textOverlaps: !!v.textOverlaps,
      unreadable: !!v.unreadable,
      brokenLayout: !!v.brokenLayout,
      worst: typeof v.worst === "string" ? v.worst : "",
    };
  } catch (err) {
    console.warn(`[final-review] vision spot-check failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export interface ReviewOpts {
  localPath: string;
  targetDurationSec?: number;
  narrated?: boolean; // whether the spec had a voiceover (drives the silence check)
  spotCheck?: boolean; // run the vision frame check (default true)
}

// Probe → sample → look. Returns a review; the caller decides what to do with a
// non-pass status (M3 blocks only on hard technical failure).
export async function reviewRenderedVideo(opts: ReviewOpts): Promise<FinalReview> {
  const issues: string[] = [];
  const critical: string[] = [];

  const probe = await ffprobe(opts.localPath);
  if (!probe.valid) {
    return { status: "fail", issues: ["ffprobe: no valid video stream (unplayable container)"], durationSec: null, hasAudio: false, frameUrls: [] };
  }
  if (probe.durationSec !== null && probe.durationSec < 1) critical.push(`suspiciously short: ${probe.durationSec.toFixed(2)}s`);
  if (probe.width < 320 || probe.height < 240) issues.push(`low resolution: ${probe.width}x${probe.height}`);
  if (opts.targetDurationSec && probe.durationSec) {
    const drift = Math.abs(probe.durationSec - opts.targetDurationSec) / opts.targetDurationSec;
    if (drift > 0.25) issues.push(`duration drift ${(drift * 100).toFixed(0)}% (got ${probe.durationSec.toFixed(1)}s, target ${opts.targetDurationSec.toFixed(1)}s)`);
  }

  if (opts.narrated) {
    if (!probe.hasAudio) critical.push("narrated spec but no audio stream");
    else {
      const vol = await detectVolume(opts.localPath);
      if (vol.mean !== null && vol.mean < -60) critical.push(`audio effectively silent (mean ${vol.mean}dB)`);
      if (vol.max !== null && vol.max > -0.5) issues.push(`audio clipping (max ${vol.max}dB)`);
    }
  }

  let frameUrls: string[] = [];
  if (probe.durationSec) {
    frameUrls = await extractFrames(opts.localPath, probe.durationSec);
    const blackCount = frameUrls.filter((u) => {
      const p = path.join(process.cwd(), "public", u.replace(/^\/api\/media\//, "media/"));
      try { return statSync(p).size < BLACK_FRAME_BYTES; } catch { return false; }
    }).length;
    if (blackCount >= FRAME_POSITIONS.length) critical.push("all sampled frames are black");
    else if (blackCount > 0) issues.push(`${blackCount}/${frameUrls.length} sampled frames look black`);

    if (opts.spotCheck !== false) {
      const spot = await spotCheckFrames(frameUrls);
      if (spot) {
        if (spot.textOverlaps) issues.push(`vision: text overlaps${spot.worst ? ` — ${spot.worst}` : ""}`);
        if (spot.unreadable) issues.push("vision: text unreadable against background");
        if (spot.brokenLayout) issues.push("vision: broken layout");
      }
    }
  }

  const status: ReviewStatus = critical.length > 0 ? "fail" : issues.length > 0 ? "revise" : "pass";
  return { status, issues: [...critical, ...issues], durationSec: probe.durationSec, hasAudio: probe.hasAudio, frameUrls };
}

// Best-effort cleanup of the review frames once the caller is done with them.
export function cleanupReviewFrames(review: FinalReview): void {
  for (const u of review.frameUrls) {
    try { unlinkSync(path.join(process.cwd(), "public", u.replace(/^\/api\/media\//, "media/"))); } catch { /* ignore */ }
  }
}
