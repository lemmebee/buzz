import { gatherContext } from "./context";
import { buildHiggsfieldPrompt, getCreativeAngleLabel } from "./prompt";
import { hfGenerateImage, hfGenerateVideoFromMedia, hfUploadFile, hfGetCost } from "./client";
import { getHiggsfieldImageModel, getHiggsfieldVideoModel, getClaudeCodeBin } from "@/lib/settings";
import { classifyProviderError, isTerminalProviderError } from "@/lib/providers/errors";
import { sanitizeCaption, type GenerateContentInput, type GeneratedPost, type GenerateContentResult, type GenerationFailure, type GenerationHooks } from "@/lib/generate";
import type { ContentConfig } from "@/lib/content/defaults";
import { invalidateMediaCache } from "./assets";
import { resolveAspectRatio, resolveDuration, buildMediasArray, supportsReferences } from "./capabilities";
import { getModelById } from "./models";
import type { ContentPurpose } from "@/lib/brain/types";
import { existsSync } from "fs";
import { join } from "path";

async function checkPrerequisites(modelId: string): Promise<string | null> {
  // Check Claude CLI binary
  const bin = await getClaudeCodeBin();
  if (!existsSync(bin)) {
    return `Claude Code CLI not found at \`${bin}\`. Set it in Settings → Advanced.`;
  }

  // Check MCP config
  const mcpConfigPath = join(process.cwd(), "higgsfield-mcp.json");
  if (!existsSync(mcpConfigPath)) {
    return `Higgsfield MCP config not found at \`${mcpConfigPath}\`.`;
  }

  // Check model in catalog
  const model = await getModelById(modelId);
  if (!model) {
    return `Model \`${modelId}\` is not in the Higgsfield catalog. Refresh models in Settings.`;
  }

  return null;
}

