import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { jsonrepair } from "jsonrepair";
import { getHiggsfieldImageModel, getHiggsfieldVideoModel, getClaudeCodeBin } from "@/lib/settings";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const DEFAULT_BIN = "/home/mrg/.local/bin/claude";
// Strict MCP config restricts the CLI to only the Higgsfield MCP server, skipping
// health-checks against the user's other MCP servers/hooks/plugins — a large latency
// and reliability win (60s-5min & ~30% failure -> 22-54s & 3/3 success).
const MCP_CONFIG_PATH = join(process.cwd(), "higgsfield-mcp.json");
const IMAGE_TIMEOUT = 300_000;
const VIDEO_TIMEOUT = 900_000;
// CLI + MCP round-trip for metadata calls (balance/cost) takes 15-99s
const META_TIMEOUT = 180_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function getCliBin(): Promise<string> {
  return (await getClaudeCodeBin()) || DEFAULT_BIN;
}

interface CliResult {
  status: "ok" | "error";
  url?: string;
  media_id?: string;
  credits?: number;
  message?: string;
  uploads?: Array<{ media_id: string; upload_url: string }>;
  job_params?: Record<string, unknown>;
  model?: Record<string, unknown>;
  models?: unknown[];
  plan?: string;
}

async function spawnCli(
  tools: string[],
  prompt: string,
  timeout: number
): Promise<CliResult> {
  const bin = await getCliBin();
  const toolArgs = tools.flatMap(t => ["--allowedTools", t]);
  const args = [
    "--print",
    "--model", "haiku",
    "--mcp-config", MCP_CONFIG_PATH,
    "--strict-mcp-config",
    ...toolArgs,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (error) => {
      reject(new Error(`Claude Code CLI error: ${error.message}. Set CLAUDE_CODE_BIN if the binary is elsewhere.`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        if (stderr.includes("tool not found") || stderr.includes("not allowed")) {
          reject(new Error(`Higgsfield MCP not available. Run 'claude' and connect the Higgsfield integration.`));
        } else {
          reject(new Error(`Claude Code CLI exited with code ${code}: ${stderr}`));
        }
        return;
      }

      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("{"));
      if (!jsonLine) {
        reject(new Error(`No JSON in CLI output: ${stdout.slice(0, 200)}`));
        return;
      }

      try {
        const repaired = jsonrepair(jsonLine);
        const parsed = JSON.parse(repaired);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse CLI JSON: ${err}. Raw: ${jsonLine.slice(0, 200)}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function spawnCliWithRetry(
  tools: string[],
  prompt: string,
  timeout: number,
  maxRetries: number = MAX_RETRIES
): Promise<CliResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await spawnCli(tools, prompt, timeout);
      
      // Check if result indicates an error
      if (result.status === "error") {
        throw new Error(result.message || "MCP tool returned error");
      }
      
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[higgsfield] attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("MCP call failed after retries");
}

function saveToMedia(buffer: Buffer, ext: string): { url: string; localPath: string } {
  const mediaDir = join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });
  const filename = `hf-${Date.now()}.${ext}`;
  const filePath = join(mediaDir, filename);
  writeFileSync(filePath, buffer);
  return { url: `/api/media/${filename}`, localPath: filePath };
}

async function downloadToMedia(remoteUrl: string, fallbackExt: string) {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from ${remoteUrl}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = extFromUrl(remoteUrl) || fallbackExt;
  return saveToMedia(buffer, ext);
}

function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf(".");
    if (dot === -1) return null;
    return pathname.slice(dot + 1).toLowerCase();
  } catch {
    return null;
  }
}

function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata.format?.duration) {
        console.warn(`[higgsfield] ffprobe failed for ${filePath}, duration unknown`);
        resolve(null);
      } else {
        resolve(Math.round(metadata.format.duration));
      }
    });
  });
}

// Parse role rejection error message and extract the required role
// Example: 'role "start_image" is invalid. The server requires "image"'
function parseRoleRejection(errorMsg: string): string | null {
  // Match patterns like: role "X" is invalid. The server requires "Y"
  // or: role "X" is not valid. Required role: "Y"
  const match = errorMsg.match(/role\s+"([^"]+)"\s+(?:is invalid|is not valid)[^.]*?(?:requires|required)[:\s]+"([^"]+)"/i);
  if (match && match[2]) {
    return match[2];
  }
  return null;
}

