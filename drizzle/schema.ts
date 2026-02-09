import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  planFile: text("plan_file"), // markdown content
  planFileName: text("plan_file_name"), // original filename
  screenshots: text("screenshots"), // JSON array of file paths
  profile: text("profile"), // JSON extracted profile
  marketingStrategy: text("marketing_strategy"), // JSON extracted strategy
  textProvider: text("text_provider"), // gemini | huggingface
  extractionStatus: text("extraction_status"), // pending | extracting | done | failed
  instagramAccountId: integer("instagram_account_id").references(() => instagramAccounts.id),
  xAccountId: integer("x_account_id").references(() => xAccounts.id),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id),
  platform: text("platform").notNull().default("instagram"), // instagram | twitter
  type: text("type").notNull(), // reel | post | story | carousel
  content: text("content").notNull(),
  hashtags: text("hashtags"), // JSON array
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("draft"), // draft | approved | scheduled | posted
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  postedAt: integer("posted_at", { mode: "timestamp" }),
  instagramId: text("instagram_id"),
  xPostId: text("x_post_id"),
  // Targeting metadata
  hookUsed: text("hook_used"),
  pillarUsed: text("pillar_used"),
  targetType: text("target_type"), // pain | desire | objection
  targetValue: text("target_value"),
  toneConstraints: text("tone_constraints"), // JSON array
  visualDirection: text("visual_direction"),
  generationParams: text("generation_params"), // full JSON for debugging
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

export const xAccounts = sqliteTable("x_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  xUserId: text("x_user_id").notNull(),
  username: text("username"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value"),
});

// Types
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type InstagramAccount = typeof instagramAccounts.$inferSelect;
export type XAccount = typeof xAccounts.$inferSelect;
export type Setting = typeof settings.$inferSelect;
