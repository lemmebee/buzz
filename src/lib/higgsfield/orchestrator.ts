import { gatherContext } from "./context";
import { buildHiggsfieldPrompt, getCreativeAngleLabel } from "./prompt";
import { hfGenerateImage } from "./client";
import { getHiggsfieldImageModel, getClaudeCodeBin } from "@/lib/settings";
import { classifyProviderError, isTerminalProviderError } from "@/lib/providers/errors";
import { sanitizeCaption, type GenerateContentInput, type GeneratedPost, type GenerateContentResult, type GenerationFailure, type GenerationHooks } from "@/lib/generate";
import type { ContentConfig } from "@/lib/content/defaults";
import { invalidateMediaCache } from "./assets";
import { resolveAspectRatio, buildMediasArray, supportsReferences } from "./capabilities";
import { getModelById } from "./models";
import type { ContentPurpose } from "@/lib/brain/types";
import { existsSync } from "fs";
import { join } from "path";
import { trace } from "@/lib/traces";

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
  const modelId = await getHiggsfieldImageModel();

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

  // Trace context phase
  await trace({
    productId,
    phase: "context",
    engine: "higgsfield",
    input: JSON.stringify({
      targetSurface,
      mediaType,
      hasPlanFile: !!ctx.planFile,
      hasProfile: !!ctx.profile,
      hasStrategy: !!ctx.marketingStrategy,
      hasIcp: !!ctx.icp,
      hasJtbd: !!ctx.jtbd,
      brainstormIdeasCount: ctx.brainstormIdeas.length,
      instagramHandle: ctx.instagramHandle,
      screenshotCount: ctx.screenshotMediaIds.length,
      hasLogo: !!ctx.logoMediaId,
    }),
    status: "ok",
  });

  // Resolve aspect ratio from model capabilities
  const aspectRatio = model 
    ? resolveAspectRatio(model, targetSurface as ContentPurpose)
    : targetSurface === "post" ? "1:1" : targetSurface === "ad" ? "4:5" : "9:16";

  // Build medias array from model capabilities
  // Order: screenshots first, logo last (logo is a wordmark, screenshots are the product)
  const mediaIds: string[] = [];
  mediaIds.push(...ctx.screenshotMediaIds);
  if (ctx.logoMediaId) {
    mediaIds.push(ctx.logoMediaId);
  }

  const medias = model 
    ? buildMediasArray(model, mediaIds)
    : mediaIds.length > 0 
      ? [{ value: mediaIds[0], role: "image" }]
      : [];

  // Log which asset was selected
  if (medias.length > 0) {
    const selectedScreenshot = ctx.screenshotMediaIds.length > 0;
    const hasLogo = !!ctx.logoMediaId;
    if (selectedScreenshot && hasLogo) {
      console.log(`[higgsfield] reference: screenshot 1 of ${ctx.screenshotMediaIds.length} (logo available but deprioritised)`);
    } else if (selectedScreenshot) {
      console.log(`[higgsfield] reference: screenshot 1 of ${ctx.screenshotMediaIds.length}`);
    } else if (hasLogo) {
      console.log(`[higgsfield] reference: logo (no screenshots available)`);
    }
  }

  // Trace assets phase
  await trace({
    productId,
    phase: "assets",
    engine: "higgsfield",
    input: JSON.stringify({
      screenshotCount: ctx.screenshotMediaIds.length,
      hasLogo: !!ctx.logoMediaId,
      maxReferences: model ? (model.medias?.[0]?.max ?? 1) : 1,
    }),
    output: JSON.stringify({
      selectedMedias: medias,
      // The paths behind the ids, so the trace shows the actual reference
      // image rather than an opaque uuid.
      assetsSent: medias.map((m) => ctx.mediaIdToPath[m.value]).filter(Boolean),
      assetsAvailable: Object.values(ctx.mediaIdToPath),
      selectionReason: ctx.screenshotMediaIds.length > 0
        ? "screenshot-first (logo deprioritised)"
        : ctx.logoMediaId
          ? "logo (no screenshots)"
          : "no assets",
    }),
    status: "ok",
  });

  // Log generation parameters
  console.log(`[higgsfield] generating ${mediaType} with model ${modelId}, aspect ${aspectRatio}, ${medias.length} media(s)`);

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

      // Trace prompt phase
      await trace({
        productId,
        phase: "prompt",
        engine: "higgsfield",
        provider: ctx.textProvider || "default",
        variationIndex: i,
        input: JSON.stringify({
          creativeAngle: angleLabel,
          hasReferenceImage: !!(ctx.logoMediaId || ctx.screenshotMediaIds.length > 0),
        }),
        output: JSON.stringify({
          imagePrompt: p.imagePrompt,
          motionPrompt: p.motionPrompt,
          caption: p.caption,
          hashtags: p.hashtags,
        }),
        status: "ok",
      });

      const model = await getHiggsfieldImageModel();
      const img = await hfGenerateImage({
        prompt: p.imagePrompt,
        aspectRatio,
        medias: medias.length > 0 ? medias : undefined,
      });

      // Trace generate phase (image generation)
      await trace({
        productId,
        phase: "generate",
        step: "text-to-image",
        engine: "higgsfield",
        provider: "higgsfield",
        model,
        variationIndex: i,
        input: JSON.stringify({
          aspectRatio,
          mediaCount: medias.length,
        }),
        output: JSON.stringify({
          url: img.url,
        }),
        status: "ok",
      });

      const post: GeneratedPost = {
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
          engine: "higgsfield",
          provider: "higgsfield",
          model,
        },
      };

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
