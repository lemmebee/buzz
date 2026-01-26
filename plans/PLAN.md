# Buzz

## Overview
Self-deployable service that auto-generates and posts marketing content for software products. Platform-agnostic design, starting with Instagram.

---

## Phase 1: Project Setup
**Goal:** Initialize repo with basic Next.js structure

### Tasks
- [x] Create repo at `/home/lemmebee/sources/buzz`
- [x] Init Next.js 14 with TypeScript
- [x] Add Tailwind CSS
- [x] Create folder structure
- [x] Add .env.example
- [x] Save this plan to `plans/` folder

### Structure Created
```
buzz/
├── src/
│   ├── app/          # Next.js pages
│   ├── lib/          # Utilities
│   └── components/   # React components
├── drizzle/          # DB schema
├── scripts/          # CLI scripts
├── plans/            # This plan
├── .env.example
└── package.json
```

### Verification
- `npm run dev` works
- Tailwind compiles

---

## Phase 2: Database
**Goal:** SQLite database with Drizzle ORM

### Tasks
- [x] Install drizzle-orm, better-sqlite3
- [x] Create schema (products, posts, accounts, settings)
- [x] Generate migrations
- [x] Add db client in `lib/db.ts`
- [x] Seed script for Bud product

### Files Created
- `drizzle/schema.ts` - table definitions + types
- `drizzle.config.ts` - Drizzle Kit config
- `drizzle/migrations/` - generated SQL migrations
- `src/lib/db.ts` - Drizzle client singleton
- `scripts/seed.ts` - seeds Bud product
- `data/buzz.db` - SQLite database file (gitignored)

### Scripts Added
- `npm run db:generate` - generate migrations
- `npm run db:push` - push schema to DB
- `npm run db:seed` - seed Bud product
- `npm run db:studio` - open Drizzle Studio

### Schema
```ts
products: id, name, description, url, features, audience, tone, themes
posts: id, product_id, type, content, hashtags, media_url, status, scheduled_at, posted_at
instagram_accounts: id, access_token, token_expires_at
settings: id, key, value
```

### Verification
- Can insert/query products
- Bud product seeded

---

## Phase 3: Admin Auth
**Goal:** Simple password-based auth

### Tasks
- [x] Env var `ADMIN_PASSWORD`
- [x] Login page with password input
- [x] Session cookie (httpOnly)
- [x] Auth middleware for protected routes

### Files Created
- `src/lib/auth.ts` - session management (create/verify/destroy)
- `src/middleware.ts` - protects all routes, redirects to /login
- `src/app/login/page.tsx` - login form
- `src/app/api/auth/login/route.ts` - POST login endpoint
- `src/app/api/auth/logout/route.ts` - POST logout endpoint
- `src/components/LogoutButton.tsx` - client logout button
- `src/app/page.tsx` - dashboard with nav links

### How It Works
- Password stored in `ADMIN_PASSWORD` env var
- Session = SHA256 hash of password, stored in httpOnly cookie
- Middleware checks cookie on every request
- Session expires after 7 days

### Verification
- Wrong password rejected
- Correct password grants access
- Session persists across refreshes

---

## Phase 4: Product Management UI
**Goal:** CRUD for products

### Tasks
- [x] `/products` - list all products
- [x] `/products/new` - add product form
- [x] `/products/[id]` - edit product
- [x] API routes: GET/POST/PUT/DELETE products
- [x] ProductCard component

### Files Created
- `src/app/api/products/route.ts` - GET all, POST new
- `src/app/api/products/[id]/route.ts` - GET/PUT/DELETE single
- `src/components/ProductCard.tsx` - product display card
- `src/components/ProductForm.tsx` - create/edit form
- `src/app/products/page.tsx` - list all products
- `src/app/products/new/page.tsx` - create product
- `src/app/products/[id]/page.tsx` - edit product

### Verification
- Can create new product
- Can edit existing product
- Can delete product
- Bud appears in list

---

## Phase 5: Claude Integration
**Goal:** AI content generation

### Tasks
- [x] Install @anthropic-ai/sdk
- [x] Create `lib/claude.ts` wrapper
- [x] Create `lib/prompts.ts` with templates:
  - Reel caption prompt
  - Post caption prompt
  - Carousel ideas prompt