export async function hfGenerateImage(opts: {
  prompt: string;
  aspectRatio: string;
  seed?: number;
  medias?: Array<{ value: string; role: string }>;
  model?: string;
}): Promise<{ url: string; localPath: string; jobParams?: Record<string, unknown> }> {
  const modelId = opts.model || await getHiggsfieldImageModel();

  if (opts.medias?.length) {
    console.log(`[higgsfield] passing ${opts.medias.length} medias to generate_image:`, JSON.stringify(opts.medias));
  }

  const params: Record<string, unknown> = {
    model: modelId,
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio,
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    ...(opts.medias?.length ? { medias: opts.medias } : {}),
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__generate_image tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}`;

  let result: CliResult;
  try {
    result = await spawnCliWithRetry(
      [
        "mcp__claude_ai_HiggsField__generate_image",
        "mcp__claude_ai_HiggsField__job_status",
      ],
      prompt,
      IMAGE_TIMEOUT
    );
  } catch (err) {
    // Check if this is a role rejection error
    const errorMsg = err instanceof Error ? err.message : String(err);
    const requiredRole = parseRoleRejection(errorMsg);
    
    if (requiredRole && opts.medias?.length) {
      // Retry with the corrected role
      const currentRole = opts.medias[0].role;
      console.log(`[higgsfield] role "${currentRole}" rejected, server requires "${requiredRole}" — retrying and caching override`);
      
      // Update the role in the medias array
      const correctedMedias = opts.medias.map(m => ({ ...m, role: requiredRole }));
      
      // Persist the role override
      const { setRoleOverride } = await import("./models");
      await setRoleOverride(modelId, requiredRole);
      
      // Retry with corrected role
      const correctedParams: Record<string, unknown> = {
        model: modelId,
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
        medias: correctedMedias,
      };
      
      const correctedPrompt = `Call the mcp__claude_ai_HiggsField__generate_image tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(correctedParams)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}`;

      result = await spawnCliWithRetry(
        [
          "mcp__claude_ai_HiggsField__generate_image",
          "mcp__claude_ai_HiggsField__job_status",
        ],
        correctedPrompt,
        IMAGE_TIMEOUT
      );
    } else {
      throw err;
    }
  }

  if (!result.url) {
    const errorMsg = result.message || "No URL in Higgsfield response";
    const requestId = result.job_params?.request_id as string | undefined;
    throw new Error(requestId ? `${errorMsg} (request ID: ${requestId})` : errorMsg);
  }

  if (result.job_params) {
    console.log(`[higgsfield] job params:`, JSON.stringify(result.job_params, null, 2));
    
    const inputImages = result.job_params.input_images as unknown[] | undefined;
    if (opts.medias?.length && (!inputImages || inputImages.length === 0)) {
      console.warn(`[higgsfield] WARNING: medias were sent (${opts.medias.length}) but input_images is empty in job params`);
    }
  }

  return { ...await downloadToMedia(result.url, "png"), jobParams: result.job_params };
}

export async function hfUploadFile(filePath: string, contentType: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  const { basename } = await import("path");

  const filename = basename(filePath);
  const presigned = await hfPresignUpload([{ filename, contentType }]);

  if (presigned.length !== 1) {
    throw new Error("Expected 1 presigned upload");
  }

  const buffer = await readFile(filePath);
  await hfPutBytes(presigned[0].uploadUrl, buffer, contentType);
  await hfConfirmUpload(presigned[0].mediaId, "image");

  return presigned[0].mediaId;
}

export async function hfGenerateVideo(opts: {
  prompt: string;
  startImageUrl: string;
}): Promise<{ url: string; localPath: string; duration: number | null }> {
  const model = await getHiggsfieldVideoModel();

  const params: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    input_images: [{ type: "image_url", image_url: opts.startImageUrl }],
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__generate_video tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>"}`;

  const result = await spawnCliWithRetry(
    [
      "mcp__claude_ai_HiggsField__generate_video",
      "mcp__claude_ai_HiggsField__job_status",
    ],
    prompt,
    VIDEO_TIMEOUT
  );

  if (!result.url) {
    const errorMsg = result.message || "No URL in Higgsfield response";
    const requestId = result.job_params?.request_id as string | undefined;
    throw new Error(requestId ? `${errorMsg} (request ID: ${requestId})` : errorMsg);
  }

  const saved = await downloadToMedia(result.url, "mp4");
  const duration = await probeDuration(saved.localPath);
  return { ...saved, duration };
}

