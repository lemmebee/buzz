# Buzz UX Refactor Plan

## Business Flow

```
Login → Dashboard → Add Product (AI extracts profile) → Connect Instagram → Generate Content → Review/Approve → Schedule/Post
```

The app is a content pipeline: product briefs go in, AI-generated Instagram posts come out, managed through a draft → approved → scheduled → posted lifecycle.

---

## Critical UX Problems

### 1. No real navigation
Every page uses a `←` back arrow as the only navigation. No sidebar, no tabs, no persistent nav. Users bounce through the dashboard to switch sections. This is the #1 usability problem.

### 2. Dashboard is a dead-end
Shows 5 link cards with zero context — no counts, no recent activity, no "what needs attention." A marketer opens this and sees links, not a workspace.

### 3. Generate page is a 1,144-line monolith
9+ form fields before you can generate. Targeting controls (hooks, pillars, pains, desires, objections) assume marketing expertise with zero explanation. Mix & Match mode is a hidden second interaction paradigm. No progress feedback during 30-60s AI generation.

### 4. Hashtags are destroyed on edit
`/content/[id]` sends `hashtags: []` on save. All hashtag data is lost when editing a post.

### 5. No content preview
Nowhere can you see what a post will look like on Instagram. Just raw text + image side by side.

### 6. Error handling is a mess
Mix of inline errors, `alert()` dialogs, and URL params. No toast system. `confirm()` for destructive actions.

### 7. Instagram management is split across 3 pages
Add account in Settings → link to product in ProductCard menu → see linkage back in Settings. No unified flow.

### 8. Discord setup on the wrong page
Technical developer instructions (bot tokens, public keys, interaction endpoints) are on the Schedules page, which is a marketer tool.

### 9. No bulk operations
Can't approve 10 posts at once. Can't batch-schedule. Every post is handled individually.

### 10. No onboarding
First-time user sees 5 cards with no guidance on what to do first. No setup wizard, no progress indicators.

---

## Page-by-Page Summary

| Page | Core Issue |
|---|---|
| **Login** | Generic — no context about what this tool is |
| **Dashboard** | No data, no quick actions, no onboarding |
| **Products** | ProductCard is 875 lines — card + modal + JSON editor + revision history all in one |
| **Generate** | 9+ fields, no progress, Mix & Match is hidden, results are ephemeral |
| **Content Queue** | No status counts, no bulk actions, cluttered action bar, no pagination |
| **Content Edit** | Hashtags lost on save, no Instagram preview, no image upload, "ad" type missing |
| **Schedules** | Discord setup mixed in, same 9-field complexity as Generate, no "run now" |
| **Settings** | Env var docs in UI, no token refresh, no account removal, auto-save without confirmation |

---

## What a Solopreneur Marketer Actually Needs

1. **Persistent sidebar navigation** — jump between sections fluidly
2. **Dashboard with real data** — counts, pending approvals, next scheduled post, recent activity
3. **Content calendar view** — temporal context for scheduled/published posts
4. **Instagram preview** — phone mockup showing how the post will actually look
5. **Bulk approve/schedule** — select multiple, distribute across a week
6. **Onboarding flow** — "1. Add product → 2. Connect Instagram → 3. Generate first post"
7. **Toast notifications** — replace all `alert()` and `confirm()`
8. **Generation presets** — "Quick post", "Product showcase", etc. Reduce 9 fields to 1 click
9. **Caption character counter** — Instagram has a 2,200 char limit
10. **Search across products and content**

---

## Component Patterns

### Reused Patterns
- **Page shell**: Every page has the same structure: `min-h-screen bg-background` → `header` (bg-surface, border-b, max-w-7xl, back arrow + title) → `main` (max-w-7xl, px-4, py-8). Consistent.
- **Card pattern**: `bg-surface rounded-lg border border-border` used everywhere — ProductCard, ContentCard, form sections, schedule items.
- **Button styles**: Primary (`bg-primary text-white rounded-lg`), secondary (border), destructive (text-error). Consistent.
- **Loading state**: Always `"Loading..."` text in `text-text-tertiary`. No skeleton loaders, no spinners.
- **Empty state**: Always centered text + link/button. No illustrations.
- **Modal pattern**: Fixed inset-0, bg-black/50 backdrop, centered card, ESC to close. Used in ProductCard (plan/profile/strategy), ImageLightbox, InstagramLinkModal.
- **Back navigation**: Always a "←" text link. No breadcrumbs, no back button component.

