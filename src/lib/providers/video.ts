import { mkdirSync } from "fs";
import { join } from "path";
import { compose } from "@/lib/video/compose";
import type { VideoProvider, VideoGenerationInput, VideoGenerationOutput } from "./types";

export function createFfmpegVideoProvider(): VideoProvider {
  return {
    name: "ffmpeg",

    async generate(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
      const { scenes, audioPath, captionsPath, aspectRatio, durationSec } = input;
      if (!scenes || scenes.length === 0) {
        throw new Error("ffmpeg video provider requires non-empty scenes");
      }
      if (!audioPath) {
        throw new Error("ffmpeg video provider requires audioPath");
      }

      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });
      const filename = `video-${Date.now()}.mp4`;
      const outputPath = join(mediaDir, filename);

      await compose({ scenes, audioPath, captionsPath, outputPath, aspectRatio });

      return {
        url: `/api/media/${filename}`,
        localPath: outputPath,
        duration: durationSec,
      };
    },
  };
}
