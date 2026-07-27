import { eq } from "drizzle-orm";
import { basename, join } from "path";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import {
  resolveTextProvider,
  resolveImageProvider,
  createAudioProvider,
  createVideoProvider,
  listImageProviderNames,
  imagesAvailable,
} from "@/lib/providers";
import { transcribeToSrt } from "@/lib/captions";
import { getVideoProvider } from "@/lib/settings";
import { classifyProviderError, isTerminalProviderError } from "@/lib/providers/errors";
import { trace, timed } from "@/lib/traces";
import {
  sanitizeCaption,
  type GenerateContentInput,
  type GeneratedPost,
  type GenerateContentResult,
  type GenerationFailure,
  type GenerationHooks,
} from "@/lib/generate";
import type { ContentConfig } from "@/lib/content/defaults";
import { prepareImages } from "@/lib/images";

const MEDIA_URL_PREFIX = "/api/media/";

interface VideoGenerated {
  caption: string;
  hashtags?: string[];
  script?: unknown;
  scenes?: { description?: unknown; durationSec?: number }[];
}

// Cinematographic angles applied per-index to fallback scenes so visuals diverge
// even when narration text is the same.
const SCENE_VARIATIONS = [
  "extreme close-up, shallow depth of field, intimate detail",
  "wide establishing shot, environmental context, open space",
  "over-the-shoulder POV, subject foregrounded, soft bokeh",
  "top-down flat-lay composition, geometric arrangement",
  "low-angle hero shot, dramatic lighting from above",
  "side profile, subject mid-action, motion blur edges",
  "abstract macro detail, texture and pattern",
  "high-key minimal composition, generous negative space",
];

function splitIntoChunks(text: string, n: number): string[] {
  if (n <= 1) return [text.trim()];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let chunks: string[];
  if (sentences.length === 0) {
    chunks = Array(n).fill(text.trim());
  } else if (sentences.length >= n) {
    const per = Math.ceil(sentences.length / n);
    chunks = [];
    for (let i = 0; i < n; i++) {
      const c = sentences.slice(i * per, (i + 1) * per).join(" ");
      chunks.push(c || sentences[i % sentences.length]);
    }
  } else {
    chunks = [...sentences];
    while (chunks.length < n) chunks.push(sentences[chunks.length % sentences.length]);
  }

  // Append per-index cinematographic variation so Flux gets distinct prompts
  return chunks.map((c, i) => `${c} - ${SCENE_VARIATIONS[i % SCENE_VARIATIONS.length]}`);
}

function coerceText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(coerceText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    return Object.values(obj).map(coerceText).filter(Boolean).join(" ");
  }
  return "";
}

// Video flux prompt: storyline-friendly, allows people/hands/faces, brand color hint only
function buildVideoFluxPrompt(
  sceneDescription: string,
  aspectRatio: string,
  brandColors?: string,
  brandMood?: string
): string {
  const parts: string[] = [sceneDescription];
  parts.push(`Vertical ${aspectRatio} cinematic frame, photo-realistic, natural lighting, shallow depth of field.`);
  if (brandMood) parts.push(`Mood: ${brandMood}.`);
  if (brandColors) parts.push(`Subtle color accents: ${brandColors}.`);
  parts.push("No on-screen text, no captions, no logos, no watermarks.");
  return parts.join(" ");
}

// Pull a usable hex palette out of the brand's free-text color description for
// the deterministic typography fallback (which has no LLM to choose colors).
// First two #RRGGBB found become accent/bg-ish; sensible dark defaults otherwise.
function derivePalette(colors: string | undefined): { bg: string; accent: string; text: string } {
  const hexes = (colors?.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase());
  const accent = hexes[0] ?? "#ffd60a";
  const bg = hexes[1] ?? "#0b0b0f";
  return { bg, accent, text: "#ffffff" };
}

function aspectRatioToDims(ratio: string): { w: number; h: number } {
  switch (ratio) {
    case "9:16": return { w: 1080, h: 1920 };
    case "16:9": return { w: 1920, h: 1080 };
    case "4:5": return { w: 1080, h: 1350 };
    case "1:1":
    default: return { w: 1080, h: 1080 };
  }
}

