<p align="center">
  <img src="public/icon.svg" alt="Buzz" width="120" height="120" />
</p>

<h1 align="center">Buzz</h1>

<p align="center">AI-powered social media content generator for product marketing. Creates Instagram-ready posts, reels, and carousels using product briefs and smart content rotation.</p>

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- SQLite + Drizzle ORM
- Tailwind CSS
- LLM providers: Google Gemini, HuggingFace (pluggable)
- Meta Graph API (Instagram posting)

## Install

**Requires Node.js 20+** (for better-sqlite3).

### From release

```bash
curl -L https://github.com/lemmebee/buzz/archive/refs/tags/v0.1.0.tar.gz | tar -xz
cd buzz-0.1.0
npm install
cp .env.example .env  # fill in values, see below
npm run db:push
npm run build
npm start
```

Or via `gh`:
```bash
gh release download v0.1.0 --repo lemmebee/buzz --archive=tar.gz
tar -xzf buzz-0.1.0.tar.gz && cd buzz-0.1.0
```

### From source

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
- `TEXT_PROVIDER` - LLM provider: "gemini" (default) or "huggingface"
- `GOOGLE_AI_API_KEY` - Google AI API key (required if using gemini)
- `HUGGINGFACE_API_KEY` - HuggingFace API key (required if using huggingface)
- `FACEBOOK_APP_ID` - from developers.facebook.com
- `FACEBOOK_APP_SECRET` - from developers.facebook.com
- `INSTAGRAM_REDIRECT_URI` - OAuth callback URL (e.g. `http://localhost:3000/api/instagram/callback`)

Optional env vars:
- `POLLINATIONS_API_KEY` - image generation (works without auth but rate limited)

3. Initialize database:
```bash
npm run db:push
npm run db:seed  # optional: seeds sample product
```

4. Run dev server:
```bash
npm run dev
```

5. Open http://localhost:3000

## Features

### Product Management
- Create products with marketing briefs & screenshots
- AI extracts product profile (value prop, tone, visual identity) and marketing strategy
- Async extraction with status tracking
- Per-product Instagram account linking
- Configurable LLM provider per product

### Content Generation
- Generate 1-10 content variations per batch
- Content types: posts, reels, stories, carousels, ads
- AI-generated captions + hashtags
- AI-generated images via Pollinations
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

## Discord Approval (drafts via bot)

Generation schedules post each draft to a Discord channel with **Post** / **Delete** buttons. Click Post to publish to Instagram, Delete to drop the draft.

### One-time bot setup

1. Create a personal Discord server (any server you control works).
2. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** → name it.
3. **Bot** tab → **Reset Token** → copy the token.
4. **General Information** tab → copy the **Public Key** (64 hex chars).
5. **OAuth2 → URL Generator** → scopes: `bot`, permissions: `Send Messages` + `Embed Links` → open generated URL → invite bot to your server.
6. In Discord client: User Settings → Advanced → enable Developer Mode. Right-click target channel → **Copy Channel ID**.
7. Buzz `/schedules` → Discord Notifications card → paste Bot Token, Public Key, Channel ID → **Connect Discord**. Test message lands in the channel.

### Public URL for button clicks

Discord button presses POST to your app. Localhost is not reachable from Discord, so you need a public HTTPS URL.

For a quick tunnel:
```bash
cloudflared tunnel --url http://localhost:3000
```
Copy the printed `https://*.trycloudflare.com` URL.

In the dev portal → **General Information** → set **Interactions Endpoint URL** to:
```
https://<your-tunnel-host>/api/discord/interactions
```
Save. Discord verifies the URL with a signed PING; save succeeds when Buzz is reachable and the public key is configured.

For a permanent URL, set up a named Cloudflare tunnel or deploy Buzz behind any HTTPS reverse proxy.

## Generation Schedules

- `/schedules` page lets you set per-product cadence (frequency, preferred time, content type, count).
- Worker runs every 5 minutes in-process (`src/lib/worker.ts`, started by `src/instrumentation.ts`).
- Each due schedule generates drafts and ships them to Discord for approval.
- External cron path also available: `POST /api/cron/generate` with header `x-cron-secret: $CRON_SECRET`.

## Running as a systemd service (Linux)

User unit at `~/.config/systemd/user/buzz.service` runs `npm start` (production build). Companion unit `buzz-tunnel.service` runs the Cloudflare tunnel. Manage with:

```bash
systemctl --user start  buzz.service buzz-tunnel.service
systemctl --user enable buzz.service buzz-tunnel.service
journalctl --user -u buzz.service -f
journalctl --user -u buzz-tunnel.service | grep trycloudflare
```

The quick tunnel URL changes whenever `buzz-tunnel.service` restarts; re-paste it into the Discord dev portal each time, or use a named tunnel for a stable hostname.
