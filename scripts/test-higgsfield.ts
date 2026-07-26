import "dotenv/config";
import {
  hfGenerateImage,
  hfGenerateVideo,
  hfGetCost,
  hfBalance,
  hfExploreModel,
} from "../src/lib/higgsfield/client";
import { ensureProductAssetsUploaded } from "../src/lib/higgsfield/assets";
import { gatherContext } from "../src/lib/higgsfield/context";
import { buildHiggsfieldPrompt } from "../src/lib/higgsfield/prompt";
import { generateHiggsfieldContent } from "../src/lib/higgsfield/orchestrator";
import { getDefaults } from "../src/lib/content/defaults";
import { refreshModelsCache, getCachedModels, getModelById } from "../src/lib/higgsfield/models";
import { resolveMediaRole, resolveMaxMedias, supportsReferences, resolveAspectRatio } from "../src/lib/higgsfield/capabilities";

async function runAssetsMode(productId: number) {
  console.log(`\n--- Assets mode: product ${productId} ---\n`);
  const result = await ensureProductAssetsUploaded(productId);
  console.log(`  Logo media ID: ${result.logoMediaId ?? "(none)"}`);
  console.log(`  Screenshot media IDs: ${result.screenshotMediaIds.length ? result.screenshotMediaIds.join(", ") : "(none)"}`);
  console.log("\nAssets mode complete.");
}

async function runBalanceMode() {
  console.log("\n--- Balance mode ---\n");
  const balance = await hfBalance();
  console.log(`  Credits: ${balance.credits}`);
  console.log(`  Plan: ${balance.plan}`);
  console.log("\nBalance mode complete.");
}

async function runCostMode() {
  console.log("\n--- Cost mode ---\n");

  const { getHiggsfieldImageModel, getHiggsfieldVideoModel } = await import("../src/lib/settings");
  const imageModel = await getHiggsfieldImageModel();
  const videoModel = await getHiggsfieldVideoModel();
  console.log(`Image model: ${imageModel}`);
  console.log(`Video model: ${videoModel}\n`);

  console.log("Image cost:");
  const imageCost = await hfGetCost("image", {
    prompt: "A product photo",
    aspect_ratio: "1:1",
  });
  console.log(`  Credits: ${imageCost}`);

  console.log("\nVideo cost:");
  const videoCost = await hfGetCost("video", {
    prompt: "Slow camera movement",
    aspect_ratio: "1:1",
    duration: 4,
  });
  console.log(`  Credits: ${videoCost}`);

  console.log("\nCost mode complete.");
}

async function runGenerateMode() {
  console.log("\n--- Generate mode ---\n");

  console.log("Step 1: text-to-image");
  const image = await hfGenerateImage({
    prompt: "A minimalist product photo of a smart water bottle on a marble surface, soft studio lighting",
    aspectRatio: "1:1",
  });
  console.log(`  Image URL: ${image.url}`);
  console.log(`  Local path: ${image.localPath}\n`);

  console.log("Step 2: image-to-video");
  const video = await hfGenerateVideo({
    prompt: "Slow dolly-in on the water bottle, subtle light reflections",
    startImageUrl: image.url,
  });
  console.log(`  Video URL: ${video.url}`);
  console.log(`  Local path: ${video.localPath}`);
  console.log(`  Duration: ${video.duration != null ? `${video.duration}s` : "unknown"}\n`);

  console.log("Generate mode complete.");
}