### Inconsistencies
- **Error handling**: Mix of inline errors (generate page), `alert()` (save failures in generate, product form), and URL params (settings page OAuth errors). No toast system.
- **Confirmation dialogs**: All use browser `confirm()` except the Discord setup which uses inline status.
- **Color tokens**: Most of the app uses CSS custom properties (`text-text-primary`, `bg-surface`), but ProductCard has hardcoded `bg-gray-900 text-white` for tooltips — breaks in light mode.
- **Border inconsistency**: Some components use `border-border`, others `border-border-strong`. No clear rule.
- **Text size hierarchy**: Headers use `text-xl font-bold`, section titles use `text-lg font-medium`, labels use `text-sm font-medium`. Consistent but the jump from page header to content is abrupt — no page-level descriptions or context.
- **The "←" back arrow**: Used everywhere but has no accessible label. Screen readers just read "←".
- **Max-width inconsistency**: Dashboard/Products/Content/Schedules use `max-w-7xl`, Generate uses `max-w-4xl`, Settings/ContentEdit use `max-w-3xl`. No clear logic.

---

## Data Model

```
products
  ├── id, name, description
  ├── planFile, planFileName (markdown brief)
  ├── screenshots (JSON array of file paths)
  ├── profile (JSON → ProductProfile)
  ├── marketingStrategy (JSON → MarketingStrategy)
  ├── icp (JSON → ICP persona)
  ├── jtbd (JSON → JTBD[])
  ├── channelHints (JSON → string[])
  ├── landingUrl, attributionWebhookSecret
  ├── textProvider (gemini | huggingface)
  ├── extractionStatus (pending | extracting | done | failed)
  ├── extractionError
  ├── instagramAccountId → instagramAccounts.id
  └── createdAt

content
  ├── id, productId → products.id
  ├── mediaType (image | video), targetSurface (reel | post | story | ad)
  ├── content, hashtags (JSON), mediaUrl, publicMediaUrl
  ├── script, duration, audioUrl, captionsUrl
  ├── config (JSON), status (draft | approved | scheduled | posted)
  ├── scheduledAt, postedAt, instagramId
  ├── hookUsed, pillarUsed, targetType, targetValue
  ├── toneConstraints (JSON), visualDirection
  ├── generationParams (JSON), discordMessageId
  └── createdAt

instagramAccounts
  ├── id, instagramUserId, username
  ├── accessToken, tokenExpiresAt
  └── createdAt

productRevisions
  ├── id, productId → products.id (cascade delete)
  ├── field (planFile | profile | marketingStrategy)
  ├── content, textProvider, source (manual | extraction)
  └── createdAt

generationSchedules
  ├── id, productId → products.id (cascade delete)
  ├── platform, mediaType, targetSurface, config (JSON)
  ├── count, frequencyHours, preferredTime
  ├── enabled, lastRunAt
  └── createdAt

settings
  ├── id, key (unique), value
  └── (key-value store for TEXT_PROVIDER, DISCORD_BOT_TOKEN, etc.)
```

**Relationships**: Product → many Content items. Product → one Instagram account. Product → many Revisions. Product → many Schedules. Instagram accounts are global, linked to products via `instagramAccountId`.

---

## All Pain Points

### Critical
1. No persistent navigation — every page has its own header with a "←" back link
2. Hashtags are destroyed on edit — Content edit page sends `hashtags: []` on save
3. No global navigation — the "←" arrow is the only way to navigate
4. Generate page is a 1144-line monolith
5. No feedback during AI generation — can take 30-60+ seconds with zero progress indication
6. `alert()` used for errors in multiple places

