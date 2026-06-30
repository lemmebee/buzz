import { db } from "./db";
import { jobs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateContent } from "./generate";
import { randomUUID } from "crypto";
import type { Platform, ContentPurpose, ContentTargeting, MediaType } from "./brain/types";
import type { ContentConfig } from "./content/defaults";

export async function createJob(params: {
  productId: number;
  platform: string;
  mediaType: string;
  targetSurface: string;
  config?: ContentConfig;
  targeting?: ContentTargeting;
  count: number;
  images: string[];
}): Promise<string> {
  const jobId = randomUUID();
  await db.insert(jobs).values({
    id: jobId,
    productId: params.productId,
    platform: params.platform,
    mediaType: params.mediaType,
    targetSurface: params.targetSurface,
    config: params.config ? JSON.stringify(params.config) : null,
    targeting: params.targeting ? JSON.stringify(params.targeting) : null,
    count: params.count,
    images: JSON.stringify(params.images),
    status: "pending",
  });
  return jobId;
}

export async function processJob(jobId: string) {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job || job.status !== "pending") return;

  await db.update(jobs).set({ status: "processing", updatedAt: new Date() }).where(eq(jobs.id, jobId));

  try {
    const { posts, errors } = await generateContent({
      productId: job.productId,
      platform: job.platform as Platform,
      mediaType: job.mediaType as MediaType,
      targetSurface: job.targetSurface as ContentPurpose,
      config: job.config ? JSON.parse(job.config) : undefined,
      targeting: job.targeting ? JSON.parse(job.targeting) : undefined,
      count: job.count,
      images: job.images ? JSON.parse(job.images) : [],
    });

    await db.update(jobs).set({
      status: "completed",
      result: JSON.stringify({ posts, errors }),
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));
  } catch (error) {
    await db.update(jobs).set({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));
  }
}
