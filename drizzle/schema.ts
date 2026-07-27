import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  planFile: text("plan_file"), // markdown content
  planFileName: text("plan_file_name"), // original filename
  screenshots: text("screenshots"), // JSON array of file paths
  logo: text("logo"), // file path to product logo
  profile: text("profile"), // JSON extracted profile
  marketingStrategy: text("marketing_strategy"), // JSON extracted strategy
  icp: text("icp", { mode: "json" }), // JSON ICP persona (see brain/types.ts ICP)
  jtbd: text("jtbd", { mode: "json" }), // JSON JTBD[] (see brain/types.ts JTBD)
  channelHints: text("channel_hints", { mode: "json" }), // JSON string[] of preferred channel keys
  landingUrl: text("landing_url"), // public URL where attribution snippet lives
  attributionWebhookSecret: text("attribution_webhook_secret"), // HMAC secret for /api/conversions
  textProvider: text("text_provider"), // gemini | huggingface
  imageProvider: text("image_provider"), // pollinations | gemini | huggingface
  videoProvider: text("video_provider"), // ffmpeg | remotion (null = global default)
  contentEngine: text("content_engine"), // buzz | higgsfield (null = global default)
  higgsfieldImageModel: text("higgsfield_image_model"), // nullable: product-level override for HF image model
  higgsfieldVideoModel: text("higgsfield_video_model"), // nullable: product-level override for HF video model
  llmInstructions: text("llm_instructions"), // user-provided rules/guidance for LLM
  extractionStatus: text("extraction_status"), // pending | extracting | done | failed
  extractionError: text("extraction_error"), // human-readable reason when failed
  instagramAccountId: integer("instagram_account_id").references(() => instagramAccounts.id),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const content = sqliteTable("content", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id),
  mediaType: text("media_type").notNull(), // image | video
  targetSurface: text("target_surface").notNull(), // reel | post | story | ad
  content: text("content").notNull(),
  hashtags: text("hashtags"), // JSON array
  mediaUrl: text("media_url"),
  publicMediaUrl: text("public_media_url"), // publicly accessible URL for platform APIs
  script: text("script"), // video script text
  duration: integer("duration"), // seconds, video only
  audioUrl: text("audio_url"), // narration mp3
  captionsUrl: text("captions_url"), // SRT path if captions enabled
  config: text("config"), // generation config snapshot, JSON
  status: text("status").notNull().default("draft"), // draft | approved | scheduled | posted
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  postedAt: integer("posted_at", { mode: "timestamp" }),
  instagramId: text("instagram_id"),
  hookUsed: text("hook_used"),
  pillarUsed: text("pillar_used"),
  targetType: text("target_type"), // pain | desire | objection
  targetValue: text("target_value"),
  toneConstraints: text("tone_constraints"), // JSON array
  visualDirection: text("visual_direction"),
  generationParams: text("generation_params"), // full JSON for debugging
  discordMessageId: text("discord_message_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const instagramAccounts = sqliteTable("instagram_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instagramUserId: text("instagram_user_id"),
  username: text("username"),
  accessToken: text("access_token").notNull(),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const productRevisions = sqliteTable("product_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // planFile | profile | marketingStrategy
  content: text("content").notNull(),
  textProvider: text("text_provider"), // model used at time of change (null for manual)
  source: text("source").notNull(), // manual | extraction
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const generationSchedules = sqliteTable("generation_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // instagram | twitter
  mediaType: text("media_type").notNull().default("image"), // image | video
  targetSurface: text("target_surface").notNull(), // reel | post | story | ad
  config: text("config"), // generation config tweaks JSON
  count: integer("count").notNull().default(1),
  frequencyHours: integer("frequency_hours").notNull().default(24),
  preferredTime: text("preferred_time").notNull().default("09:00"), // HH:MM
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const brainstormIdeas = sqliteTable("brainstorm_ideas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // campaign | series | post | experiment
  hook: text("hook").notNull(),
  whyItWorks: text("why_it_works"),
  format: text("format"),
  riskiestAssumption: text("riskiest_assumption"),
  noveltyScore: integer("novelty_score"),
  fitScore: integer("fit_score"),
  feasibilityScore: integer("feasibility_score"),
  theme: text("theme"), // optional focus used when generated
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  mediaType: text("media_type").notNull(),
  targetSurface: text("target_surface").notNull(),
  config: text("config"),
  targeting: text("targeting"),
  count: integer("count").notNull().default(1),
  images: text("images"), // JSON array of base64
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed | cancelled
  result: text("result"), // JSON { posts, errors } — written incrementally as each variation finishes
  // Nullable on purpose: adding a NOT NULL column forces SQLite to rewrite the
  // whole table (drizzle-kit flags that as data-loss). A nullable add is a plain
  // ALTER TABLE ADD COLUMN; existing rows get NULL, which reads as falsy.
  cancelRequested: integer("cancel_requested", { mode: "boolean" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value"),
});

export const higgsfieldAssets = sqliteTable("higgsfield_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  localPath: text("local_path").notNull(),
  kind: text("kind"),
  hfUrl: text("hf_url"),
  hfMediaId: text("hf_media_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const higgsfieldModels = sqliteTable("higgsfield_models", {
  id: text("id").primaryKey(),
  name: text("name"),
  providerName: text("provider_name"),
  description: text("description"),
  outputType: text("output_type").notNull(),
  aspectRatios: text("aspect_ratios"),
  durationRangeMin: integer("duration_range_min"),
  durationRangeMax: integer("duration_range_max"),
  durations: text("durations"),
  medias: text("medias"),
  parameters: text("parameters"),
  baseCredits: integer("base_credits"),
  roleOverride: text("role_override"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const generationTraces = sqliteTable("generation_traces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id"),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  contentId: integer("content_id"),
  phase: text("phase").notNull(),
  step: text("step"),
  variationIndex: integer("variation_index"),
  engine: text("engine"),
  provider: text("provider"),
  model: text("model"),
  input: text("input"),
  output: text("output"),
  credits: real("credits"),
  durationMs: integer("duration_ms"),
  status: text("status"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Types
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ContentItem = typeof content.$inferSelect;
export type NewContentItem = typeof content.$inferInsert;
export type InstagramAccount = typeof instagramAccounts.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type ProductRevision = typeof productRevisions.$inferSelect;
export type GenerationSchedule = typeof generationSchedules.$inferSelect;
export type NewGenerationSchedule = typeof generationSchedules.$inferInsert;
export type BrainstormIdeaRow = typeof brainstormIdeas.$inferSelect;
export type NewBrainstormIdea = typeof brainstormIdeas.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type HiggsfieldAsset = typeof higgsfieldAssets.$inferSelect;
export type NewHiggsfieldAsset = typeof higgsfieldAssets.$inferInsert;
export type HiggsfieldModelRow = typeof higgsfieldModels.$inferSelect;
export type NewHiggsfieldModelRow = typeof higgsfieldModels.$inferInsert;
export type GenerationTrace = typeof generationTraces.$inferSelect;
export type NewGenerationTrace = typeof generationTraces.$inferInsert;