### High
7. No content preview — nowhere can you see what a post will look like on Instagram
8. Product extraction is a black box
9. Mix & Match is undiscoverable
10. Schedule and Discord are on the same page
11. No bulk operations
12. Instagram account management is split across 3 places
13. Content type "ad" missing from edit page
14. No pagination anywhere
15. Tooltips in ProductCard use hardcoded dark colors

### Medium
16. No keyboard shortcuts
17. No search
18. No sort options
19. Settings page auto-saves text provider with no undo
20. No confirmation for logout
21. `confirm()` dialogs — browser-native, inconsistent
22. No responsive sidebar
23. No dark mode toggle
24. No image upload on content edit
25. Schedule form duplicates Generate form
26. Product count has no upper bound feedback
27. No way to regenerate a single post
28. Revision history is buried
29. No analytics or reporting
30. Environment variables listed in UI

### Low
31. No favicon fallback
32. "Loading..." text everywhere — no skeleton screens
33. No optimistic updates
34. URL not updated for filters
35. No "are you sure you want to leave" on unsaved forms

---

## Missing Features for a Solopreneur Marketer

### Must-Have
1. Persistent sidebar/tab navigation
2. Content calendar view
3. Instagram preview (phone mockup)
4. Bulk approve/schedule
5. Content analytics dashboard
6. Onboarding flow
7. Toast notification system
8. Unsaved changes protection

### Should-Have
9. Content templates/presets
10. Batch scheduling
11. Content performance tracking
12. Multi-platform support (Twitter/X)
13. Content recycling/evergreen queue
14. Draft collaboration
15. Image editing/regeneration
16. Caption character count
17. Hashtag management
18. Webhook/notification on publish
19. Export functionality
20. Rate limiting/cost warnings

### Nice-to-Have
21. A/B test variations
22. Content approval workflow via email
23. Brand asset library
24. Competitor analysis
25. AI content scoring
26. Scheduling timezone support
27. Mobile-responsive bottom nav
28. Keyboard shortcuts
29. Undo/redo for status changes
30. Search across all content

---

## API Routes

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Verify password, create session cookie |
| POST | `/api/auth/logout` | Destroy session |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get all settings as key-value map |
| PUT | `/api/settings` | Upsert a setting `{ key, value }` |

### Products
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List all products |
| POST | `/api/products` | Create product (multipart or JSON). Triggers async extraction if planFile present |
| GET | `/api/products/[id]` | Get single product |
| PUT | `/api/products/[id]` | Update product. Snapshots revisions. Re-triggers extraction if planFile changed |
| DELETE | `/api/products/[id]` | Delete product (cascades to schedules/revisions) |
| GET | `/api/products/[id]/suggestions` | Get rotation-aware suggestions for hooks, pillars, pains, desires, objections |
| POST | `/api/products/[id]/re-extract` | Re-run profile/strategy extraction |
| GET | `/api/products/[id]/revisions` | List revisions. Optional `?field=` filter |
| POST | `/api/products/[id]/revisions/[revisionId]/revert` | Revert field to revision content |

### Content (Posts)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/posts` | List all posts (desc by id). Optional `?status=` filter |
| POST | `/api/posts` | Create post manually |
| GET | `/api/posts/[id]` | Get single post |
| PUT | `/api/posts/[id]` | Partial update of post fields |
| DELETE | `/api/posts/[id]` | Delete post |

### Generation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Generate content via AI (multipart). Returns `{ posts: GeneratedPost[] }` |

### Schedules
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedules` | List all generation schedules with product name |
| POST | `/api/schedules` | Create generation schedule |
| PUT | `/api/schedules/[id]` | Partial update of schedule |
| DELETE | `/api/schedules/[id]` | Delete schedule |

### Cron / Scheduler
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cron/generate` | Cron endpoint. Checks due schedules, generates drafts, sends to Discord. Auth: `x-cron-secret` header |
| POST | `/api/scheduler/run` | Process scheduled posts (publish due posts) |

