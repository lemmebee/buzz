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

// LLMs return imperfect JSON: optional text fields arrive as null, and list-style
// bodies (steps/features) arrive as arrays. Coerce both to the canonical shape.
const optionalString = z.string().nullish().transform((v) => v ?? undefined);
const optionalMultiline = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => (Array.isArray(v) ? v.join("\n") : v) ?? undefined);

const imagerySchema = z.object({
  kind: z.enum(["photo", "gradient", "solid"]).default("solid"),
  scene: optionalString,
});

// archetype/accentIndex/caption/hashtags carry defaults: the SYSTEM now chooses the
// archetype (see selectArchetype) and overrides whatever the model returns, so a missing
// or stray value must not fail parsing.
export const briefSchema = z.object({
  archetype: archetypeIdSchema.default("editorial"),
  headline: z.string().min(1),
  subhead: optionalString,
  body: optionalMultiline,
  imagery: imagerySchema.default({ kind: "solid", scene: undefined }),
  accentIndex: z.number().int().min(0).default(0),
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
});

// Compile-time guard: parsed output must satisfy the Brief contract.
const _briefCheck: Brief = {} as z.infer<typeof briefSchema>;
void _briefCheck;
