# AI Post-Composition Engine - Design Spec

Date: 2026-05-28
Status: Draft (for review)

## 1. Summary

Replace today's "one generated image + separate caption" output with **composed, on-brand, editable Instagram posts**: a layout system where each post is built from many typed visual elements (headline, subhead, body, pills, icons, cards, buttons, optional photo), styled by the product's own derived brand identity, and hand-editable in an embedded canvas.

Guiding model: **system x N archetypes x varied imagery**.

The work is **additive**. The current Pollinations image provider is not removed; it is demoted to one optional element supplier (a background photo).

## 2. Problem

Current pipeline (`src/lib/generate.ts` + `src/lib/providers/image.ts`) generates a single Pollinations/Flux image with text and people stripped (`src/lib/brain/imagePromptBuilder.ts`). Result: technically pretty images that carry no message and do not market anything. Reference targets (editorial brand feeds) show the gap is not image quality, it is **composition + message + on-brand styling**: real typography, layout, headline/value-prop, logo, and decoration that diffusion models cannot render reliably.

## 3. Core concepts

- **Scene**: the editable artifact. A JSON document of typed elements. The rendered PNG is a projection of the Scene.
- **Element**: a typed node in a Scene (text, image, shape, icon, pill, button, logo, plus simple composites like chat-bubble and stat block).
- **Archetype**: a layout skeleton (where elements go). A builder function, not a static file. 10 in v1.
- **BrandKit**: a product's visual identity as render-ready data (palette, type, logo, icon style, shape traits, photo treatment). Derived per product. The per-product skin.
- **Brief**: per-post output of the LLM that chooses archetype + writes on-image copy + specifies imagery. Sits on top of the existing subject-selection brain.
- **Renderer**: turns a Scene into a PNG. Pluggable interface; v1 implementation is **Satori (Scene -> SVG) + @resvg/resvg-js (SVG -> PNG)**. Satori is the single layout engine on both server and editor, which guarantees render/edit parity.

Decoupling: identity lives in the **BrandKit** (per product), layout lives in **archetypes** (shared), copy/imagery decisions live in the **Brief** (per post). No fixed style-preset menu (it would not scale to many products and would cause look-alikes).

## 4. Architecture

```
PER POST
  Layer 1  BRIEF (LLM)         archetype + headline + subhead + body? + imagery + accent
     |  (subject {pillar,hook,target} comes from existing brain + rotation)
  Layer 2  BRANDKIT (per product, derived)   palette + type + logo + traits
     |
  Layer 3  COMPOSE
     ARCHETYPE BUILDER  buildScene(archetypeId, brandKit, brief) -> Scene JSON
     |
     SATORI (Scene -> SVG)  single layout engine, runs on BOTH server and browser
       |- SERVER:  SVG -> @resvg/resvg-js -> PNG
       |- EDITOR:  live Satori SVG preview + HTML drag/resize handles that mutate Scene JSON
     |
     IMAGERY SUPPLIER       Pollinations/Flux (optional bg photo) | gradient | solid
```

Pluggability: the Scene model is neutral. The renderer and editor both consume Scene via Satori. A future renderer (template API, Penpot) or imagery supplier can be added behind the same interfaces (`src/lib/providers/registry.ts`, `factory.ts`) without touching Layers 1-2.