### Instagram
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/instagram/auth` | Redirect to Facebook OAuth. Optional `?productId=` |
| GET | `/api/instagram/callback` | OAuth callback. Exchange code → tokens. Upsert accounts |
| GET | `/api/instagram/account` | Get first connected IG account info |
| DELETE | `/api/instagram/account` | Delete ALL instagram accounts |
| GET | `/api/instagram/accounts` | List all IG accounts with linked products |
| POST | `/api/instagram/accounts` | Link IG account to product `{ productId, accountId }` |
| DELETE | `/api/instagram/accounts` | Unlink IG account from product `{ productId }` |
| POST | `/api/instagram/post` | Publish post to Instagram `{ postId }` |

### Discord
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/discord/setup` | Validate bot token, save config, send test message |
| POST | `/api/discord/interactions` | Discord interactions webhook (PING, button clicks, modal submit) |

### Media
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/media/[...path]` | Serve static media files from `public/media/` |

---

## DB Schema

### `products`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `name` | text | NOT NULL | — |
| `description` | text | NOT NULL | — |
| `plan_file` | text | nullable | — |
| `plan_file_name` | text | nullable | — |
| `screenshots` | text | nullable | JSON string[] |
| `profile` | text | nullable | JSON extracted profile |
| `marketing_strategy` | text | nullable | JSON extracted strategy |
| `icp` | text (json) | nullable | JSON ICP persona |
| `jtbd` | text (json) | nullable | JSON JTBD[] |
| `channel_hints` | text (json) | nullable | JSON string[] |
| `landing_url` | text | nullable | — |
| `attribution_webhook_secret` | text | nullable | — |
| `text_provider` | text | nullable | `gemini` \| `huggingface` |
| `extraction_status` | text | nullable | `pending` \| `extracting` \| `done` \| `failed` |
| `extraction_error` | text | nullable | — |
| `instagram_account_id` | integer | FK → `instagram_accounts.id` | — |
| `created_at` | integer (timestamp) | — | `new Date()` |

### `content`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `product_id` | integer | FK → `products.id` | — |
| `media_type` | text | NOT NULL | `image` \| `video` |
| `target_surface` | text | NOT NULL | `reel` \| `post` \| `story` \| `ad` |
| `content` | text | NOT NULL | — |
| `hashtags` | text | nullable | JSON array |
| `media_url` | text | nullable | — |
| `public_media_url` | text | nullable | — |
| `script` | text | nullable | — |
| `duration` | integer | nullable | seconds |
| `audio_url` | text | nullable | — |
| `captions_url` | text | nullable | — |
| `config` | text | nullable | JSON generation config |
| `status` | text | NOT NULL | `"draft"` |
| `scheduled_at` | integer (timestamp) | nullable | — |
| `posted_at` | integer (timestamp) | nullable | — |
| `instagram_id` | text | nullable | — |
| `hook_used` | text | nullable | — |
| `pillar_used` | text | nullable | — |
| `target_type` | text | nullable | `pain` \| `desire` \| `objection` |
| `target_value` | text | nullable | — |
| `tone_constraints` | text | nullable | JSON array |
| `visual_direction` | text | nullable | — |
| `generation_params` | text | nullable | full JSON |
| `discord_message_id` | text | nullable | — |
| `created_at` | integer (timestamp) | — | `new Date()` |

### `instagram_accounts`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `instagram_user_id` | text | nullable | — |
| `username` | text | nullable | — |
| `access_token` | text | NOT NULL | — |
| `token_expires_at` | integer (timestamp) | nullable | — |
| `created_at` | integer (timestamp) | — | `new Date()` |

### `product_revisions`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `product_id` | integer | NOT NULL, FK → `products.id` ON DELETE CASCADE | — |
| `field` | text | NOT NULL | `planFile` \| `profile` \| `marketingStrategy` |
| `content` | text | NOT NULL | — |
| `text_provider` | text | nullable | model used |
| `source` | text | NOT NULL | `manual` \| `extraction` |
| `created_at` | integer (timestamp) | — | `new Date()` |

### `generation_schedules`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `product_id` | integer | NOT NULL, FK → `products.id` ON DELETE CASCADE | — |
| `platform` | text | NOT NULL | `instagram` \| `twitter` |
| `media_type` | text | NOT NULL | `"image"` |
| `target_surface` | text | NOT NULL | `reel` \| `post` \| `story` \| `ad` |
| `config` | text | nullable | JSON generation config |
| `count` | integer | NOT NULL | `1` |
| `frequency_hours` | integer | NOT NULL | `24` |
| `preferred_time` | text | NOT NULL | `"09:00"` |
| `enabled` | integer (boolean) | NOT NULL | `true` |
| `last_run_at` | integer (timestamp) | nullable | — |
| `created_at` | integer (timestamp) | — | `new Date()` |

### `settings`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | PK | autoIncrement |
| `key` | text | NOT NULL, UNIQUE | — |
| `value` | text | nullable | — |

### Relations
- `products.instagram_account_id` → `instagram_accounts.id`
- `content.product_id` → `products.id`
- `product_revisions.product_id` → `products.id` (CASCADE)
- `generation_schedules.product_id` → `products.id` (CASCADE)

---

## Middleware

**Auth guard** for all routes except public paths.

- **Public paths (no auth):** `/login`, `/api/auth/login`, `/api/cron/*`, `/api/discord/interactions`
- **Static assets:** `/_next/*` and paths with `.` (file extensions) pass through
- **All other routes:** Check `buzz_session` cookie. Value must equal SHA-256 hash of `"buzz:${ADMIN_PASSWORD}"`. If missing/mismatched, redirect to `/login`.

---

## Phase 1: Design Brief — Navigation + Dashboard Refactor

**1. Feature Summary**
Refactor the app shell to introduce persistent sidebar navigation, command palette, toast notifications, skeleton loading states, and a data-rich dashboard. This replaces the current "← back arrow" navigation pattern and dead-end dashboard with a Linear/Vercel-style workspace that supports keyboard-first power users.

**2. Primary User Action**
Navigate fluidly between sections (Products, Generate, Content, Schedules, Settings) without losing context. The dashboard should surface "what needs attention" — pending approvals, recent activity, next scheduled post — so users can act immediately.

**3. Design Direction**
- **Color strategy:** Restrained (existing). Signal Blue ≤10% of screen. Neutrals carry structure.
- **Theme scene:** Indie marketer at their desk, morning coffee, checking what needs attention before diving into content creation. Light mode default, dark mode automatic.
- **Anchor references:** Linear (sidebar nav, command palette, keyboard shortcuts), Vercel (minimal chrome, fast feedback, skeleton loaders), Raycast (command palette density, search-first interaction).

**4. Scope**
- **Fidelity:** Production-ready. Shipped-quality components.
- **Breadth:** App shell (sidebar, layout, command palette, toast system) + Dashboard page.
- **Interactivity:** Fully interactive. Keyboard shortcuts, focus management, optimistic updates.
- **Time intent:** Polish until it ships.

**5. Layout Strategy**
- **Left sidebar (240px collapsed, 280px expanded):** Fixed position. Logo + app name at top. Section links (Products, Generate, Content, Schedules, Settings) with icons + labels. Active state: subtle background tint + left border accent. Collapse to icon-only on mobile. Keyboard shortcut: `[` to toggle.
- **Main content area:** Max-width 1280px, centered. Proper padding (24px desktop, 16px mobile). Breadcrumbs optional (sidebar provides context).
- **Command palette (Cmd+K):** Centered overlay, 640px max-width. Search input at top. Results grouped by section (Pages, Products, Content, Actions). Keyboard navigation (↑↓ to move, ↵ to select, esc to close). Fuzzy search across navigation + content.
- **Toast stack:** Bottom-right corner. Max 3 toasts visible. Auto-dismiss after 5s (success/info) or manual dismiss (error). Slide-in animation.
- **Dashboard:** 3-column grid on desktop. Top row: 4 stat cards (Products count, Drafts pending, Scheduled this week, Posted this month). Middle row: Recent activity feed (last 5 actions) + Quick actions (Generate, Add Product, Connect Instagram). Bottom row: Next scheduled post card + Onboarding progress (if first-time user).

**6. Key States**
- **Empty dashboard (first-time user):** Onboarding card with 3-step progress: "1. Add your product → 2. Connect Instagram → 3. Generate your first post". Each step is a clickable action. Progress persists in localStorage.
- **Loading states:** Skeleton screens for all data-driven sections. Dashboard stats show skeleton cards. Recent activity shows skeleton list. No "Loading..." text.
- **Error states:** Toast notifications for transient errors. Inline error cards for persistent failures (e.g., "Failed to load products" with retry button).
- **Command palette:** Empty state: "No results found". Loading state: skeleton list. Populated: grouped results with icons + labels + keyboard shortcuts hints.
- **Sidebar:** Collapsed state: icon-only (48px width). Expanded state: icon + label. Mobile: hidden by default, slide-in on hamburger click.

**7. Interaction Model**
- **Sidebar navigation:** Click section link → navigate to page. Active section highlighted. Keyboard: `1-5` to jump to sections (when not focused on input). `[` to toggle sidebar collapse.
- **Command palette:** `Cmd+K` (Mac) / `Ctrl+K` (Windows) to open. Type to search. `↑↓` to navigate results. `↵` to select. `esc` to close. Click backdrop to close. Results update as you type (debounced 150ms).
- **Toast notifications:** Appear bottom-right. Stack vertically (max 3). Auto-dismiss after 5s. Click to dismiss manually. Error toasts require manual dismiss. Animation: slide-in from right (200ms ease-out).
- **Dashboard stats:** Click stat card → navigate to filtered list (e.g., click "Drafts pending" → `/content?status=draft`). Hover: subtle border shift. No lift/shadow.
- **Quick actions:** Click button → navigate to page. Hover: background tint.
- **Onboarding:** Click step → navigate to page. Completed steps show checkmark. Progress auto-updates when user completes action.

**8. Content Requirements**
- **Sidebar labels:** Products, Generate, Content, Schedules, Settings. Icons: Lucide React (package, sparkles, inbox, calendar, settings).
- **Dashboard stats:** "Products" (count), "Drafts Pending" (count), "Scheduled This Week" (count), "Posted This Month" (count). Subtle labels below numbers.
- **Recent activity:** "No recent activity" (empty state). Otherwise: "{user} generated 5 posts for {product}" / "{user} approved {post}" / "{user} scheduled {post} for {date}". Relative timestamps ("2m ago", "1h ago", "Yesterday").
- **Quick actions:** "Generate Content", "Add Product", "Connect Instagram". Icons + labels.
- **Onboarding:** "Welcome to Buzz" heading. "Get started in 3 steps" subheading. Steps: "Add your first product" / "Connect your Instagram account" / "Generate your first post". Each with description + action button.
- **Command palette:** Search placeholder: "Search or type a command...". Result groups: "Pages" / "Products" / "Content" / "Actions". Each result: icon + label + optional shortcut hint (e.g., "⌘G" for Generate).
- **Toast messages:** "Product created" / "Post approved" / "Scheduled for {date}" / "Failed to save. Please try again."

**9. Recommended References**
- `reference/layout.md` — sidebar + main content layout strategy
- `reference/interaction-design.md` — command palette, keyboard shortcuts, focus management
- `reference/animate.md` — toast animations, skeleton loading transitions
- `reference/onboard.md` — onboarding flow design
- `reference/harden.md` — error handling, toast system, loading states

**10. Open Questions**
None. The direction is clear from PRODUCT.md (Linear reference), DESIGN.md (Signal Blue, flat elevation), and the user's explicit pattern selections.

---

**Implementation plan:**
1. **App shell refactor** — Create `Sidebar` component, `CommandPalette` component, `Toast` system, `Skeleton` components. Update `layout.tsx` to use sidebar layout.
2. **Dashboard redesign** — Fetch real data (product count, content counts by status, recent activity). Build stat cards, recent activity feed, quick actions, onboarding card.
3. **Keyboard shortcuts** — `Cmd+K` for command palette, `1-5` for section navigation, `[` for sidebar toggle.
4. **Toast integration** — Replace all `alert()` and `confirm()` calls with toast notifications.
