import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  url: text("url"),
  features: text("features"), // JSON array
  audience: text("audience"),
  tone: text("tone"), // casual | professional | playful
  themes: text("themes"), // JSON array
  planFile: text("plan_file"), // markdown content
  planFileName: text("plan_file_name"), // original filename
  screenshots: text("screenshots"), // JSON array of file paths
  appProfile: text("app_profile"), // JSON extracted profile
  marketingStrategy: text("marketing_strategy"), // JSON extracted strategy
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id),
  type: text("type").notNull(), // reel | post | story | carousel
  content: text("content").notNull(),
  hashtags: text("hashtags"), // JSON array
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("draft"), // draft | approved | scheduled | posted
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  postedAt: integer("posted_at", { mode: "timestamp" }),
  instagramId: text("instagram_id"),
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
export type Setting = typeof settings.$inferSelect;
