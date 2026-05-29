import { z } from "zod";
import type { Brief } from "@/lib/compose/archetypes";

const archetypeIdSchema = z.enum([
  "editorial",
  "displayImage",
  "photoCaption",
  "iconCard",
  "quote",
  "stat",
  "steps",
  "feature",
  "announce",
  "article",
]);

const imagerySchema = z.object({
  kind: z.enum(["photo", "gradient", "solid"]),
  scene: z.string().optional(),
});

export const briefSchema: z.ZodType<Brief> = z.object({
  archetype: archetypeIdSchema,
  headline: z.string().min(1),
  subhead: z.string().optional(),
  body: z.string().optional(),
  imagery: imagerySchema,
  accentIndex: z.number().int().min(0),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
