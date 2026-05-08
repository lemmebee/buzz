import { eq } from "drizzle-orm";
import { basename, join } from "path";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import {
  createTextProvider,
  createPollinationsImageProvider,
  createAudioProvider,
  createVideoProvider,
} from "@/lib/providers";
import { getTextProvider as getDefaultTextProvider } from "@/lib/settings";
import { transcribeToSrt } from "@/lib/captions";
import { sanitizeCaption, type GenerateContentInput, type GeneratedPost } from "@/lib/generate";
import type { ContentConfig } from "@/lib/content/defaults";

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
  input: GenerateContentInput & { config: ContentConfig }
): Promise<GeneratedPost[]> {
  const { productId, platform, targetSurface, config, targeting, count = 1, images = [] } = input;
  const generateCount = Math.min(Math.max(count, 1), 10);
  const targetDuration = config.durationSec ?? 15;
  const wantCaptions = Boolean(config.captions);

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

  const textProvider = createTextProvider(product.textProvider || (await getDefaultTextProvider()));
  const { prompt: basePrompt, metadata } = buildContentGenerationPrompt(
    rawProfile,
    rawStrategy,
    images.length,
    platform,
    targetSurface,
    targeting,
    accountHandle,
    product.name
  );

  const sceneCount = Math.max(2, Math.min(6, Math.ceil(targetDuration / 4)));
  const videoInstructions = `

ADDITIONAL VIDEO REQUIREMENTS:
- Output JSON with keys: caption, hashtags, script, scenes
- "script": spoken narration only - what the voiceover SAYS, not the caption. Pace for ~${targetDuration} seconds at natural speaking rate. NO emojis, NO hashtags inside script.
- "scenes": ARRAY of EXACTLY ${sceneCount} scene objects forming a STORYLINE that follows the script beat by beat:
  - Scene 1 = hook moment (the relatable opening tension/curiosity)
  - Middle scenes = progression (problem -> realization -> action)
  - Final scene = payoff/CTA visual
  - Each scene MUST depict a DIFFERENT concrete moment with DIFFERENT subject / location / action. NEVER repeat.
  - Prefer real-world relatable subjects: people in scenarios, hands using a phone, journals, nature, environments. Show humans, faces, hands, products. Concrete > abstract.
  - "description": cinematic shot description for AI image generation in ${config.aspectRatio} aspect ratio. Include: subject, action, location, lighting, framing, mood. Each description must read like a different storyboard panel.
  - "durationSec": number, MUST sum across all ${sceneCount} scenes to ${targetDuration}
- Brand visual style hint (use sparingly, do NOT make every scene abstract): ${profile.visualIdentity.style}; colors: ${profile.visualIdentity.colors}; mood: ${profile.visualIdentity.mood}
${marketingStrategy.visualDirection ? `- Visual direction: ${marketingStrategy.visualDirection}` : ""}
- IMPORTANT: caption is the IG caption shown under the post. script is the audio narration. They are DIFFERENT texts and serve different purposes - do not duplicate them.
`;

  const systemPrompt = basePrompt + videoInstructions;

  const userPrompt = generateCount > 1
    ? `Generate ${generateCount} unique variations. Return a valid JSON array.`
    : `Generate the content now. Return valid JSON only.`;

  const textResult = await textProvider.generate({
    systemPrompt,
    userPrompt,
    images: images.length > 0 ? images : undefined,
    maxTokens: 4096 * generateCount,
    temperature: 0.9,
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
  const videoProvider = createVideoProvider();
  const imageProvider = createPollinationsImageProvider();
  const dims = aspectRatioToDims(config.aspectRatio);

  const posts: GeneratedPost[] = [];

  for (const item of items) {
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
    });

    const videoUrlPath = videoResult.localPath
      ? `${MEDIA_URL_PREFIX}${basename(videoResult.localPath)}`
      : videoResult.url;

    posts.push({
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
    });
  }

  if (posts.length === 0) throw new Error("Failed to generate any video content");
  return posts;
}
