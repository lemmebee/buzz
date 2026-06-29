import "dotenv/config";
import { readdirSync, writeFileSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { createRemotionVideoProvider } from "../src/lib/providers/video-remotion";

const MEDIA = join(process.cwd(), "public", "media");

function pick(ext: string, n: number): string[] {
  const files = readdirSync(MEDIA).filter((f) => f.endsWith(ext)).sort();
  if (files.length === 0) throw new Error(`no ${ext} assets in public/media`);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(join(MEDIA, files[Math.floor((i * files.length) / n)]));
  return out;
}

async function main() {
  const provider = createRemotionVideoProvider();
  console.log(`Provider: ${provider.name} (TYPOGRAPHY mode)\n`);

  // Typography uses a SINGLE background still + audio + synced caption text.
  const bg = pick(".jpg", 1)[0];
  const audioPath = pick(".mp3", 1)[0];

  const captionsPath = join(MEDIA, "captions-typotest.srt");
  writeFileSync(
    captionsPath,
    [
      "1", "00:00:00,200 --> 00:00:03,500", "Stop guessing where your money goes", "",
      "2", "00:00:03,500 --> 00:00:07,500", "Just say it out loud and it is logged", "",
      "3", "00:00:07,500 --> 00:00:11,000", "No spreadsheets no friction", "",
      "4", "00:00:11,000 --> 00:00:15,000", "Your calmest money habit yet", "",
    ].join("\n"),
    "utf-8"
  );

  const logoBase64 = readFileSync(bg).toString("base64");

  console.log("Background:", bg.split("/").pop());
  console.log("Audio     :", audioPath.split("/").pop());
  console.log("\nRendering typography video (headless Chrome)...\n");

  const t0 = Date.now();
  const result = await provider.generate({
    scenes: [{ imagePath: bg, durationSec: 15 }],
    audioPath,
    captionsPath,
    durationSec: 15,
    aspectRatio: "9:16",
    style: "typography",
    branding: { colors: "lime green and charcoal", handle: "@buzz_demo", logoDataUri: `data:image/jpeg;base64,${logoBase64}` },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const size = statSync(result.localPath!).size;
  console.log(`\n✅ Rendered in ${secs}s -> ${result.localPath} (${(size / 1024).toFixed(1)} KB)`);

  if (ffmpegStatic) {
    const probe = spawnSync(ffmpegStatic, ["-i", result.localPath!], { encoding: "utf-8" });
    const info = (probe.stderr || "").split("\n").filter((l) => /Duration|Stream/.test(l)).join("\n");
    console.log("\n--- probe ---\n" + info);
  }
  console.log("\nOUTPUT_PATH=" + result.localPath);
}

main().catch((err) => { console.error("\n❌ failed:\n", err); process.exit(1); });