async function runPromptMode(productId: number) {
  console.log(`\n--- Prompt mode: product ${productId} ---\n`);

  const config = getDefaults("post", "image");
  const ctx = await gatherContext({
    productId,
    targetSurface: "post",
    mediaType: "image",
    config,
    skipAssetUpload: true,
  });

  console.log(`Context gathered: ${ctx.name} — ${ctx.description.slice(0, 80)}...`);
  console.log(`  Profile: ${ctx.profile ? "yes" : "no"}`);
  console.log(`  Strategy: ${ctx.marketingStrategy ? "yes" : "no"}`);
  console.log(`  Brainstorm ideas: ${ctx.brainstormIdeas.length}`);
  console.log(`  IG handle: ${ctx.instagramHandle ?? "(none)"}`);
  console.log(`  Logo media ID: ${ctx.logoMediaId ?? "(none)"}`);
  console.log(`  Screenshot media IDs: ${ctx.screenshotMediaIds.length}`);
  console.log("");

  const usedAngles: string[] = [];
  for (let i = 0; i < 3; i++) {
    console.log(`\n=== Variation ${i} ===`);
    try {
      const result = await buildHiggsfieldPrompt(ctx, i, usedAngles);
      console.log(`IMAGE PROMPT:\n${result.imagePrompt}\n`);
      console.log(`MOTION PROMPT:\n${result.motionPrompt}\n`);
      console.log(`CAPTION:\n${result.caption}\n`);
      console.log(`HASHTAGS: ${result.hashtags.join(", ")}\n`);
      usedAngles.push(`Variation ${i + 1}`);
    } catch (err) {
      console.error(`Variation ${i} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\nPrompt mode complete.");
}

async function runOrchestratorMode(productId: number) {
  console.log(`\n--- Orchestrator mode: product ${productId} ---\n`);
  console.log("This will spend ~2 credits for one image generation.\n");

  const config = getDefaults("post", "image");
  const result = await generateHiggsfieldContent(
    {
      productId,
      platform: "instagram",
      mediaType: "image",
      targetSurface: "post",
      config,
      count: 1,
    },
    {
      onPost: (posts, errors) => {
        console.log(`  Progress: ${posts.length} posts, ${errors.length} errors`);
      },
    }
  );

  console.log(`\nResult: ${result.posts.length} posts, ${result.errors.length} errors`);

  if (result.posts.length > 0) {
    const post = result.posts[0];
    console.log(`\nGenerated post:`);
    console.log(`  Content: ${post.content.slice(0, 100)}...`);
    console.log(`  Media URL: ${post.mediaUrl}`);
    console.log(`  Hashtags: ${post.hashtags.join(", ")}`);
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors) {
      console.log(`  [${err.index}] ${err.message} (terminal: ${err.terminal})`);
    }
  }

  console.log("\nOrchestrator mode complete.");
}

async function runGenerateVideoMode(productId: number) {
  console.log(`\n--- Generate video mode: product ${productId} ---\n`);

  console.log("Step 1: Exploring video model contract...");
  const videoModelInfo = await hfExploreModel("marketing_studio_video");
  console.log(`  Model info:`, JSON.stringify(videoModelInfo, null, 2).slice(0, 500));

  console.log("\nStep 2: Preflight cost check...");
  const cost = await hfGetCost("video", {
    prompt: "Slow camera movement",
    aspect_ratio: "1:1",
  });
  console.log(`  Estimated cost: ${cost} credits`);

  console.log("\nStep 3: Generating video...");
  console.log("This will spend credits. Video generation takes 1-3 minutes.\n");

  const config = getDefaults("post", "video");
  const result = await generateHiggsfieldContent(
    {
      productId,
      platform: "instagram",
      mediaType: "video",
      targetSurface: "post",
      config,
      count: 1,
    },
    {
      onPost: (posts, errors) => {
        console.log(`  Progress: ${posts.length} posts, ${errors.length} errors`);
      },
    }
  );

  console.log(`\nResult: ${result.posts.length} posts, ${result.errors.length} errors`);

  if (result.posts.length > 0) {
    const post = result.posts[0];
    console.log(`\nGenerated video post:`);
    console.log(`  Content: ${post.content.slice(0, 100)}...`);
    console.log(`  Media URL: ${post.mediaUrl}`);
    console.log(`  Duration: ${post.duration ?? "unknown"}s`);
    console.log(`  Hashtags: ${post.hashtags.join(", ")}`);
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors) {
      console.log(`  [${err.index}] ${err.message} (terminal: ${err.terminal})`);
    }
  }

  console.log("\nGenerate video mode complete.");
}

async function runModelsMode() {
  console.log("\n--- Models mode ---\n");
  console.log("Refreshing models cache (catalog only, ~1 minute)...\n");

  const result = await refreshModelsCache();
  console.log(`\nFetched ${result.count} models with ${result.errors} errors.\n`);

  const cached = await getCachedModels();
  if (!cached || cached.models.length === 0) {
    console.log("No models cached.");
    return;
  }

  console.log(`Last fetched: ${cached.fetchedAt}\n`);

  // Print as table
  console.log("ID".padEnd(35) + "Type".padEnd(10) + "Credits".padEnd(10) + "Aspect Ratios".padEnd(25) + "Durations");
  console.log("-".repeat(100));

  for (const model of cached.models) {
    const id = (model.id || "unknown").padEnd(35);
    const type = (model.output_type || "unknown").padEnd(10);
    const credits = (model.baseCredits?.toFixed(1) ?? "—").padEnd(10);
    const aspects = (model.aspect_ratios?.join(", ") || "—").padEnd(25);
    const durations = model.durations?.join(", ") || (model.duration_range ? `${model.duration_range.min ?? "?"}-${model.duration_range.max ?? "?"}s` : "—");
    console.log(id + type + credits + aspects + durations);
  }

  console.log("\nModels mode complete.");
}

async function runCapabilitiesMode(modelId: string) {
  console.log(`\n--- Capabilities mode: ${modelId} ---\n`);

  const model = await getModelById(modelId);
  if (!model) {
    console.error(`Model ${modelId} not found in cache. Run --models first.`);
    return;
  }

  console.log(`Model: ${model.id}`);
  console.log(`Name: ${model.name || "—"}`);
  console.log(`Type: ${model.output_type}`);
  console.log(`Cost: ${model.baseCredits?.toFixed(1) ?? "unknown"} credits`);
  console.log("");

  console.log("Reference Support:");
  const supports = supportsReferences(model);
  console.log(`  Supports references: ${supports ? "✅ yes" : "⚠️ no"}`);
  if (supports) {
    const role = resolveMediaRole(model);
    const max = resolveMaxMedias(model);
    console.log(`  Media role: ${role}`);
    console.log(`  Max references: ${max}`);
  }
  console.log("");

  console.log("Aspect Ratios:");
  console.log(`  Supported: ${model.aspect_ratios?.join(", ") || "—"}`);
  const surfaces: Array<"post" | "story" | "reel" | "ad"> = ["post", "story", "reel", "ad"];
  for (const surface of surfaces) {
    const resolved = resolveAspectRatio(model, surface);
    console.log(`  ${surface.padEnd(6)} → ${resolved}`);
  }
  console.log("");

  console.log("Durations:");
  if (model.durations?.length) {
    console.log(`  Discrete: ${model.durations.join(", ")}s`);
  } else if (model.duration_range) {
    console.log(`  Range: ${model.duration_range.min}-${model.duration_range.max}s`);
  } else {
    // Check parameters[] for duration entry
    const durationParam = model.parameters?.find(p => p.name === "duration");
    if (durationParam) {
      if (durationParam.options?.length) {
        console.log(`  From parameters: ${durationParam.options.join(", ")}s`);
      } else if (durationParam.min != null && durationParam.max != null) {
        console.log(`  From parameters range: ${durationParam.min}-${durationParam.max}s`);
      } else {
        console.log(`  Not declared`);
      }
    } else {
      console.log(`  Not declared`);
    }
  }
  console.log("");

  console.log("Parameters:");
  if (model.parameters?.length) {
    for (const param of model.parameters) {
      console.log(`  ${param.name}: ${param.type || "unknown"}`);
      if (param.options) {
        console.log(`    Options: ${param.options.join(", ")}`);
      }
      if (param.default !== undefined) {
        console.log(`    Default: ${param.default}`);
      }
    }
  } else {
    console.log(`  None declared`);
  }

  console.log("\nCapabilities mode complete.");
}

async function main() {
  console.log("--- Higgsfield spike test ---");

  const args = process.argv.slice(2);
  const assetsIdx = args.indexOf("--assets");
  const balanceIdx = args.indexOf("--balance");
  const costIdx = args.indexOf("--cost");
  const promptIdx = args.indexOf("--prompt");
  const generateIdx = args.indexOf("--generate");
  const generateVideoIdx = args.indexOf("--generate-video");
  const exploreIdx = args.indexOf("--explore");
  const modelsIdx = args.indexOf("--models");
  const capabilitiesIdx = args.indexOf("--capabilities");

  if (balanceIdx !== -1) {
    await runBalanceMode();
  } else if (costIdx !== -1) {
    await runCostMode();
  } else if (assetsIdx !== -1) {
    const productId = parseInt(args[assetsIdx + 1], 10);
    if (!productId || isNaN(productId)) {
      console.error("Usage: test-higgsfield.ts --assets <productId>");
      process.exit(1);
    }
    await runAssetsMode(productId);
  } else if (promptIdx !== -1) {
    const productId = parseInt(args[promptIdx + 1], 10);
    if (!productId || isNaN(productId)) {
      console.error("Usage: test-higgsfield.ts --prompt <productId>");
      process.exit(1);
    }
    await runPromptMode(productId);
  } else if (generateIdx !== -1) {
    const productId = parseInt(args[generateIdx + 1], 10);
    if (!productId || isNaN(productId)) {
      console.error("Usage: test-higgsfield.ts --generate <productId>");
      process.exit(1);
    }
    await runOrchestratorMode(productId);
  } else if (generateVideoIdx !== -1) {
    const productId = parseInt(args[generateVideoIdx + 1], 10);
    if (!productId || isNaN(productId)) {
      console.error("Usage: test-higgsfield.ts --generate-video <productId>");
      process.exit(1);
    }
    await runGenerateVideoMode(productId);
  } else if (exploreIdx !== -1) {
    const modelId = args[exploreIdx + 1];
    if (!modelId) {
      console.error("Usage: test-higgsfield.ts --explore <modelId>");
      process.exit(1);
    }
    console.log(`\n--- Explore model: ${modelId} ---\n`);
    const info = await hfExploreModel(modelId);
    console.log(JSON.stringify(info, null, 2));
  } else if (modelsIdx !== -1) {
    await runModelsMode();
  } else if (capabilitiesIdx !== -1) {
    const modelId = args[capabilitiesIdx + 1];
    if (!modelId) {
      console.error("Usage: test-higgsfield.ts --capabilities <modelId>");
      process.exit(1);
    }
    await runCapabilitiesMode(modelId);
  } else {
    await runGenerateMode();
  }
}

main().catch((err) => {
  console.error("Spike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