export async function hfGenerateVideoFromMedia(opts: {
  prompt: string;
  mediaId: string;
  aspectRatio?: string;
  duration?: number;
  model?: string;
}): Promise<{ url: string; localPath: string; duration: number | null; jobParams?: Record<string, unknown> }> {
  const modelId = opts.model || await getHiggsfieldVideoModel();

  // Get the model to check for role override
  const { getModelById } = await import("./models");
  const model = await getModelById(modelId);
  const role = model?.roleOverride || "start_image";

  const params: Record<string, unknown> = {
    model: modelId,
    prompt: opts.prompt,
    medias: [{ value: opts.mediaId, role }],
    ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
    ...(opts.duration ? { duration: opts.duration } : {}),
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__generate_video tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}`;

  let result: CliResult;
  try {
    result = await spawnCliWithRetry(
      [
        "mcp__claude_ai_HiggsField__generate_video",
        "mcp__claude_ai_HiggsField__job_status",
      ],
      prompt,
      VIDEO_TIMEOUT
    );
  } catch (err) {
    // Check if this is a role rejection error
    const errorMsg = err instanceof Error ? err.message : String(err);
    const requiredRole = parseRoleRejection(errorMsg);
    
    if (requiredRole) {
      // Retry with the corrected role
      console.log(`[higgsfield] role "${role}" rejected, server requires "${requiredRole}" — retrying and caching override`);
      
      // Persist the role override
      const { setRoleOverride } = await import("./models");
      await setRoleOverride(modelId, requiredRole);
      
      // Retry with corrected role
      const correctedParams: Record<string, unknown> = {
        model: modelId,
        prompt: opts.prompt,
        medias: [{ value: opts.mediaId, role: requiredRole }],
        ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
        ...(opts.duration ? { duration: opts.duration } : {}),
      };
      
      const correctedPrompt = `Call the mcp__claude_ai_HiggsField__generate_video tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(correctedParams)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}`;

      result = await spawnCliWithRetry(
        [
          "mcp__claude_ai_HiggsField__generate_video",
          "mcp__claude_ai_HiggsField__job_status",
        ],
        correctedPrompt,
        VIDEO_TIMEOUT
      );
    } else {
      throw err;
    }
  }

  if (!result.url) {
    const errorMsg = result.message || "No URL in Higgsfield response";
    const requestId = result.job_params?.request_id as string | undefined;
    throw new Error(requestId ? `${errorMsg} (request ID: ${requestId})` : errorMsg);
  }

  const saved = await downloadToMedia(result.url, "mp4");
  const duration = await probeDuration(saved.localPath);
  return { ...saved, duration, jobParams: result.job_params };
}

interface PresignedUpload {
  mediaId: string;
  uploadUrl: string;
}

export async function hfPresignUpload(
  files: Array<{ filename: string; contentType: string }>
): Promise<PresignedUpload[]> {
  const params: Record<string, unknown> = {
    files: files.map(f => ({
      filename: f.filename,
      content_type: f.contentType
    })),
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__media_upload tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then output ONE line of JSON and nothing else:
{"status":"ok","uploads":[{"media_id":"<id>","upload_url":"<url>"},...]}`;

  const result = await spawnCliWithRetry(
    ["mcp__claude_ai_HiggsField__media_upload"],
    prompt,
    META_TIMEOUT
  );

  if (!result.uploads || !Array.isArray(result.uploads)) {
    throw new Error("No uploads array in presign response");
  }

  return result.uploads.map((u: { media_id: string; upload_url: string }) => ({
    mediaId: u.media_id,
    uploadUrl: u.upload_url
  }));
}

export async function hfPutBytes(uploadUrl: string, buffer: Buffer, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(buffer)
  });

  if (!response.ok) {
    throw new Error(`PUT to presigned URL failed: ${response.status}`);
  }
}