**Parity**: there is no Konva and no node-canvas. Satori is the one layout engine; the editor previews with the same Satori output it will be saved as, and the server rasterizes that identical SVG to PNG with resvg. This avoids the react-konva vs node-canvas text-metric mismatch (Konva issue #1798) and needs no headless browser (important on the AppArmor-restricted deploy box).

## 5. Identity mechanism (how a post matches the product)

The post renders with the product's **real extracted palette, fonts, and logo**, so it is on-brand by construction, not by matching to a nearest template.

BrandKit derivation (extends `src/lib/brain/extract.ts`):

1. Extract from `landingUrl`: dominant palette, logo (favicon / og:image / header logo), font families (CSS `font-family`, `@font-face`, Google Fonts links), OG image/screenshots.
2. Combine with `profile.visualIdentity {style, colors, mood}` and `brandPersonality` (already in `src/lib/brain/types.ts`).
3. Compute style traits (radius, density, icon style, photo treatment) from brand DNA.
4. Cache on the product; refreshable; manual override optional, never required.

Cold start (no site / thin brand): derive a sane default from `brandPersonality` keywords. Still computed per product, not a canned skin.

Scales: N products -> N unique kits. No menu, no collision.

**Minimal override (v1)**: extraction is imperfect, and a wrong logo/color poisons every post for that product. So v1 exposes a minimal correction path on the BrandKit: replace the logo and set/adjust palette hexes (reusing existing asset handling). Full asset-management UI (custom font upload, icon sets) is v2.

### Font pipeline (key risk)

Satori accepts **TTF/OTF/WOFF** (not WOFF2); resvg accepts **TTF/OTF**. Google Fonts CSS API serves WOFF2, so the pipeline must yield a TTF.

1. Resolve `font-family` from the site CSS (`@font-face` src URLs, `font-family` declarations, Google Fonts `<link>`).
2. If it maps to a known free font, pull the **TTF** from `@fontsource/*` (ships TTF, OFL) - no conversion.
3. If only WOFF2 is available, decompress WOFF2 -> TTF (`@woff2/woff2-rs`, Rust/napi; or `woff2`).
4. Otherwise classify (serif / sans / display) and substitute a close free OFL font (substitution fallback is accepted).
5. Feed the resolved TTF to **both** Satori (`fonts[]`) and resvg (`fontFiles[]`, with `loadSystemFonts=false`). Same file both sides -> identical metrics.

License: OFL permits embedding fonts in raster images (the PNG posts) for commercial use; we do not redistribute the font files themselves.

## 6. Variety mechanism

Two axes stack so output does not repeat:

- **Subject variety**: existing brain menu (`contentPillars`, `hooks`, `painPoints`, `desirePoints`, `objections`) + `src/lib/brain/rotation.ts` `suggestLeastUsed()` picks the least-used pillar/hook/target. Unchanged.
- **Layout variety**: archetype selection = **rule-map default + rotation tiebreak**. Map `hook.type` to a natural archetype (e.g. `social-proof` -> quote/stat, `desire` -> display-over-imagery, `pain` -> editorial, `curiosity` -> editorial question, `contrarian` -> bold display); when multiple fit, pick the least-used archetype (reuse rotation).
- Plus accent rotation and imagery-style variation.

Combinatorial: subject x archetype x imagery x accent x copy.

## 7. Element library (v1 core set)

- `background` (solid/gradient from BrandKit, or one optional Flux photo)
- `text` (headline / subhead / body; supports inline pill annotations)
- `pill` / tag (shape + text)
- `icon` / line-art (from BrandKit icon style)
- `shape` / divider (rule, block, scrim)
- `image` (logo or photo)
- `button` (label + container)
- composite: `chatBubble`, `statBlock` (built from shape + text)

Deferred to v2: device-frame and real app-screenshot "product UI mockup" elements (need per-product screenshots; must be per-product-skinned to avoid a generic look).

## 8. Archetypes (v1 = 10)

Each is a `buildScene(brandKit, brief) -> Scene` function.

1. Editorial headline (curiosity/pain; announce)
2. Display over imagery (desire; aspirational)
3. Photo + serif caption (lifestyle/feature)
4. Line-art / icon card (single concept/benefit)
5. Quote / chat bubble (social-proof/objection)
6. Stat / proof card (numbers)
7. Numbered steps / listicle (how-to/educational)
8. Feature callout / mini-grid (feature highlight)
9. Announcement banner (launch/news)
10. Long body-copy / article (explanatory paragraph + inline pill; needs robust auto-fit/overflow handling)

## 9. Data model

### Scene (new types, `src/lib/compose/scene.ts`)

The Scene must be expressible as a Satori-renderable tree (flexbox layout). Each element maps to a Satori node; absolute positioning via `position:absolute` + box coords.

```ts
Scene = { w, h, background: Background, elements: Element[] }
Element = {
  id, type: 'text'|'image'|'shape'|'icon'|'pill'|'button'|'logo'|'chatBubble'|'statBlock',
  x, y, w, h, rotation, z,
  slot?: 'headline'|'subhead'|'body'|'bg'|'logo'|...,   // links to brief field
  locked?, ...typeProps
}
text  -> { content, font, size, weight, color, align, lineHeight }   // wrapping via Satori flexbox; box-shadow not filter
image -> { src, fit: 'cover'|'contain' }   // photos passed to resvg as <image href=data:...>; Satori has no image-fill
```

Satori constraints baked into the model: box-shadow (not CSS `filter: drop-shadow`); linear/radial gradients OK; no advanced typography (ligatures/RTL/OpenType) - fine for short Latin headlines.

### Schema changes (`drizzle/schema.ts` + migration)

- `content.scene` (JSON): the editable Scene document.
- `content.mediaUrl` / `publicMediaUrl`: unchanged, now hold the rendered PNG.
- `products.brandKit` (JSON) + `products.brandKitUpdatedAt`: cached derived BrandKit.

## 10. Component breakdown (files)

- `src/lib/compose/scene.ts` - Scene/Element types.
- `src/lib/compose/elements/*` - element constructors (core set).
- `src/lib/compose/satoriTree.ts` (new) - Scene -> Satori JSX/element tree (shared by server + editor).
- `src/lib/compose/archetypes/*` - 10 builder functions + an index/selector (rule-map + rotation tiebreak).
- `src/lib/compose/render/satoriResvg.ts` - `SceneRenderer` impl (Satori -> SVG -> @resvg/resvg-js -> PNG; font loading).
- `src/lib/compose/fonts.ts` (new) - resolve/fetch/decompress/cache TTF; substitution.
- `src/lib/providers/{types,registry,factory}.ts` - register `SceneRenderer` (pluggable).
- `src/lib/brain/extract.ts` - extend with BrandKit derivation (cheerio/postcss + node-vibrant + open-graph-scraper) + font resolution.
- `src/lib/brain/brandkit.ts` (new) - BrandKit type, derive, cache, cold-start defaults.
- `src/lib/generate.ts` + `src/lib/prompts.ts` - extend Brief (archetype/headline/subhead/body/imagery/accent) + **zod** schema.
- `src/lib/providers/image.ts` / `images.ts` - Pollinations as bg-image supplier (sharp cover/duotone) for image slots.
- `src/lib/worker.ts` - pipeline wiring (generate -> buildScene -> render -> store scene + PNG).
- `src/app/content/[id]` + new editor component - Satori SVG preview + HTML drag/resize handles (no Konva).
- `src/app/api/content` (or `posts`) - save edited Scene -> server Satori/resvg re-render -> revision (`src/lib/revisions.ts`).
- `src/app/fonts` - serve the resolved BrandKit fonts to the editor (same TTF the server uses).

## 11. Data flow (end to end)

1. Trigger (cron `src/lib/worker.ts` or `POST /api/generate`).
2. Subject: brain + rotation pick `{pillar, hook, target}`.
3. BrandKit: load cached, or derive from `landingUrl`/profile (on demand).
4. Brief: LLM returns caption + hashtags (existing) plus archetype + headline + subhead + body? + imagery + accent.
5. Imagery: if the chosen archetype needs a photo, Pollinations fills the bg slot; else gradient/solid from BrandKit.
6. Compose: `buildScene(archetype, brandKit, brief) -> Scene`.
7. Render: Scene -> Satori SVG -> resvg PNG -> `public/media`.
8. Store: `content` row with `scene`, `mediaUrl`, `publicMediaUrl`, existing metadata (`pillarUsed`, `hookUsed`, ...).
9. Optional edit: user opens the post, edits via Satori-preview + handles, saves -> persist Scene -> **server Satori/resvg re-render** PNG -> revision.
10. Publish uses the PNG (existing Instagram path).

## 12. Error handling

- **Extraction failure** (no/blocked site, no logo/fonts): fall back to profile + brandPersonality-derived defaults. Never block generation.
- **Font unresolvable**: classify + substitute free font. Log the substitution on the BrandKit.
- **Imagery failure** (Pollinations down/slow): fall back to gradient/solid background; post still composes.
- **Render failure**: surface the error, keep the Scene (still editable), do not write a broken PNG.
- **Editor save / re-render parity**: re-render on save is a **server Satori/resvg** call. Because the editor previews with the same Satori engine + same TTF, divergence is minimal by construction; the parity test guards the SVG->PNG rasterization step.

## 13. Testing

- Archetype builders: snapshot the Scene JSON for fixed `(brandKit, brief)` inputs (all 10).
- Satori tree: snapshot the SVG for fixed Scenes (deterministic with fixed fonts).
- Renderer: smoke test (PNG non-empty, 1080x1350, fonts applied) per archetype.
- Brief: zod schema parse on representative LLM outputs.
- BrandKit derivation: unit test against saved sample HTML (palette/logo/font extraction); cold-start defaults.
- Font resolution: unit test (known family -> @fontsource TTF; woff2-only -> decompress; unknown -> classify + substitute).
- Editor round-trip: Scene -> edit ops -> Scene integrity; editor SVG == server SVG for same Scene.
- Parity: rasterize the same SVG and assert PNG stable within tolerance.

## 14. Scope and phasing

In scope (this spec): **P0-P2**.

- **P0 Foundations**: Scene types; Satori tree mapping; font pipeline (resolve/fetch/decompress/cache/substitute); BrandKit type + derivation + cache; schema migration.
- **P1 Generation makes editable scenes**: 10 archetype builders; Brief changes (+zod); imagery supplier (sharp); Satori/resvg `SceneRenderer` behind the interface; pipeline wiring; tests. End state: the autonomous pipeline emits branded, on-message, editable posts.
- **P2 Embedded editor**: Satori SVG live preview + HTML drag/resize handles; edit text, swap image, move/resize; save -> server Satori/resvg re-render -> revision.

Deferred to v2 (separate spec): P3 editor growth (add/delete elements, layers, font/color pickers, freeform); device-frame + app-screenshot UI-mockup elements; dedicated brand-asset upload UI; alternate renderer adapters; generative-bg suppliers.

## 15. Risks and spikes (do early)

1. **Satori/resvg fidelity spike** (highest): render 2-3 archetypes through Satori -> SVG -> resvg on the deploy box with a real BrandKit TTF; confirm gradients, box-shadow, line-height, and multi-line wrap look acceptable; confirm `loadSystemFonts=false` + explicit 1080x1350. Verified conditional (workflow): works given TTF-only fonts, box-shadow (not CSS filter), no advanced typography.
2. **Font acquisition spike**: from a real site's `@font-face`, obtain a TTF (via @fontsource or woff2 decompress) and feed Satori+resvg; verify substitution path when the font is proprietary/unfetchable. Verified conditional (workflow): works only for fonts with discoverable src or in @fontsource/Google; else substitute.
3. **BrandKit extraction reliability**: sites vary; confirm the cheerio/node-vibrant/og-scraper chain + fallbacks never block generation.
4. **resvg-js image handling**: confirm photos composite correctly (Satori has no image-fill; pass via resvg `<image href=data:...>` or sharp pre-composite).

## 16. Resolved decisions

1. BrandKit storage: JSON column on `products` (no separate history table in v1). **Resolved.**
2. Manual brand-asset override in v1: **minimal** (replace logo + adjust palette hexes), reuse existing asset handling. Full UI = v2. **Resolved.**
3. Re-render on save: **server Satori/resvg** (one source of truth, consistent fonts). **Resolved.**
4. Long body-copy / article archetype: **in v1** (archetype #10). Requires robust auto-fit/overflow. **Resolved.**
5. Render engine: **Satori + @resvg/resvg-js**, no Konva/node-canvas (parity bug #1798 + AppArmor native-build friction). **Resolved (workflow spike).**
6. Editor model: **Satori everywhere** - SVG preview + HTML handles, no react-konva. True parity. **Resolved.**

## 17. Scope boundaries (resolved)

1. **Surfaces/platforms**: v1 renders **Instagram 4:5 image posts only** (1080x1350). Story 9:16, twitter sizes, and `ad` surface are deferred. Archetypes target the single 4:5 canvas. **Resolved.**
2. **Video**: **images only**. `src/lib/video/orchestrator.ts` is untouched in v1 and keeps using raw Flux scene frames. Composition applies to static image posts only. **Resolved.**

### Non-goals (v1)

- Multi-aspect / story / twitter / ad canvases.
- Video scene composition.
- Carousels (already removed from Buzz, commit #19).
- Device-frame / app-screenshot UI-mockup elements.
- Full brand-asset management UI (custom font/icon upload).
- Alternate renderer adapters (Polotno/Penpot/headless) and generative-bg suppliers.

## 18. Tooling stack (verified via spike)

New dependencies (all free / OSS / API-key-or-none; verified current + maintained via the tooling-research workflow):

| Role | Package | Version | Notes |
|---|---|---|---|
| Server layout | `satori` | ^0.11 | Scene -> SVG, pure JS, no native build, runs in browser too |
| Server raster | `@resvg/resvg-js` | ^2.6 | SVG -> PNG, prebuilt Rust binaries (Linux gnu/musl), no browser |
| Brief validation | `zod` | ^4 | replaces hand-rolled normalizers for LLM output |
| HTML parse | `cheerio` | ^1.2 | BrandKit extraction, no browser |
| CSS parse | `postcss` | ^8.5 | theme-color + CSS custom props |
| Color palette | `node-vibrant` | ^4 | 6-swatch from logo/og-image (uses sharp) |
| OG/logo | `open-graph-scraper` (+ favicon fallback) | ^4 | og:image / favicon / theme-color |
| Fonts (known) | `@fontsource/*` | ^5.2 | ships TTF, OFL |
| Fonts (woff2->ttf) | `@woff2/woff2-rs` (or `woff2`) | latest | only when WOFF2-only |
| Image ops | `sharp` | 0.34 (installed) | bg fetch, cover-fill 1080x1350, duotone tint |

Removed from earlier drafts: `konva` / `react-konva` (server parity bug #1798), `canvas` / node-canvas (native build friction on AppArmor), any headless browser (Chromium sandbox fails on the box).

### Hard constraints (from conditional verdicts)

- Fonts: **TTF/OTF only** for Satori (WOFF2 must be decompressed); resvg `loadSystemFonts=false`; always register a fallback.
- Shadows: **box-shadow** only (CSS `filter: drop-shadow` unreliable in Satori).
- Photos: Satori has **no image-fill**; composite via resvg `<image href=data:...>` or sharp.
- Typography: no ligatures/RTL/OpenType features (acceptable for short Latin headlines).
- Font fidelity is **best-effort**: only fonts with discoverable `@font-face` src or in @fontsource/Google resolve exactly; else classify + substitute (OFL, license-safe for raster embedding).

## 19. Tooling alternatives considered (appendix)

Decision was made by role. Summary of what was evaluated and why rejected.

**Renderer / design tool**
- Canva MCP connector (claude.ai): best quality but not callable from a server backend; interactive only. Dev/demo only.
- Canva Connect API (autofill/brand templates): **Enterprise-only (paid)** + per-user OAuth. Rejected (cost).
- Canva MCP server (Buzz as MCP client): Magic Design free on all plans, but per-user **OAuth** (bad for headless cron), unconfirmed token reuse, ToS grey area. Rejected (auth risk).
- APITemplate.io / Imejis.io / Pictify / HCTI: real free tiers + API key, but monthly caps, templates + data live off-platform, no in-app editing. Kept as possible future adapter, not v1.
- Bannerbear / Placid / Templated: not free for production. Rejected (cost).
- Polotno SDK: full editor + render, but freemium (paid for prod). Rejected (cost).
- Penpot (MCP + REST, self-host): OSS, free, personal-token (headless-friendly), but low-level/under-documented API + you host it. Kept as possible future renderer adapter.
- firethering 9 apps / openalternative (Inkscape, GIMP, Krita, Scribus): GUI desktop apps, no cron API. Rejected (not automatable; Penpot is the only one with an API).
- In-repo Satori + resvg: free, unlimited, in-process, no browser, AppArmor-safe, editable via Scene JSON. **Chosen.**
- In-repo Playwright/HTML screenshot: full fidelity but headless Chromium fails on the AppArmor box. Rejected (env-fragile).
- Konva / react-konva (+ node-canvas): editable + free, but react-konva vs node-canvas text-metric mismatch (issue #1798) breaks parity, and node-canvas native build is heavy on the box. Rejected (parity + build).

**Editor**
- Satori SVG preview + HTML handles: same engine as render = true parity, no extra canvas lib. **Chosen.**
- react-konva: nice batteries-included move/resize, but preview != Satori PNG (drift) and adds a canvas stack. Rejected.
- fabric.js: not React-native, heavier integration. Rejected.
- tldraw: infinite-canvas, $6k/yr commercial license. Rejected (cost + wrong shape).

**Imagery supplier (background photo only)**
- Pollinations/Flux: free, fast, already wired, good raw imagery. **Kept** (bg slot supplier).
- Gemini Flash Image / Ideogram (text-in-image): one-shot variety, but brand/type/logo drift + not deterministic/editable. Optional future alt, not primary.

**Watch list (not usable now)**
- Claude Design (Anthropic): AI canvas + design systems, conceptually ideal, but research preview with no public API.
