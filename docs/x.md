# X.com Support Plan (Instagram Parity)

Goal: support X.com posting with the same product flow we already have for Instagram.

## Scope (keep it simple)
- Link one X account to a product (same pattern as Instagram account linking).
- Generate content for X from the same generation screen.
- Save X posts in the same posts table flow.
- "Post Now" to X from content detail screen.
- Update status to `posted` and store external post id.

## What to build

### 1. Database parity
- Add `x_accounts` table (similar to `instagram_accounts`):
  - `id`, `x_user_id`, `username`, `access_token`, `refresh_token`, `token_expires_at`, `created_at`
- Add `x_account_id` to `products` (same as `instagram_account_id` pattern).
- Add `platform` to `posts` (`instagram | twitter`) so one posting flow can route correctly.
- Add `x_post_id` to `posts` to store published X id.

### 2. OAuth + account linking parity
- Add routes:
  - `/api/x/auth` (start OAuth)
  - `/api/x/callback` (exchange code and save tokens)
  - `/api/x/accounts` (list/link/unlink account to product)
- Build `XLinkModal` mirroring `InstagramLinkModal` behavior.
- Add "Link X" action in product UI.

### 3. Post publishing parity
- Add `/api/x/post` route, mirroring `/api/instagram/post` shape (`{ postId }`).
- In route:
  - Load post + product + linked X account.
  - Build text from `content` + hashtags.
  - If `mediaUrl` exists, upload media then post with media.
  - If no `mediaUrl`, publish text-only post.
  - On success: set `status = posted`, `postedAt`, `x_post_id`.

### 4. UI parity
- `generate` page:
  - Add platform selector (`instagram`, `twitter`).
  - Pass chosen platform to `/api/generate`.
- `content/[id]` page:
  - Route Post Now by post platform:
    - Instagram -> `/api/instagram/post`
    - Twitter/X -> `/api/x/post`
- Keep existing status workflow unchanged (`draft -> approved -> posted`).

### 5. Prompt parity
- Keep current generator architecture.
- Use existing `twitter` platform prompt rules already in `src/lib/brain/prompts.ts`.
- Add lightweight guardrails before publish:
  - clip or reject content over X length limits
  - keep hashtags low (0-2 recommended)

## Delivery order
1. DB migration + schema updates.
2. X OAuth routes + account linking UI.
3. X post publish route.
4. Platform selector in generate page + Post Now routing.
5. Basic end-to-end test script (`scripts/test-x-post.ts`).

## Done criteria
- User can link an X account to a product.
- User can generate X content and save it as posts.
- User can click Post Now and see post status become `posted`.
- Published X id is stored in DB.
- Existing Instagram flow still works unchanged.
