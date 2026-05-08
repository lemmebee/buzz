import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

export interface ComposeInput {
  scenes: { imagePath: string; durationSec: number }[];
  audioPath: string;
  captionsPath?: string;
  outputPath: string;
  aspectRatio: string;
}

function dimensionsFor(aspectRatio: string): { w: number; h: number } {
  switch (aspectRatio) {
    case "9:16": return { w: 1080, h: 1920 };
    case "16:9": return { w: 1920, h: 1080 };
    case "4:5": return { w: 1080, h: 1350 };
    case "1:1":
    default: return { w: 1080, h: 1080 };
  }
}

function escapeForSubtitlesFilter(p: string): string {
  return p
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

// Composes scenes into an mp4. ffmpeg runs in an OS child process,
// so the Node event loop is not blocked while we await this Promise.
export function compose(input: ComposeInput): Promise<string> {
  const { scenes, audioPath, captionsPath, outputPath, aspectRatio } = input;
  if (scenes.length === 0) return Promise.reject(new Error("at least one scene required"));

  const { w, h } = dimensionsFor(aspectRatio);
  const fps = 25;

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    for (const scene of scenes) {
      cmd.input(scene.imagePath).inputOptions(["-loop 1", `-t ${scene.durationSec}`]);
    }
    cmd.input(audioPath);

    const filters: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      // d=1 makes zoompan emit one output per input frame (rather than d outputs per input,
      // which would massively duplicate). Zoom accumulates via z=zoom+step until capped.
      filters.push(
        `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+0.0008,1.2)':d=1:s=${w}x${h}:fps=${fps},setsar=1[v${i}]`
      );
    }
    const concatInputs = scenes.map((_, i) => `[v${i}]`).join("");
    const useCaptions = Boolean(captionsPath);
    const concatOutLabel = useCaptions ? "vc" : "vout";
    filters.push(`${concatInputs}concat=n=${scenes.length}:v=1:a=0[${concatOutLabel}]`);
    if (useCaptions) {
      // Centered bold captions. ASS default PlayResY=288 scales to actual video height,
      // so FontSize is in 288-unit space. Keep small numbers to avoid massive text.
      // Alignment=5 = horizontally + vertically centered.
      const fontSize = aspectRatio === "9:16" ? 14 : 12;
      const sideMargin = 20;
      const style = [
        "Alignment=10",
        "FontName=Arial Black",
        `FontSize=${fontSize}`,
        "Bold=1",
        "PrimaryColour=&H00FFFFFF&",
        "OutlineColour=&H00000000&",
        "BackColour=&H00000000&",
        "BorderStyle=1",
        "Outline=2",
        "Shadow=1",
        "MarginV=0",
        `MarginL=${sideMargin}`,
        `MarginR=${sideMargin}`,
      ].join(",");
      filters.push(
        `[vc]subtitles='${escapeForSubtitlesFilter(captionsPath!)}':force_style='${style}'[vout]`
      );
    }

    const audioIdx = scenes.length;
    cmd
      .complexFilter(filters, "vout")
      .outputOptions([
        `-map ${audioIdx}:a`,
        "-c:v libx264",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-shortest",
        `-r ${fps}`,
      ])
      .save(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err));
  });
}
