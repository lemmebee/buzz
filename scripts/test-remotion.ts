import "dotenv/config";
import { readdirSync, writeFileSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { createRemotionVideoProvider } from "../src/lib/providers/video-remotion";

const MEDIA = join(process.cwd(), "public", "media");

function pick(ext: string, n: number): string[] {
  const files = readdirSync(MEDIA)
    .filter((f) => f.endsWith(ext))
    .sort();
  if (files.length === 0) throw new Error(`no ${ext} assets in public/media to test with`);
  // spread across the list
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(join(MEDIA, files[Math.floor((i * files.length) / n)]));
  return out;
}

async function main() {
  const provider = createRemotionVideoProvider();
  console.log(`Provider: ${provider.name}\n`);

  const scenes = pick(".jpg", 4).map((imagePath) => ({ imagePath, durationSec: 3.75 }));
  const audioPath = pick(".mp3", 1)[0];

  // Hand-written SRT to exercise the kinetic-caption path.
  const captionsPath = join(MEDIA, "captions-remotest.srt");
  writeFileSync(
    captionsPath,
    [
      "1",
      "00:00:00,200 --> 00:00:04,000",
      "Meet the tool that changes everything",
      "",
      "2",
      "00:00:04,000 --> 00:00:09,000",
      "Built for creators who move fast",
      "",
      "3",
      "00:00:09,000 --> 00:00:15,000",
      "Try it today and feel the difference",
      "",
    ].join("\n"),
    "utf-8"
  );

  // Use one still as a fake logo data URI to exercise the lower-third.
  const logoBase64 = readFileSync(scenes[0].imagePath).toString("base64");

  console.log("Scenes:", scenes.map((s) => s.imagePath.split("/").pop()).join(", "));
  console.log("Audio :", audioPath.split("/").pop());
  console.log("\nRendering (this drives headless Chrome — may take a while)...\n");

  const t0 = Date.now();
  const result = await provider.generate({
    scenes,
    audioPath,
    captionsPath,
    durationSec: 15,
    aspectRatio: "9:16",
    branding: {
      colors: "deep teal and gold",
      handle: "@buzz_demo",
      logoDataUri: `data:image/jpeg;base64,${logoBase64}`,
    },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const size = statSync(result.localPath!).size;
  console.log(`\n✅ Rendered in ${secs}s`);
  console.log(`   url:       ${result.url}`);
  console.log(`   localPath: ${result.localPath}`);
  console.log(`   size:      ${(size / 1024).toFixed(1)} KB`);

  // Probe the output with ffmpeg -i (ffmpeg-static has no ffprobe, but -i prints
  // stream info to stderr: dimensions, duration, and audio stream presence).
  if (ffmpegStatic) {
    const probe = spawnSync(ffmpegStatic, ["-i", result.localPath!], { encoding: "utf-8" });
    const info = (probe.stderr || "")
      .split("\n")
      .filter((l) => /Duration|Stream|Video:|Audio:/.test(l))
      .join("\n");
    console.log("\n--- ffmpeg probe ---\n" + info);
  }
}

main().catch((err) => {
  console.error("\n❌ Render test failed:\n", err);
  process.exit(1);
});