function urlPathToFs(urlPath: string): string {
  const filename = urlPath.replace(/^\/api\/media\//, "");
  return join(process.cwd(), "public", "media", filename);
}

export async function generateVideoContent(
  input: GenerateContentInput & { config: ContentConfig },
  hooks?: GenerationHooks
): Promise<GenerateContentResult> {
  const { productId, platform, targetSurface, config, targeting, count = 1, images = [] } = input;
  const generateCount = Math.min(Math.max(count, 1), 10);
  const targetDuration = config.durationSec ?? 15;
  const videoStyle =
    config.videoStyle === "typography" ? "typography" : config.videoStyle === "creative" ? "creative" : "scenes";
  // Typography mode renders the narration as on-screen text, so it always needs
  // the synced SRT regardless of the burn-in-captions toggle.
  const wantCaptions = videoStyle === "typography" ? true : Boolean(config.captions);

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });
  if (!product) throw new Error("Product not found");
  if (!product.profile || !product.marketingStrategy) {
    throw new Error("Product missing profile or marketingStrategy");
  }

  const rawProfile = JSON.parse(product.profile);
  const rawStrategy = JSON.parse(product.marketingStrategy);
  const profile = normalizeProfile(rawProfile);
  const marketingStrategy = normalizeStrategy(rawStrategy);

  let accountHandle: string | undefined;
  if (product.instagramAccountId) {
    const igAccount = await db.query.instagramAccounts.findFirst({
      where: eq(schema.instagramAccounts.id, product.instagramAccountId),
    });
    if (igAccount?.username) accountHandle = `@${igAccount.username}`;
  }

  const textProvider = await resolveTextProvider(product.textProvider);

  const logoImages = product.logo
    ? await prepareImages([product.logo], { maxImages: 1, maxWidth: 512, maxHeight: 512, quality: 80 })
    : [];
  const allImages = [...logoImages.map((l) => l.base64), ...images];
  const hasLogo = logoImages.length > 0;

  const { prompt: basePrompt, metadata } = buildContentGenerationPrompt(
    rawProfile,
    rawStrategy,
    images.length,
    platform,
    targetSurface,
    targeting,
    accountHandle,
    product.name,
    product.llmInstructions || undefined,
    undefined,
    hasLogo
  );

  const sceneCount = videoStyle === "typography"
    ? 1
    : Math.max(2, Math.min(6, Math.ceil(targetDuration / 4)));

  // ~2.5 words/sec natural TTS pace (cap a bit higher). An LLM can't gauge
  // speaking time from "~N seconds", so give it an explicit WORD budget —
  // otherwise the narration overruns the chosen duration and the voiceover gets
  // cut off at render time.
  const scriptWordBudget = Math.round(targetDuration * 2.5);
  const scriptWordMax = Math.round(targetDuration * 2.9);

  const scenesStoryboardInstructions = `- "scenes": ARRAY of EXACTLY ${sceneCount} scene objects forming a STORYLINE that follows the script beat by beat:
  - Scene 1 = hook moment (the relatable opening tension/curiosity)
  - Middle scenes = progression (problem -> realization -> action)
  - Final scene = payoff/CTA visual
  - Each scene MUST depict a DIFFERENT concrete moment with DIFFERENT subject / location / action. NEVER repeat.
  - Prefer real-world relatable subjects: people in scenarios, hands using a phone, journals, nature, environments. Show humans, faces, hands, products. Concrete > abstract.
  - "description": cinematic shot description for AI image generation in ${config.aspectRatio} aspect ratio. Include: subject, action, location, lighting, framing, mood. Each description must read like a different storyboard panel.
  - "durationSec": number, MUST sum across all ${sceneCount} scenes to ${targetDuration}`;

  const typographyInstructions = `- "scenes": ARRAY of EXACTLY 1 scene object - a single ATMOSPHERIC BACKGROUND that the narration text will be overlaid on top of:
  - "description": one cinematic background image for AI image generation in ${config.aspectRatio} aspect ratio. Make it evocative and on-brand but CALM and UNCLUTTERED, with generous negative space and soft contrast so large text stays readable on top. Think: textured surface, soft-focus environment, gradient lighting, abstract scene - NOT a busy storyboard moment. NO people speaking, NO on-screen text.
  - "durationSec": ${targetDuration}`;

  const videoInstructions = `

ADDITIONAL VIDEO REQUIREMENTS:
- Output JSON with keys: caption, hashtags, script, scenes
- "script": spoken narration only - what the voiceover SAYS, not the caption. It MUST fit ${targetDuration} seconds of natural speech: aim for ~${scriptWordBudget} words, HARD MAXIMUM ${scriptWordMax} words. Going over makes the voiceover get cut off. NO emojis, NO hashtags inside script.${videoStyle === "typography" ? "\n  The script is ALSO shown as large animated on-screen typography, so make it punchy and quotable - short, high-impact sentences." : ""}
${videoStyle === "typography" ? typographyInstructions : scenesStoryboardInstructions}
- Brand visual style hint (use sparingly, do NOT make every scene abstract): ${profile.visualIdentity.style}; colors: ${profile.visualIdentity.colors}; mood: ${profile.visualIdentity.mood}
${marketingStrategy.visualDirection ? `- Visual direction: ${marketingStrategy.visualDirection}` : ""}
- IMPORTANT: caption is the IG caption shown under the post. script is the audio narration. They are DIFFERENT texts and serve different purposes - do not duplicate them.
`;

  const systemPrompt = basePrompt + videoInstructions;

  const userPrompt = generateCount > 1
    ? `Generate ${generateCount} unique variations. Return a valid JSON array.`
    : `Generate the content now. Return valid JSON only.`;

  const textResult = await timed(
    {
      productId,
      phase: "prompt",
      step: "video-script-authoring",
      engine: "buzz",
      provider: textProvider.name,
      model: textProvider.name,
      input: JSON.stringify({
        systemPrompt,
        userPrompt,
        variations: generateCount,
        imagesAttached: allImages.length,
      }),
    },
    () =>
      textProvider.generate({
        systemPrompt,
        userPrompt,
        images: allImages.length > 0 ? allImages : undefined,
        maxTokens: 4096 * generateCount,
        temperature: 0.9,
      })
  );

  await trace({
    productId,
    phase: "prompt",
    step: "video-script-response",
    engine: "buzz",
    provider: textProvider.name,
    status: "ok",
    output: JSON.stringify({ text: textResult.text }),
  });

  const cleaned = textResult.text.replace(/```(?:json)?\s*/gi, "").trim();
  let items: VideoGenerated[];
  if (generateCount > 1) {
    const arr = cleaned.match(/\[[\s\S]*\]/);
    if (!arr) throw new Error("Failed to parse video array response");
    items = JSON.parse(arr[0]);
  } else {
    const obj = cleaned.match(/\{[\s\S]*\}/);
    if (!obj) throw new Error("Failed to parse video response");
    items = [JSON.parse(obj[0])];
  }

  const audioProvider = createAudioProvider();
  const videoProvider = createVideoProvider(product.videoProvider || (await getVideoProvider()));
  const imageProvider = await resolveImageProvider(product.imageProvider);
  const dims = aspectRatioToDims(config.aspectRatio);

  const buildVideoPost = async (item: VideoGenerated): Promise<GeneratedPost> => {
    const scriptText = coerceText(item.script).trim() || coerceText(item.caption).trim() || product.name;
    const captionText = coerceText(item.caption).trim() || product.name;

    const rawScenes = (item.scenes || [])
      .map((s) => ({
        description: coerceText(s.description).trim(),
        durationSec: s.durationSec,
      }))
      .filter((s) => s.description.length > 0);

    // If LLM under-delivered scene count, split script into chunks as fallback descriptions
    let finalScenes: { description: string; durationSec?: number }[];
    if (rawScenes.length >= sceneCount) {
      finalScenes = rawScenes;
    } else if (rawScenes.length > 0) {
      const need = sceneCount - rawScenes.length;
      const fillers = splitIntoChunks(scriptText, need).map((chunk) => ({
        description: chunk || captionText,
        durationSec: targetDuration / sceneCount,
      }));
      finalScenes = [...rawScenes, ...fillers];
    } else {
      finalScenes = splitIntoChunks(scriptText, sceneCount).map((chunk) => ({
        description: chunk || captionText,
        durationSec: targetDuration / sceneCount,
      }));
    }

    console.log(`[video] generating ${finalScenes.length} scenes for ${targetSurface}/${config.aspectRatio}/${targetDuration}s`);
    finalScenes.forEach((s, i) => {
      console.log(`[video] scene ${i + 1}: ${s.description.slice(0, 100)} (${s.durationSec ?? "?"}s)`);
    });
    const sceneSpecs: { imagePath: string; durationSec: number }[] = [];
    let totalDur = 0;
    for (const sc of finalScenes) {
      const fluxPrompt = buildVideoFluxPrompt(
        sc.description,
        config.aspectRatio,
        profile.visualIdentity?.colors,
        profile.visualIdentity?.mood
      );
      const imgResult = await imageProvider.generate({
        prompt: fluxPrompt,
        width: dims.w,
        height: dims.h,
      });
      const fsPath = imgResult.localPath ? urlPathToFs(imgResult.localPath) : "";
      const dur = Number.isFinite(sc.durationSec) && (sc.durationSec ?? 0) > 0
        ? Number(sc.durationSec)
        : targetDuration / finalScenes.length;
      sceneSpecs.push({ imagePath: fsPath, durationSec: dur });
      totalDur += dur;
    }

    // Normalize: scale durations to match target if drift
    if (totalDur > 0 && Math.abs(totalDur - targetDuration) > 0.5) {
      const scale = targetDuration / totalDur;
      for (const s of sceneSpecs) s.durationSec = s.durationSec * scale;
    }

    const audioResult = await audioProvider.generate({ script: scriptText });
    const audioFsPath = audioResult.localPath || "";

    let captionsFsPath: string | undefined;
    let captionsUrl: string | null = null;
    if (wantCaptions && audioFsPath) {
      const srtPath = await transcribeToSrt(audioFsPath);
      if (srtPath) {
        captionsFsPath = srtPath;
        captionsUrl = `${MEDIA_URL_PREFIX}${basename(srtPath)}`;
      }
    }

    sceneSpecs.forEach((s, i) => {
      console.log(`[video] compose input ${i + 1}: ${s.imagePath} (${s.durationSec.toFixed(2)}s)`);
    });
    const videoResult = await videoProvider.generate({
      scenes: sceneSpecs,
      audioPath: audioFsPath,
      captionsPath: captionsFsPath,
      durationSec: targetDuration,
      aspectRatio: config.aspectRatio,
      // The fixed composition only knows scenes/typography; "creative" reaches
      // here only as the fallback, which renders as scenes.
      style: videoStyle === "typography" ? "typography" : "scenes",
      // Optional branding consumed by the Remotion engine (ignored by ffmpeg):
      // brand-color caption highlights + a logo/handle lower-third.
      branding: {
        colors: profile.visualIdentity?.colors,
        mood: profile.visualIdentity?.mood,
        style: profile.visualIdentity?.style,
        handle: accountHandle,
        logoDataUri: hasLogo && logoImages[0]
          ? `data:image/jpeg;base64,${logoImages[0].base64}`
          : undefined,
      },
    });

    const videoUrlPath = videoResult.localPath
      ? `${MEDIA_URL_PREFIX}${basename(videoResult.localPath)}`
      : videoResult.url;

    return {
      content: sanitizeCaption(coerceText(item.caption)),
      hashtags: (item.hashtags || []).map((t) => coerceText(t).replace(/^#+/, "")),
      mediaUrl: videoUrlPath,
      publicMediaUrl: videoResult.url,
      script: scriptText || null,
      duration: videoResult.duration ?? targetDuration,
      audioUrl: audioResult.url,
      captionsUrl,
      config,
      metadata,
    };
  };

  // "creative" style: the LLM authors a bespoke video spec from the (already
  // written) script + brand, rendered by the flexible Remotion composition.
  // Any failure (no key, authoring invalid, render error) falls back to the
  // fixed scene composition so a post is always produced.
  const buildCreativePost = async (item: VideoGenerated): Promise<GeneratedPost | null> => {
    const scriptText = coerceText(item.script).trim() || coerceText(item.caption).trim() || product.name;
    const vibe =
      [profile.visualIdentity?.mood, profile.visualIdentity?.style, marketingStrategy.visualDirection]
        .filter(Boolean)
        .join("; ") || "modern, bold, on-brand";

    const { renderBestVideo } = await import("@/lib/video/select");

    // Pre-flight: if every configured image provider is out of credits, tell the
    // creative director to design a cohesive text-only video instead of an image
    // video whose every scene silently degrades to flat color.
    const imageNames = await listImageProviderNames(product.imageProvider);
    const imagesAvail = imagesAvailable(imageNames);

    // Real product screenshots (credit-free), as staticFile-relative paths. The
    // director can show the ACTUAL app via bgKind:"product" instead of FLUX
    // hallucinating a wrong one.
    const productShots: string[] = (() => {
      try {
        const arr = JSON.parse(product.screenshots || "[]");
        return Array.isArray(arr)
          ? arr.map((s: unknown) => String(s).replace(/^\/api\/media\//, "media/")).filter(Boolean)
          : [];
      } catch {
        return [];
      }
    })();

    // The creative director is the USER'S selected text provider (resolved at the
    // top of generateContent) — never hardcoded. Best-of-N + judge with a
    // deterministic typography floor so a creative run is never lost.
    await trace({
      productId,
      phase: "generate",
      step: "video-director",
      engine: "buzz",
      provider: textProvider.name,
      status: "ok",
      input: JSON.stringify({
        script: scriptText,
        aspectRatio: config.aspectRatio,
        durationSec: targetDuration,
        vibe,
        productShots,
        imagesAvailable: imagesAvail,
        candidates: 3,
      }),
    });

    const r = await renderBestVideo({
      textProvider,
      productName: product.name,
      profile: rawProfile,
      strategy: rawStrategy,
      vibe,
      aspectRatio: config.aspectRatio,
      durationSec: targetDuration,
      script: scriptText,
      imagesAvailable: imagesAvail,
      productShots: productShots.length,
      productShotPaths: productShots,
      fallbackPalette: derivePalette(profile.visualIdentity?.colors),
      imageProviderName: product.imageProvider,
      n: 3,
    });
    console.log(
      `[video] rendered via ${r.source} (${r.valid} valid) from ${textProvider.name}, images=${imagesAvail}, productShots=${productShots.length}`
    );
    return {
      content: sanitizeCaption(coerceText(item.caption)),
      hashtags: (item.hashtags || []).map((t) => coerceText(t).replace(/^#+/, "")),
      mediaUrl: r.url,
      publicMediaUrl: r.url,
      script: scriptText || null,
      duration: r.duration,
      audioUrl: r.audioUrl,
      captionsUrl: r.captionsUrl,
      config,
      metadata,
    };
  };

  const buildPost = async (item: VideoGenerated): Promise<GeneratedPost> => {
    if (videoStyle === "creative") {
      try {
        const post = await buildCreativePost(item);
        if (post) return post;
      } catch (err) {
        console.warn(
          `[video] creative render failed, falling back to scenes: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    return buildVideoPost(item);
  };

  const posts: GeneratedPost[] = [];
  const errors: GenerationFailure[] = [];
  for (let i = 0; i < items.length; i++) {
    if (await hooks?.shouldCancel?.()) {
      console.log(`[video] cancel requested — stopping after ${posts.length}/${items.length}`);
      break;
    }
    try {
      posts.push(await buildPost(items[i]));
      await hooks?.onPost?.(posts, errors);
    } catch (err) {
      const terminal = isTerminalProviderError(err);
      console.error(
        `[video] variation ${i + 1}/${items.length} failed:`,
        err instanceof Error ? err.message : err
      );
      errors.push({ index: i, message: classifyProviderError(err), terminal });
      await hooks?.onPost?.(posts, errors);
      if (terminal) break; // credits/quota/auth gone — the rest will fail too
    }
  }

  return { posts, errors };
}
