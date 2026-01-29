# Buzz

AI-powered social media content generator for product marketing. Creates Instagram-ready posts, reels, and carousels using product briefs and smart content rotation.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- SQLite + Drizzle ORM
- Tailwind CSS
- LLM providers: Google Gemini, HuggingFace (pluggable)
- Meta Graph API (Instagram posting)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
```

Required env vars:
- `ADMIN_PASSWORD` - password for admin login
- `GEMINI_API_KEY` - Google Gemini API key
- `HUGGINGFACE_API_KEY` - HuggingFace API key (optional, alternative provider)
- `FACEBOOK_APP_ID` - from developers.facebook.com
- `FACEBOOK_APP_SECRET` - from developers.facebook.com
- `INSTAGRAM_REDIRECT_URI` - OAuth callback URL (e.g. `http://localhost:3000/api/instagram/callback`)

3. Initialize database:
```bash
npm run db:push
npm run db:seed  # optional: seeds sample product
```

4. Run dev server:
```bash
npm run dev
```

## Features

### Product Management
- Create products with marketing briefs & screenshots
- AI extracts product profile (value prop, tone, visual identity) and marketing strategy
- Async extraction with status tracking
- Per-product Instagram account linking
- Configurable LLM provider per product

### Content Generation
- Generate 1-10 content variations per batch
- Content types: posts, reels, carousels
- AI-generated captions + hashtags
- Targeting metadata: pain points, desires, objections
- Hooks and content pillars for variety

### Smart Rotation
- Tracks usage stats per product (hooks, pillars, targeting)
- Suggests least-used elements to maintain content variety
- Prevents repetitive messaging

### Content Queue
- Status workflow: draft → approved → scheduled → posted
- Filter by status & product
- Bulk save generated content
- One-click Instagram publishing

### Instagram Integration
- OAuth 2.0 via Facebook Login
- Long-lived token management (60-day expiry)
- Publish posts via Meta Graph API v19.0

## DB Scripts

```bash
npm run db:generate  # generate migrations
npm run db:push      # push schema to db
npm run db:migrate   # run migrations
npm run db:studio    # open Drizzle Studio
npm run db:seed      # seed sample product
```

## Instagram Setup

1. Create app at [developers.facebook.com](https://developers.facebook.com)
2. Add Instagram Graph API product
3. Create Facebook Page and link Instagram Business Account
4. Add OAuth redirect URI to app settings
5. Connect account in Buzz Settings page