- [x] `/api/generate` route

### Files Created
- `src/lib/claude.ts` - Anthropic SDK wrapper
- `src/lib/prompts.ts` - prompt templates + parser
- `src/app/api/generate/route.ts` - POST endpoint

### API Usage
```bash
POST /api/generate
{
  "productId": 1,
  "contentType": "reel" | "post" | "carousel",
  "count": 5
}
```

### Verification
- Generate content for Bud
- Content matches tone/themes

---

## Phase 6: Content Queue UI
**Goal:** View, edit, approve generated content

### Tasks
- [ ] `/content` - list all posts (filterable by status)
- [ ] `/content/[id]` - edit single post
- [ ] ContentCard component
- [ ] ContentEditor component
- [ ] Status workflow: draft → approved → scheduled → posted
- [ ] Approve/reject buttons

### Verification
- Can view generated content
- Can edit and save
- Status changes work

---

## Phase 7: Generate Page
**Goal:** UI to trigger content generation

### Tasks
- [ ] `/generate` page
- [ ] Select product dropdown
- [ ] Select content type (reel/post/carousel)
- [ ] Generate button → calls Claude
- [ ] Shows generated content for review
- [ ] Save to queue button

### Verification
- Select Bud, generate 5 posts
- Save to queue
- Appear in content list

---

## Phase 8: Instagram OAuth
**Goal:** Connect Instagram Business account

### Tasks
- [ ] Create Meta Developer app
- [ ] Add Instagram Graph API
- [ ] `/api/instagram/auth` - start OAuth
- [ ] `/api/instagram/callback` - exchange code for token
- [ ] Store token in DB (encrypted)
- [ ] `/settings` page - connect/disconnect account

### Meta App Setup
1. developers.facebook.com → Create App (Business)
2. Add Instagram Graph API product
3. Add redirect URI
4. Env vars: META_APP_ID, META_APP_SECRET

### Verification
- OAuth flow completes
- Token stored
- Can fetch account info

---

## Phase 9: Instagram Posting
**Goal:** Post content to Instagram

### Tasks
- [ ] `/api/instagram/post` route
- [ ] Container creation (image upload)
- [ ] Publish endpoint
- [ ] Update post status after publishing
- [ ] Error handling
- [ ] "Post Now" button in content queue

### Verification
- Approve a post
- Click Post Now
- Verify appears on Instagram
- Status updates to "posted"

---

## Phase 10: Scheduling
**Goal:** Schedule posts for later

### Tasks
- [ ] Add schedule datetime picker to content editor
- [ ] Cron job or edge function to check scheduled posts
- [ ] Auto-post when time arrives
- [ ] `/calendar` page - visual calendar view

### Verification
- Schedule post for 5 min later
- Verify it posts automatically
- Calendar shows scheduled posts

---

## Phase 11: Polish & Deploy
**Goal:** Production-ready

### Tasks
- [ ] Dashboard home with stats
- [ ] Error handling throughout
- [ ] Loading states
- [ ] Mobile-responsive
- [ ] Dockerfile for self-hosting
- [ ] Vercel/Railway deploy instructions
- [ ] README with setup guide

### Verification
- Fresh deploy works
- All features functional
- Responsive on mobile

---

## Architecture
```
┌─────────────────┐     ┌─────────────────┐
│  Web Dashboard  │────▶│   Next.js API   │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌─────────┐  ┌───────────┐  ┌─────────┐
              │ Claude  │  │ Instagram │  │   DB    │
              │   API   │  │    API    │  │ SQLite  │
              └─────────┘  └───────────┘  └─────────┘
```

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- SQLite + Drizzle ORM
- Tailwind CSS
- Claude API
- Meta Graph API

## First Product: Bud
```
name: Bud
description: Cannabis relationship companion
audience: Cannabis users 18-35
tone: Warm, non-judgmental, curious
themes:
  - "Curious about your cannabis habits?"
  - "Not trying to quit, just understand"
  - "Your relationship with weed, on your terms"
```

---

## Future Phases
- **Phase 12:** TikTok integration
- **Phase 13:** Analytics dashboard
- **Phase 14:** Multi-user support
