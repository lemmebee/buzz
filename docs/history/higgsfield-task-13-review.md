# TASK 13 — CTO Review

> ## ⛔ RULE 0 — NO ASSET GENERATION
> Balance: **1441.15 credits.**

**Verdict:** Accepted with one must-fix. The settings migration and hardening are done; a 28 KB blob is leaking into the settings API.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning
--cost                             → image 2, video 4   (async refactor intact)
```

`createTextProvider` becoming async was the risky part of this task — it sits on the **default buzz path**. Callers check out: `factory.ts:54` returns the promise from an already-async function, and `scripts/test-insta-post.ts:44` awaits. `tsc` is clean and `--cost` still resolves the text provider correctly.

`.env.example` is correctly reduced to secrets and infra, with the pointer comment. Advanced section added for the binary paths.

---

## MUST FIX

### M18 — The model cache is polluting `GET /api/settings`

`HIGGSFIELD_MODELS_CACHE` is stored as a row in the `settings` table:

```
sqlite3> select length(value) from settings where key='HIGGSFIELD_MODELS_CACHE';
28247
```

`src/app/api/settings/route.ts:16` does `db.select().from(schema.settings)` and returns **every row**. So every settings page load now ships a **28 KB JSON blob** of 48 model definitions alongside a handful of short config values — and it will keep growing as the catalog does.

It is also conceptually wrong: `settings` is user-editable configuration, this is a derived cache. It shows up in the same payload the settings UI iterates over.

**Fix — pick one:**

- **Preferred:** move the cache to its own table (`higgsfield_models`, columns per Task 10's original spec). Clean separation, queryable by type, no blob parsing on read.
- **Minimum:** keep it in `settings` but **exclude it from the `GET /api/settings` response** by key prefix, and have the settings page fetch it from `/api/settings/higgsfield-models` (which already exists).

Either way, add a guard so future derived caches don't land in the config payload — e.g. a `_CACHE` suffix convention that the settings GET filters out.

---

## Not yet verified — needs the app running

`seedSettingsFromEnv()` runs from `src/instrumentation.ts`, which only executes on app boot. I verify with scripts, so it has not run here. The `settings` table currently holds only `TEXT_PROVIDER` and the cache blob.

**You must verify this yourself** — it's the one part of the migration nothing else exercises:

1. `npm run dev`, confirm `[settings] seeded <KEY> from env` lines for keys present in `.env` (e.g. `CONTENT_ENGINE`).
2. Confirm the Settings UI shows those values.
3. Remove the env var, restart, confirm the setting persists from the DB.
4. Confirm a key with **no** env var and **no** DB row falls back to its hardcoded default rather than empty string.

Point 4 matters: with the env fallback removed, a missing setting must resolve to the default, not `""`. An empty provider name would fail confusingly.

---

## Remaining before this feature is done

1. **M18** above.
2. **Seed verification** (the four checks).
3. **Regression check:** with `CONTENT_ENGINE=buzz`, generate an image and confirm `[image]` logs and unchanged behaviour. This is free — it uses the existing pipeline, not Higgsfield.
4. **One end-to-end Higgsfield run through the real UI** (~2 credits) — *owner's call, do not run unprompted.*

Everything else is complete.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- New tables/columns nullable; `npm run db:push`.
- **Do NOT commit.**
- Report lint counts exactly as printed.