export async function generateHiggsfieldContent(
  input: GenerateContentInput & { config: ContentConfig },
  hooks?: GenerationHooks
): Promise<GenerateContentResult> {
  const { productId, targetSurface, config, targeting, count = 1, mediaType } = input;
  const generateCount = Math.min(Math.max(count, 1), 10);

  const posts: GeneratedPost[] = [];
  const errors: GenerationFailure[] = [];

  // Get the model to resolve capabilities
  const modelId = mediaType === "video" 
    ? await getHiggsfieldVideoModel()
    : await getHiggsfieldImageModel();

  // Pre-flight checks
  const prereqError = await checkPrerequisites(modelId);
  if (prereqError) {
    console.error(`[higgsfield] ${prereqError}`);
    // Return a single terminal error for all variations
    for (let i = 0; i < generateCount; i++) {
      errors.push({
        index: i,
        message: prereqError,
        terminal: true,
      });
    }
    return { posts, errors };
  }

  const model = await getModelById(modelId);
  if (!model) {
    // This shouldn't happen after checkPrerequisites, but handle it anyway
    for (let i = 0; i < generateCount; i++) {
      errors.push({
        index: i,
        message: `Model \`${modelId}\` not found in catalog`,
        terminal: true,
      });
    }
    return { posts, errors };
  }

  const ctx = await gatherContext({
    productId,
    targetSurface,
    mediaType,
    config,
    targeting,
  });

  // Resolve aspect ratio from model capabilities
  const aspectRatio = model 
    ? resolveAspectRatio(model, targetSurface as ContentPurpose)
    : targetSurface === "post" ? "1:1" : targetSurface === "ad" ? "4:5" : "9:16";

  // Build medias array from model capabilities
  const mediaIds: string[] = [];
  if (ctx.logoMediaId) {
    mediaIds.push(ctx.logoMediaId);
  }
  mediaIds.push(...ctx.screenshotMediaIds);

  const medias = model 
    ? buildMediasArray(model, mediaIds)
    : mediaIds.length > 0 
      ? [{ value: mediaIds[0], role: "image" }]
      : [];

  // Resolve duration for video
  const duration = mediaType === "video" && model
    ? resolveDuration(model, config.durationSec)
    : undefined;

  // Log generation parameters
  console.log(`[higgsfield] generating ${mediaType} with model ${modelId}, aspect ${aspectRatio}${duration ? `, duration ${duration}s` : ""}, ${medias.length} media(s)`);

  // Log if model doesn't support references but we have them
  if (model && !supportsReferences(model) && mediaIds.length > 0) {
    console.log(`[higgsfield] model ${modelId} does not support reference images, product assets will not be used`);
  }

  const usedAngles: string[] = [];

  for (let i = 0; i < generateCount; i++) {
    if (await hooks?.shouldCancel?.()) {
      console.log(`[higgsfield] cancel requested — stopping after ${posts.length}/${generateCount}`);
      break;
    }

    try {
      const p = await buildHiggsfieldPrompt(ctx, i, usedAngles);
      const angleLabel = getCreativeAngleLabel(i);

      let post: GeneratedPost;

      if (mediaType === "video") {
        // Video path: two-step chain
        // Step 1: Generate still image with product reference
        // Step 2: Animate with video model
        const imageModel = await getHiggsfieldImageModel();
        const videoModel = await getHiggsfieldVideoModel();

        if (medias.length === 0) {
          throw new Error("Video generation requires at least one reference image (logo or screenshot)");
        }

        // Cost preflight
        const videoCost = await hfGetCost("video", {
          prompt: p.motionPrompt,
          aspect_ratio: aspectRatio,
          ...(duration != null ? { duration } : {}),
        });
        console.log(`[higgsfield] video cost preflight: ${videoCost} credits${duration ? ` for ${duration}s` : ""}`);

        // Step 1: Generate still
        const img = await hfGenerateImage({
          prompt: p.imagePrompt,
          aspectRatio,
          medias: medias.length > 0 ? medias : undefined,
        });

        // Step 2: Upload the still to get a media_id for video
        const stillMediaId = await hfUploadFile(img.localPath, "image/png");
        console.log(`[higgsfield] uploaded still for video: ${stillMediaId}`);

        // Step 3: Animate
        const video = await hfGenerateVideoFromMedia({
          prompt: p.motionPrompt,
          mediaId: stillMediaId,
          aspectRatio,
          duration,
        });

        post = {
          content: sanitizeCaption(p.caption),
          hashtags: p.hashtags,
          mediaUrl: video.url,
          publicMediaUrl: video.url,
          duration: video.duration,
          config,
          metadata: {
            hookUsed: null,
            pillarUsed: null,
            targetType: null,
            targetValue: null,
            toneConstraints: [],
            visualDirection: `[higgsfield:${imageModel}+${videoModel}:video] ${angleLabel}`,
          },
        };
      } else {
        // Image path
        const model = await getHiggsfieldImageModel();
        const img = await hfGenerateImage({
          prompt: p.imagePrompt,
          aspectRatio,
          medias: medias.length > 0 ? medias : undefined,
        });

        post = {
          content: sanitizeCaption(p.caption),
          hashtags: p.hashtags,
          mediaUrl: img.url,
          publicMediaUrl: img.url,
          config,
          metadata: {
            hookUsed: null,
            pillarUsed: null,
            targetType: null,
            targetValue: null,
            toneConstraints: [],
            visualDirection: `[higgsfield:${model}] ${angleLabel}`,
          },
        };
      }

      posts.push(post);
      usedAngles.push(angleLabel);

      await hooks?.onPost?.(posts, errors);
    } catch (err) {
      const terminal = isTerminalProviderError(err);
      const rawMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[higgsfield] variation ${i + 1}/${generateCount} failed:`,
        rawMessage
      );
      // Preserve raw error text (including request IDs) for diagnosability
      const classified = classifyProviderError(err);
      const message = classified === "Something went wrong while generating content. Please try again, or switch the product to a different AI model."
        ? rawMessage
        : classified;
      errors.push({
        index: i,
        message,
        terminal,
      });

      // Self-heal: if medias were sent and generation failed, invalidate those cache rows
      // so the next run re-uploads instead of failing identically with a dead media_id.
      if (medias.length > 0) {
        const deadMediaIds = medias.map(m => m.value);
        await invalidateMediaCache(deadMediaIds);
      }

      await hooks?.onPost?.(posts, errors);
      if (terminal) break;
    }
  }

  return { posts, errors };
}
