# Buzz

Self-deployable service that auto-generates and posts marketing content for software products. Platform-agnostic design, currently focused on Instagram.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- SQLite + Drizzle ORM
- Tailwind CSS
- Claude API (content generation)
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
- `ANTHROPIC_API_KEY` - Claude API key
- `FACEBOOK_APP_ID` - from developers.facebook.com
- `FACEBOOK_APP_SECRET` - from developers.facebook.com
- `INSTAGRAM_REDIRECT_URI` - OAuth callback URL (e.g. `http://localhost:3000/api/instagram/callback`)

3. Initialize database:
```bash
npm run db:push
npm run db:seed  # optional: seeds Bud product
```

4. Run dev server:
```bash
npm run dev
```

## Features

- **Products** - manage products to market (name, description, audience, tone, themes)
- **Generate** - AI-generated content via Claude (posts, reels, carousels)
- **Content Queue** - review, edit, approve generated posts
- **Instagram** - OAuth connection + direct posting

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