export async function hfConfirmUpload(mediaId: string, type: "image" | "video" = "image"): Promise<void> {
  const params: Record<string, unknown> = {
    media_id: mediaId,
    type,
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__media_confirm tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then output ONE line of JSON and nothing else:
{"status":"ok"}`;

  await spawnCliWithRetry(
    ["mcp__claude_ai_HiggsField__media_confirm"],
    prompt,
    META_TIMEOUT
  );
}

export async function hfGetCost(
  kind: "image" | "video",
  params: Record<string, unknown>
): Promise<number> {
  const tool = kind === "image"
    ? "mcp__claude_ai_HiggsField__generate_image"
    : "mcp__claude_ai_HiggsField__generate_video";

  // If params includes a model, use it; otherwise fall back to the default
  const model = (params.model as string) || (kind === "image"
    ? await getHiggsfieldImageModel()
    : await getHiggsfieldVideoModel());

  const callParams: Record<string, unknown> = {
    model,
    get_cost: true,
    ...params,
  };

  const prompt = `Call the ${tool} tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(callParams)}

Then output ONE line of JSON and nothing else:
{"status":"ok","credits":<number>}`;

  const result = await spawnCliWithRetry([tool], prompt, META_TIMEOUT);
  return result.credits ?? 0;
}

export async function hfBalance(): Promise<{ credits: number; plan: string }> {
  const prompt = `Call the mcp__claude_ai_HiggsField__balance tool with no params.

Then output ONE line of JSON and nothing else:
{"status":"ok","credits":<number>,"plan":"<plan_name>"}`;

  const result = await spawnCliWithRetry(
    ["mcp__claude_ai_HiggsField__balance"],
    prompt,
    META_TIMEOUT
  );

  return {
    credits: result.credits ?? 0,
    plan: result.plan || "unknown",
  };
}

export async function hfExploreModel(modelId: string): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {
    action: "get",
    model_id: modelId,
  };

  const prompt = `Call the mcp__claude_ai_HiggsField__models_explore tool with the params argument set to EXACTLY this JSON object, verbatim:

${JSON.stringify(params)}

Then output ONE line of JSON and nothing else:
{"status":"ok","model":<the full model object>}`;

  const result = await spawnCliWithRetry(
    ["mcp__claude_ai_HiggsField__models_explore"],
    prompt,
    META_TIMEOUT
  );

  return (result.model as Record<string, unknown>) || {};
}

export interface HiggsfieldMediaCapability {
  roles: string[];
  max?: number;
  required?: boolean;
}

export interface HiggsfieldParameter {
  name: string;
  type?: string;
  default?: unknown;
  options?: unknown[];
  min?: number;
  max?: number;
}

export interface HiggsfieldModel {
  id: string;
  name: string;
  provider_name?: string;
  description?: string;
  output_type: string;
  medias?: HiggsfieldMediaCapability[];
  aspect_ratios?: string[];
  tags?: string[];
  duration_range?: { min: number; max: number };
  durations?: number[];
  parameters?: HiggsfieldParameter[];
  baseCredits?: number;
  roleOverride?: string;
}

// Non-generator models to filter out — these are utility tools, not content generators
const NON_GENERATOR_MODELS = new Set([
  "video_upscale",
  "video_deflicker",
  "sam_3_video",
  "topaz_video",
  "bytedance_video_upscale",
  "sync_so",
  "video_background_remover",
  "llm_text",
  "clipify",
  "image_background_remover",
  "topaz_image",
  "topaz_image_generative",
  "bytedance_image_upscale",
  "outpaint",
]);

export async function hfListModelsByType(type: "image" | "video"): Promise<HiggsfieldModel[]> {
  const params: Record<string, unknown> = {
    action: "list",
    type,
    limit: 50,
  };

  // Explicit instruction to output raw JSON verbatim — no summary, no commentary
  const prompt = `Call the mcp__claude_ai_HiggsField__models_explore tool with the params argument set to EXACTLY this JSON object, verbatim:

${JSON.stringify(params)}

Output the tool result as raw JSON, verbatim, with no commentary, no summary, and no truncation. Do not describe the models.

For each model, include ONLY these fields: id, name, provider_name, description, output_type, aspect_ratios, duration_range, durations, medias (with roles, max, required), parameters (with name, type, default, options, min, max).

Then output ONE line of JSON and nothing else:
{"status":"ok","models":[<array of model objects with only the fields listed above>]}`;

  const result = await spawnCliWithRetry(
    ["mcp__claude_ai_HiggsField__models_explore"],
    prompt,
    META_TIMEOUT
  );

  const models = (result.models as HiggsfieldModel[] | undefined) || [];

  // Hard-fail if fewer than 5 models — silent truncation is worse than an error
  if (models.length < 5) {
    throw new Error(`Expected 5+ ${type} models but got ${models.length}. The CLI agent may have truncated the response.`);
  }

  // Filter out non-generator models and ensure output_type is set
  return models
    .filter((m) => !NON_GENERATOR_MODELS.has(m.id))
    .map((m) => ({
      ...m,
      output_type: m.output_type || type, // fallback to requested type if missing
    }));
}

export async function hfListModels(): Promise<HiggsfieldModel[]> {
  // Call once per type — never all at once (payload too large)
  const [imageModels, videoModels] = await Promise.all([
    hfListModelsByType("image"),
    hfListModelsByType("video"),
  ]);

  console.log(`[higgsfield] fetched ${imageModels.length} image models, ${videoModels.length} video models`);

  return [...imageModels, ...videoModels];
}
