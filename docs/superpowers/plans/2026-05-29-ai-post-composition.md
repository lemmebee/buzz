# AI Post-Composition Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate composed, on-brand, editable Instagram posts (Scene JSON + per-product BrandKit + 10 archetypes), rendered headless with Satori -> SVG -> resvg, with a light embedded editor.

**Architecture:** A post is a `Scene` (typed elements at 1080x1350). Per-product `BrandKit` (derived from the landing site + profile) supplies palette/fonts/logo. An LLM `Brief` picks an archetype and writes on-image copy; an archetype builder turns `(BrandKit, Brief)` into a Scene. Satori is the single layout engine on both server and editor; the server rasterizes the SVG to PNG with `@resvg/resvg-js`. No Konva, no node-canvas, no headless browser (the deploy box blocks Chromium under AppArmor). Pollinations/Flux is demoted to an optional background-photo supplier.

**Tech Stack:** Next.js 14 (app router), React 18, TypeScript 5, drizzle + better-sqlite3, `satori`, `@resvg/resvg-js`, `zod`, `cheerio`, `postcss`, `node-vibrant`, `open-graph-scraper`, `@fontsource/*`, `@woff2/woff2-rs`, `sharp` (already installed), `vitest` (new, test runner).

Spec: `docs/superpowers/specs/2026-05-28-ai-post-composition-design.md`. Diagram: `...-architecture.svg`.

---

## File map

Created:
- `src/lib/compose/scene.ts` - Scene/Element types + small constructors.
- `src/lib/compose/satoriTree.ts` - `sceneToSatori(scene)` -> Satori node tree.
- `src/lib/compose/fonts.ts` - `resolveFont()`: acquire/decompress/cache/substitute TTF.
- `src/lib/compose/render/satoriResvg.ts` - `SceneRenderer` (Satori -> SVG -> resvg -> PNG).
- `src/lib/compose/archetypes/*.ts` - 10 builders + `index.ts` (`ARCHETYPES`, `selectArchetype`).
- `src/lib/brain/brandkit.ts` - BrandKit type, `deriveBrandKit`, `getCachedBrandKit`, `coldStartBrandKit`.
- `src/lib/brain/briefSchema.ts` - zod `briefSchema`.
- `src/app/api/content/[id]/scene/route.ts` - save edited Scene -> re-render -> revision.
- `src/app/api/fonts/[family]/[weight]/route.ts` - serve BrandKit TTFs to the editor.
- `src/app/api/products/[id]/brandkit/route.ts` - minimal BrandKit override (logo + palette).
- `vitest.config.ts`, `tests/**` - test runner + tests.

Modified:
- `drizzle/schema.ts` - `products.brandKit`, `products.brandKitUpdatedAt`, `content.scene`.
- `src/lib/providers/types.ts` - `SceneRenderInput/Output/SceneRenderer`.
- `src/lib/providers/registry.ts` + `factory.ts` - register/get/has + `createSceneRenderer()`.
- `src/lib/providers/image.ts` / `images.ts` - imagery supplier (Pollinations bg + sharp cover/duotone).
- `src/lib/brain/extract.ts` - derive + persist BrandKit after profile extraction.
- `src/lib/brain/prompts.ts` - Brief fields in the generation prompt.
- `src/lib/generate.ts` - emit Brief, compose Scene, render PNG, attach `scene`.
- `src/lib/worker.ts` - persist `content.scene`.
- `src/app/content/[id]` - embedded editor.

Dependency order: **Setup -> (Schema, Scene, Fonts) -> BrandKit -> Render -> Archetypes -> Brief/generate wiring -> Editor.**

---

## Task 0: Project setup (dependencies + test runner)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.smoke.test.ts`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install satori @resvg/resvg-js zod cheerio postcss node-vibrant open-graph-scraper @woff2/woff2-rs
npm install @fontsource/inter @fontsource/noto-serif @fontsource/jetbrains-mono
npm install -D vitest
```

- [ ] **Step 2: Add the test script to `package.json`**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Create a smoke test `tests/setup.smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("setup", () => {
  it("runs vitest and resolves @ alias deps", async () => {
    const satori = (await import("satori")).default;
    const { Resvg } = await import("@resvg/resvg-js");
    expect(typeof satori).toBe("function");
    expect(typeof Resvg).toBe("function");
  });
});
```

- [ ] **Step 5: Run the smoke test (expected PASS)**

Run: `npx vitest run tests/setup.smoke.test.ts`
Expected: 1 passed. (Confirms deps installed + alias works.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.smoke.test.ts
git commit -m "chore(compose): add satori/resvg/zod/extraction deps + vitest runner"
```

---

<!-- CLUSTER TASKS INSERTED BELOW ON STITCH: B Scene, C Fonts, E Schema, D BrandKit, F Render, G Archetypes, H Brief/wiring, I Editor -->


## Phase P0 - Foundations

### Task E.1: Add brandKit/scene columns, generate + run migration, verify round-trip

**Files:**
- Modify: `/home/lemmebee/sources/buzz/drizzle/schema.ts`
- Create: `/home/lemmebee/sources/buzz/drizzle/migrations/0012_scene_brandkit.sql` (auto-generated by drizzle-kit; rename if needed)
- Create: `/home/lemmebee/sources/buzz/src/lib/__tests__/schema-scene.test.ts`

- [ ] **Step 1: Write failing test for scene round-trip.**
  Create `/home/lemmebee/sources/buzz/src/lib/__tests__/schema-scene.test.ts`. This asserts the new columns exist by inserting a `content` row carrying a `scene` JSON object and reading it back as a parsed object (json mode), plus a `products` row carrying `brandKit` + `brandKitUpdatedAt`. It runs against the real sqlite file via the shared `db`, and cleans up its own rows.

  ```ts
  import { describe, it, expect, afterAll } from "vitest";
  import { eq } from "drizzle-orm";
  import { db, schema } from "@/lib/db";
  import type { Scene } from "@/lib/compose/scene";

  const TEST_NAME = "__schema_scene_test__";
  const insertedProductIds: number[] = [];
  const insertedContentIds: number[] = [];

  afterAll(() => {
    for (const id of insertedContentIds) {
      db.delete(schema.content).where(eq(schema.content.id, id)).run();
    }
    for (const id of insertedProductIds) {
      db.delete(schema.products).where(eq(schema.products.id, id)).run();
    }
  });

  describe("schema: brandKit + scene columns", () => {
    it("round-trips a scene JSON on content", () => {
      const scene: Scene = {
        w: 1080,
        h: 1350,
        background: { kind: "solid", color: "#101014" },
        elements: [
          {
            id: "h1",
            type: "text",
            x: 80,
            y: 200,
            w: 920,
            h: 300,
            rotation: 0,
            z: 1,
            slot: "headline",
            content: "Hello",
            fontFamily: "Inter",
            fontWeight: 700,
            size: 96,
            color: "#ffffff",
            align: "left",
            lineHeight: 1.05,
          },
        ],
      };

      const prod = db
        .insert(schema.products)
        .values({ name: TEST_NAME, description: "fixture" })
        .returning({ id: schema.products.id })
        .all()[0];
      insertedProductIds.push(prod.id);

      const row = db
        .insert(schema.content)
        .values({
          productId: prod.id,
          mediaType: "image",
          targetSurface: "post",
          content: "caption",
          scene,
        })
        .returning({ id: schema.content.id })
        .all()[0];
      insertedContentIds.push(row.id);

      const read = db
        .select({ scene: schema.content.scene })
        .from(schema.content)
        .where(eq(schema.content.id, row.id))
        .all()[0];

      const readScene = read.scene as Scene;
      expect(readScene.w).toBe(1080);
      expect(readScene.background).toEqual({ kind: "solid", color: "#101014" });
      expect(readScene.elements[0].slot).toBe("headline");
    });

    it("round-trips brandKit JSON + timestamp on products", () => {
      const at = new Date();
      const brandKit = { palette: { bg: "#000", accents: ["#f00"] }, mood: ["bold"] };

      const prod = db
        .insert(schema.products)
        .values({
          name: TEST_NAME,
          description: "fixture",
          brandKit,
          brandKitUpdatedAt: at,
        })
        .returning({ id: schema.products.id })
        .all()[0];
      insertedProductIds.push(prod.id);

      const read = db
        .select({
          brandKit: schema.products.brandKit,
          brandKitUpdatedAt: schema.products.brandKitUpdatedAt,
        })
        .from(schema.products)
        .where(eq(schema.products.id, prod.id))
        .all()[0];

      expect((read.brandKit as { mood: string[] }).mood).toEqual(["bold"]);
      expect(read.brandKitUpdatedAt instanceof Date).toBe(true);
      expect(read.brandKitUpdatedAt?.getTime()).toBe(
        Math.floor(at.getTime() / 1000) * 1000,
      );
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL.**
  ```bash
  npx vitest run src/lib/__tests__/schema-scene.test.ts
  ```
  Expected FAIL: TypeScript / drizzle error that `scene`, `brandKit`, `brandKitUpdatedAt` do not exist on the schema objects (and SQLite "no such column" if it reached runtime). Columns are not defined yet.

- [ ] **Step 3: Add columns to schema.ts.**
  In `/home/lemmebee/sources/buzz/drizzle/schema.ts`, add the two product columns immediately after the `attributionWebhookSecret` line (line 16):
  ```ts
    brandKit: text("brand_kit", { mode: "json" }), // cached BrandKit JSON (see brain/brandkit.ts)
    brandKitUpdatedAt: integer("brand_kit_updated_at", { mode: "timestamp" }),
  ```
  And add the content column immediately after the `visualDirection` line (line 47):
  ```ts
    scene: text("scene", { mode: "json" }), // Scene JSON for composed renders (see compose/scene.ts)
  ```

- [ ] **Step 4: Generate the migration.**
  ```bash
  npm run db:generate
  ```
  Expected drizzle-kit output: reads `drizzle/schema.ts`, detects 3 added columns across 2 tables (`+ products.brand_kit`, `+ products.brand_kit_updated_at`, `+ content.scene`), and writes a new file `drizzle/migrations/0012_<random_adjective_noun>.sql` plus updated `drizzle/migrations/meta/0012_snapshot.json` and `_journal.json`. Output ends with `[✓] Your SQL migration file ➜ drizzle/migrations/0012_....sql 🚀`.

- [ ] **Step 5: Normalize the migration filename (optional, deterministic).**
  Rename the generated file so the path is predictable, and keep journal in sync.
  ```bash
  GEN=$(ls -t /home/lemmebee/sources/buzz/drizzle/migrations/0012_*.sql | head -1)
  TAG=$(basename "$GEN" .sql)
  git -C /home/lemmebee/sources/buzz mv "$GEN" /home/lemmebee/sources/buzz/drizzle/migrations/0012_scene_brandkit.sql
  sed -i "s/$TAG/0012_scene_brandkit/" /home/lemmebee/sources/buzz/drizzle/migrations/meta/_journal.json
  ```
  Verify the SQL contains exactly the three ALTERs:
  ```bash
  cat /home/lemmebee/sources/buzz/drizzle/migrations/0012_scene_brandkit.sql
  ```
  Expected body:
  ```sql
  ALTER TABLE `products` ADD `brand_kit` text;--> statement-breakpoint
  ALTER TABLE `products` ADD `brand_kit_updated_at` integer;--> statement-breakpoint
  ALTER TABLE `content` ADD `scene` text;
  ```

- [ ] **Step 6: Apply the migration.**
  ```bash
  npm run db:migrate
  ```
  Expected: drizzle-kit reports applying migration `0012_scene_brandkit` (one new migration), no errors. Confirm columns landed:
  ```bash
  sqlite3 /home/lemmebee/sources/buzz/data/buzz.db "PRAGMA table_info(content);" | grep -i scene; sqlite3 /home/lemmebee/sources/buzz/data/buzz.db "PRAGMA table_info(products);" | grep -i brand_kit
  ```
  Expected: rows for `scene`, `brand_kit`, `brand_kit_updated_at`.

- [ ] **Step 7: Run the test, expect PASS.**
  ```bash
  npx vitest run src/lib/__tests__/schema-scene.test.ts
  ```
  Expected PASS: both tests green (scene round-trips as parsed object; brandKit + timestamp round-trip).

- [ ] **Step 8: Commit.**
  ```bash
  git -C /home/lemmebee/sources/buzz add drizzle/schema.ts drizzle/migrations/0012_scene_brandkit.sql drizzle/migrations/meta/_journal.json drizzle/migrations/meta/0012_snapshot.json src/lib/__tests__/schema-scene.test.ts
  git -C /home/lemmebee/sources/buzz commit -m "feat(db): add products.brandKit/brandKitUpdatedAt + content.scene columns"
  ```

### Task B.1: Scene model types + constructors (`scene.ts`)

**Files:**
- Create: `src/lib/compose/scene.ts`
- Test: `tests/compose/scene.test.ts`

Steps:

- [ ] **Step 1: Write failing round-trip test.** Create `tests/compose/scene.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SCENE_W,
  SCENE_H,
  makeText,
  makeImage,
  makeScene,
  type Scene,
  type TextElement,
} from "@/lib/compose/scene";

describe("scene model", () => {
  it("exposes canvas dimensions", () => {
    expect(SCENE_W).toBe(1080);
    expect(SCENE_H).toBe(1350);
  });

  it("makeText builds a text element with defaults", () => {
    const t = makeText({ id: "h1", content: "Hello", size: 64 });
    expect(t.type).toBe("text");
    expect(t.id).toBe("h1");
    expect(t.content).toBe("Hello");
    expect(t.size).toBe(64);
    expect(t.fontFamily).toBe("sans-serif");
    expect(t.fontWeight).toBe(400);
    expect(t.color).toBe("#000000");
    expect(t.align).toBe("left");
    expect(t.lineHeight).toBe(1.2);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    expect(t.w).toBe(SCENE_W);
    expect(t.h).toBe(0);
    expect(t.rotation).toBe(0);
    expect(t.z).toBe(0);
  });

  it("makeText honors overrides incl slot", () => {
    const t = makeText({
      id: "h1",
      content: "Hi",
      size: 40,
      x: 10,
      y: 20,
      w: 500,
      h: 80,
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#fff",
      align: "center",
      lineHeight: 1.4,
      slot: "headline",
      z: 5,
      rotation: -2,
    });
    expect(t).toMatchObject({
      type: "text",
      content: "Hi",
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#fff",
      align: "center",
      lineHeight: 1.4,
      slot: "headline",
      z: 5,
      rotation: -2,
      x: 10,
      y: 20,
      w: 500,
      h: 80,
    });
  });

  it("makeImage builds an image element with cover default", () => {
    const img = makeImage({ id: "bg", src: "/api/media/x.png", w: SCENE_W, h: SCENE_H });
    expect(img.type).toBe("image");
    expect(img.src).toBe("/api/media/x.png");
    expect(img.fit).toBe("cover");
    expect(img.w).toBe(SCENE_W);
    expect(img.h).toBe(SCENE_H);
  });

  it("makeScene wraps elements with canvas size + default solid bg", () => {
    const scene = makeScene([makeText({ id: "h", content: "A", size: 50 })]);
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
    expect(scene.background).toEqual({ kind: "solid", color: "#ffffff" });
    expect(scene.elements).toHaveLength(1);
  });

  it("makeScene accepts a custom background", () => {
    const bg = { kind: "gradient", from: "#000", to: "#fff", angle: 90 } as const;
    const scene = makeScene([], bg);
    expect(scene.background).toEqual(bg);
  });

  it("round-trips a Scene through JSON without loss", () => {
    const original: Scene = makeScene(
      [
        makeText({ id: "h", content: "Headline", size: 64, slot: "headline" }),
        makeImage({ id: "bg", src: "/api/media/p.png", w: SCENE_W, h: SCENE_H, slot: "bg" }),
      ],
      { kind: "image", src: "/api/media/p.png", fit: "cover", treatment: "warm" }
    );
    const clone = JSON.parse(JSON.stringify(original)) as Scene;
    expect(clone).toEqual(original);
    const head = clone.elements[0] as TextElement;
    expect(head.content).toBe("Headline");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run tests/compose/scene.test.ts`. Expected: FAIL (cannot resolve `@/lib/compose/scene`, module does not exist).

- [ ] **Step 3: Implement `scene.ts` (types + constructors).** Create `src/lib/compose/scene.ts`:
```ts
export const SCENE_W = 1080;
export const SCENE_H = 1350;

export type Slot =
  | "headline"
  | "subhead"
  | "body"
  | "bg"
  | "logo"
  | "pill"
  | "icon"
  | "cta"
  | "stat"
  | "quote";

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: string; fit: "cover" | "contain"; treatment?: "none" | "warm" | "duotone" };

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  slot?: Slot;
  locked?: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontFamily: string;
  fontWeight: number;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  radius?: number;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rect" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface IconElement extends BaseElement {
  type: "icon";
  name: string;
  stroke: string;
  strokeWidth: number;
  iconStyle: "line" | "solid";
}

export interface PillElement extends BaseElement {
  type: "pill";
  text: string;
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
}

export interface ButtonElement extends BaseElement {
  type: "button";
  label: string;
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
  radius: number;
}

export interface LogoElement extends BaseElement {
  type: "logo";
  src: string;
}

export interface ChatBubbleElement extends BaseElement {
  type: "chatBubble";
  text: string;
  side: "left" | "right";
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
}

export interface StatBlockElement extends BaseElement {
  type: "statBlock";
  value: string;
  label: string;
  valueColor: string;
  labelColor: string;
  fontFamily: string;
  valueSize: number;
  labelSize: number;
}

export type SceneElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | IconElement
  | PillElement
  | ButtonElement
  | LogoElement
  | ChatBubbleElement
  | StatBlockElement;

export interface Scene {
  w: number;
  h: number;
  background: Background;
  elements: SceneElement[];
}

// ---- constructors / helpers ----

const baseDefaults = (): Pick<BaseElement, "x" | "y" | "w" | "h" | "rotation" | "z"> => ({
  x: 0,
  y: 0,
  w: SCENE_W,
  h: 0,
  rotation: 0,
  z: 0,
});

export function makeText(
  args: Partial<Omit<TextElement, "type">> & { id: string; content: string; size: number }
): TextElement {
  return {
    ...baseDefaults(),
    fontFamily: "sans-serif",
    fontWeight: 400,
    color: "#000000",
    align: "left",
    lineHeight: 1.2,
    ...args,
    type: "text",
  };
}

export function makeImage(
  args: Partial<Omit<ImageElement, "type">> & { id: string; src: string }
): ImageElement {
  return {
    ...baseDefaults(),
    w: SCENE_W,
    h: SCENE_H,
    fit: "cover",
    ...args,
    type: "image",
  };
}

export function makeScene(
  elements: SceneElement[],
  background: Background = { kind: "solid", color: "#ffffff" }
): Scene {
  return { w: SCENE_W, h: SCENE_H, background, elements };
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run tests/compose/scene.test.ts`. Expected: all assertions PASS.

- [ ] **Step 5: Commit.**
```
git add src/lib/compose/scene.ts tests/compose/scene.test.ts
git commit -m "feat(compose): scene model types + makeText/makeImage/makeScene constructors"
```

### Task B.2: `sceneToSatori` background mapping

**Files:**
- Create: `src/lib/compose/satoriTree.ts`
- Test: `tests/compose/satoriTree.background.test.ts`

Steps:

- [ ] **Step 1: Write failing background test.** Create `tests/compose/satoriTree.background.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { makeScene, SCENE_W, SCENE_H } from "@/lib/compose/scene";

describe("sceneToSatori background", () => {
  it("produces a root div sized to the scene with relative positioning", () => {
    const node = sceneToSatori(makeScene([], { kind: "solid", color: "#101010" }));
    expect(node.type).toBe("div");
    const style = node.props.style as Record<string, unknown>;
    expect(style.position).toBe("relative");
    expect(style.display).toBe("flex");
    expect(style.width).toBe(SCENE_W);
    expect(style.height).toBe(SCENE_H);
    expect(style.overflow).toBe("hidden");
    expect(style.backgroundColor).toBe("#101010");
    expect(Array.isArray(node.props.children)).toBe(true);
  });

  it("maps gradient background to a linear-gradient backgroundImage", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "gradient", from: "#ff0000", to: "#0000ff", angle: 45 })
    );
    const style = node.props.style as Record<string, unknown>;
    expect(style.backgroundImage).toBe("linear-gradient(45deg, #ff0000, #0000ff)");
    expect(style.backgroundColor).toBeUndefined();
  });

  it("maps image background to an absolutely positioned img child filling the canvas", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "image", src: "/api/media/bg.png", fit: "cover" })
    );
    const children = node.props.children as Array<{ type: string; props: Record<string, unknown> }>;
    const bgImg = children[0];
    expect(bgImg.type).toBe("img");
    expect(bgImg.props.src).toBe("/api/media/bg.png");
    const s = bgImg.props.style as Record<string, unknown>;
    expect(s.position).toBe("absolute");
    expect(s.top).toBe(0);
    expect(s.left).toBe(0);
    expect(s.width).toBe(SCENE_W);
    expect(s.height).toBe(SCENE_H);
    expect(s.objectFit).toBe("cover");
  });

  it("applies a warm overlay for image treatment 'warm'", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "image", src: "/api/media/bg.png", fit: "cover", treatment: "warm" })
    );
    const children = node.props.children as Array<{ type: string; props: Record<string, unknown> }>;
    // [0] = img, [1] = warm overlay div
    const overlay = children[1];
    expect(overlay.type).toBe("div");
    const s = overlay.props.style as Record<string, unknown>;
    expect(s.position).toBe("absolute");
    expect(typeof s.backgroundColor).toBe("string");
    expect(s.width).toBe(SCENE_W);
    expect(s.height).toBe(SCENE_H);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run tests/compose/satoriTree.background.test.ts`. Expected: FAIL (cannot resolve `@/lib/compose/satoriTree`).

- [ ] **Step 3: Implement `satoriTree.ts` skeleton with background only.** Create `src/lib/compose/satoriTree.ts`:
```ts
import {
  type Scene,
  type Background,
  type SceneElement,
  SCENE_W,
  SCENE_H,
} from "@/lib/compose/scene";

type SatoriNode = { type: string; props: Record<string, unknown> };

const treatmentOverlay: Record<"warm" | "duotone", string | null> = {
  warm: "rgba(255,170,90,0.18)",
  duotone: "rgba(20,20,60,0.35)",
};

function backgroundLayers(bg: Background): {
  rootStyle: Record<string, unknown>;
  layers: SatoriNode[];
} {
  if (bg.kind === "solid") {
    return { rootStyle: { backgroundColor: bg.color }, layers: [] };
  }
  if (bg.kind === "gradient") {
    return {
      rootStyle: {
        backgroundImage: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`,
      },
      layers: [],
    };
  }
  // image
  const layers: SatoriNode[] = [
    {
      type: "img",
      props: {
        src: bg.src,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: SCENE_W,
          height: SCENE_H,
          objectFit: bg.fit,
        },
      },
    },
  ];
  const overlayColor =
    bg.treatment && bg.treatment !== "none" ? treatmentOverlay[bg.treatment] : null;
  if (overlayColor) {
    layers.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: SCENE_W,
          height: SCENE_H,
          backgroundColor: overlayColor,
        },
      },
    });
  }
  return { rootStyle: {}, layers };
}

// element -> node mapping added in B.3
function elementToNode(_el: SceneElement): SatoriNode | null {
  return null;
}

export function sceneToSatori(scene: Scene): SatoriNode {
  const { rootStyle, layers } = backgroundLayers(scene.background);
  const elementNodes = scene.elements
    .slice()
    .sort((a, b) => a.z - b.z)
    .map(elementToNode)
    .filter((n): n is SatoriNode => n !== null);
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        display: "flex",
        width: scene.w,
        height: scene.h,
        overflow: "hidden",
        ...rootStyle,
      },
      children: [...layers, ...elementNodes],
    },
  };
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run tests/compose/satoriTree.background.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**
```
git add src/lib/compose/satoriTree.ts tests/compose/satoriTree.background.test.ts
git commit -m "feat(compose): sceneToSatori background mapping (solid/gradient/image+treatment)"
```

### Task B.3: `sceneToSatori` element mapping (text, image, shape, pill, button, logo, icon, chatBubble, statBlock)

**Files:**
- Modify: `src/lib/compose/satoriTree.ts`
- Test: `tests/compose/satoriTree.elements.test.ts`

Steps:

- [ ] **Step 1: Write failing element-mapping test.** Create `tests/compose/satoriTree.elements.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { makeScene, makeText, makeImage } from "@/lib/compose/scene";
import type {
  TextElement,
  ImageElement,
  ShapeElement,
  PillElement,
  ButtonElement,
  LogoElement,
  IconElement,
  ChatBubbleElement,
  StatBlockElement,
} from "@/lib/compose/scene";

type Node = { type: string; props: Record<string, unknown> };
const styleOf = (n: Node) => n.props.style as Record<string, unknown>;

describe("sceneToSatori element mapping", () => {
  it("renders a 2-element scene as ordered children by z, after bg layers", () => {
    const img = makeImage({
      id: "bg",
      src: "/api/media/p.png",
      x: 0,
      y: 0,
      w: 1080,
      h: 1350,
      z: 0,
      slot: "bg",
    });
    const head = makeText({
      id: "h",
      content: "Big News",
      size: 72,
      x: 80,
      y: 120,
      w: 920,
      h: 200,
      fontFamily: "Inter",
      fontWeight: 800,
      color: "#ffffff",
      align: "center",
      lineHeight: 1.1,
      z: 1,
      slot: "headline",
    });
    // intentionally out of z-order to prove sorting
    const root = sceneToSatori(makeScene([head, img], { kind: "solid", color: "#000" }));
    const children = root.props.children as Node[];
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("img"); // z=0
    expect(children[1].type).toBe("div"); // text wrapper z=1
    expect(children[0].props.src).toBe("/api/media/p.png");
  });

  it("maps a text element to an absolutely positioned flex div with wrapping", () => {
    const t: TextElement = makeText({
      id: "h",
      content: "Hello\nWorld",
      size: 64,
      x: 40,
      y: 50,
      w: 600,
      h: 180,
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#222",
      align: "center",
      lineHeight: 1.3,
      rotation: -3,
    });
    const root = sceneToSatori(makeScene([t]));
    const node = (root.props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.left).toBe(40);
    expect(s.top).toBe(50);
    expect(s.width).toBe(600);
    expect(s.height).toBe(180);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    expect(s.fontFamily).toBe("Inter");
    expect(s.fontWeight).toBe(700);
    expect(s.fontSize).toBe(64);
    expect(s.color).toBe("#222");
    expect(s.lineHeight).toBe(1.3);
    expect(s.textAlign).toBe("center");
    expect(s.alignItems).toBe("center"); // center maps to center
    expect(s.whiteSpace).toBe("pre-wrap");
    expect(s.transform).toBe("rotate(-3deg)");
    expect(node.props.children).toBe("Hello\nWorld");
  });

  it("maps text align left/right to flex alignItems flex-start/flex-end", () => {
    const left = sceneToSatori(makeScene([makeText({ id: "a", content: "x", size: 20, align: "left" })]));
    const right = sceneToSatori(makeScene([makeText({ id: "b", content: "y", size: 20, align: "right" })]));
    expect(styleOf((left.props.children as Node[])[0]).alignItems).toBe("flex-start");
    expect(styleOf((right.props.children as Node[])[0]).alignItems).toBe("flex-end");
  });

  it("maps a foreground image element to an img with objectFit + radius", () => {
    const img: ImageElement = {
      type: "image",
      id: "pic",
      src: "/api/media/q.png",
      fit: "contain",
      radius: 24,
      x: 100,
      y: 200,
      w: 400,
      h: 300,
      rotation: 0,
      z: 2,
    };
    const root = sceneToSatori(makeScene([img]));
    const node = (root.props.children as Node[])[0];
    expect(node.type).toBe("img");
    expect(node.props.src).toBe("/api/media/q.png");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.left).toBe(100);
    expect(s.top).toBe(200);
    expect(s.width).toBe(400);
    expect(s.height).toBe(300);
    expect(s.objectFit).toBe("contain");
    expect(s.borderRadius).toBe(24);
  });

  it("maps a rect shape to a div with fill/border/radius", () => {
    const rect: ShapeElement = {
      type: "shape",
      shape: "rect",
      id: "r",
      fill: "#eee",
      stroke: "#333",
      strokeWidth: 4,
      radius: 12,
      x: 10,
      y: 10,
      w: 200,
      h: 80,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([rect])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.backgroundColor).toBe("#eee");
    expect(s.borderRadius).toBe(12);
    expect(s.border).toBe("4px solid #333");
  });

  it("maps a line shape to a thin div using strokeWidth as height", () => {
    const line: ShapeElement = {
      type: "shape",
      shape: "line",
      id: "ln",
      stroke: "#000",
      strokeWidth: 6,
      x: 0,
      y: 100,
      w: 500,
      h: 0,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([line])).props.children as Node[])[0];
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#000");
    expect(s.height).toBe(6);
    expect(s.width).toBe(500);
  });

  it("maps a pill to a rounded flex div with text child", () => {
    const pill: PillElement = {
      type: "pill",
      id: "p",
      text: "NEW",
      bg: "#ff0",
      color: "#000",
      fontFamily: "Inter",
      size: 28,
      x: 20,
      y: 20,
      w: 120,
      h: 48,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([pill])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.display).toBe("flex");
    expect(s.alignItems).toBe("center");
    expect(s.justifyContent).toBe("center");
    expect(s.backgroundColor).toBe("#ff0");
    expect(s.color).toBe("#000");
    expect(s.fontFamily).toBe("Inter");
    expect(s.fontSize).toBe(28);
    expect(s.borderRadius).toBe(24); // h/2
    expect(node.props.children).toBe("NEW");
  });

  it("maps a button to a rounded flex div using its radius", () => {
    const btn: ButtonElement = {
      type: "button",
      id: "b",
      label: "Buy now",
      bg: "#0a0",
      color: "#fff",
      fontFamily: "Inter",
      size: 32,
      radius: 16,
      x: 50,
      y: 900,
      w: 300,
      h: 90,
      rotation: 0,
      z: 3,
    };
    const node = (sceneToSatori(makeScene([btn])).props.children as Node[])[0];
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#0a0");
    expect(s.color).toBe("#fff");
    expect(s.fontSize).toBe(32);
    expect(s.borderRadius).toBe(16);
    expect(s.justifyContent).toBe("center");
    expect(node.props.children).toBe("Buy now");
  });

  it("maps a logo to an img", () => {
    const logo: LogoElement = {
      type: "logo",
      id: "lg",
      src: "/api/media/logo.svg",
      x: 40,
      y: 40,
      w: 160,
      h: 60,
      rotation: 0,
      z: 5,
    };
    const node = (sceneToSatori(makeScene([logo])).props.children as Node[])[0];
    expect(node.type).toBe("img");
    expect(node.props.src).toBe("/api/media/logo.svg");
    const s = styleOf(node);
    expect(s.width).toBe(160);
    expect(s.height).toBe(60);
    expect(s.objectFit).toBe("contain");
  });

  it("maps an icon to a div placeholder carrying its name + color", () => {
    const icon: IconElement = {
      type: "icon",
      id: "ic",
      name: "star",
      stroke: "#f0f",
      strokeWidth: 2,
      iconStyle: "line",
      x: 10,
      y: 10,
      w: 48,
      h: 48,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([icon])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.width).toBe(48);
    expect(s.height).toBe(48);
    expect(s.color).toBe("#f0f");
    expect((node.props as Record<string, unknown>)["data-icon"]).toBe("star");
  });

  it("maps a chatBubble to a flex div with text + side-based borderRadius", () => {
    const bubble: ChatBubbleElement = {
      type: "chatBubble",
      id: "cb",
      text: "Hi there",
      side: "left",
      bg: "#eaeaea",
      color: "#111",
      fontFamily: "Inter",
      size: 30,
      x: 60,
      y: 400,
      w: 500,
      h: 120,
      rotation: 0,
      z: 2,
    };
    const node = (sceneToSatori(makeScene([bubble])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#eaeaea");
    expect(s.color).toBe("#111");
    expect(s.fontSize).toBe(30);
    expect(s.display).toBe("flex");
    expect(typeof s.borderRadius).toBe("string");
    expect(node.props.children).toBe("Hi there");
  });

  it("maps a statBlock to a column flex div with value + label children", () => {
    const stat: StatBlockElement = {
      type: "statBlock",
      id: "st",
      value: "92%",
      label: "satisfaction",
      valueColor: "#000",
      labelColor: "#888",
      fontFamily: "Inter",
      valueSize: 96,
      labelSize: 28,
      x: 100,
      y: 600,
      w: 400,
      h: 200,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([stat])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    const kids = node.props.children as Node[];
    expect(kids).toHaveLength(2);
    expect(kids[0].props.children).toBe("92%");
    expect((kids[0].props.style as Record<string, unknown>).fontSize).toBe(96);
    expect((kids[0].props.style as Record<string, unknown>).color).toBe("#000");
    expect(kids[1].props.children).toBe("satisfaction");
    expect((kids[1].props.style as Record<string, unknown>).fontSize).toBe(28);
    expect((kids[1].props.style as Record<string, unknown>).color).toBe("#888");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run tests/compose/satoriTree.elements.test.ts`. Expected: FAIL (`elementToNode` returns `null`, so root has no element children; assertions on `children[0]` fail).

- [ ] **Step 3: Implement element-to-node helpers + dispatcher.** In `src/lib/compose/satoriTree.ts`, replace the stub `elementToNode` with the full implementation. First add a shared positioning helper above `elementToNode`:
```ts
function baseBoxStyle(el: SceneElement): Record<string, unknown> {
  const style: Record<string, unknown> = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
  };
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  return style;
}

const ALIGN_TO_ITEMS: Record<"left" | "center" | "right", string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};
```
Then replace the stub body:
```ts
function elementToNode(el: SceneElement): SatoriNode | null {
  switch (el.type) {
    case "text":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: ALIGN_TO_ITEMS[el.align],
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
            fontSize: el.size,
            color: el.color,
            lineHeight: el.lineHeight,
            textAlign: el.align,
            whiteSpace: "pre-wrap",
          },
          children: el.content,
        },
      };

    case "image":
      return {
        type: "img",
        props: {
          src: el.src,
          style: {
            ...baseBoxStyle(el),
            objectFit: el.fit,
            ...(el.radius != null ? { borderRadius: el.radius } : {}),
          },
        },
      };

    case "shape": {
      const style: Record<string, unknown> = { ...baseBoxStyle(el) };
      if (el.shape === "line") {
        style.backgroundColor = el.stroke ?? "#000000";
        style.height = el.strokeWidth ?? 1;
      } else {
        if (el.fill) style.backgroundColor = el.fill;
        if (el.radius != null) style.borderRadius = el.radius;
        if (el.stroke && el.strokeWidth) style.border = `${el.strokeWidth}px solid ${el.stroke}`;
      }
      return { type: "div", props: { style } };
    }

    case "pill":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: el.h / 2,
          },
          children: el.text,
        },
      };

    case "button":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: el.radius,
          },
          children: el.label,
        },
      };

    case "logo":
      return {
        type: "img",
        props: {
          src: el.src,
          style: { ...baseBoxStyle(el), objectFit: "contain" },
        },
      };

    case "icon":
      return {
        type: "div",
        props: {
          "data-icon": el.name,
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            color: el.stroke,
          },
        },
      };

    case "chatBubble": {
      const radius =
        el.side === "left" ? "20px 20px 20px 4px" : "20px 20px 4px 20px";
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: radius,
            padding: 16,
          },
          children: el.text,
        },
      };
    }

    case "statBlock":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            fontFamily: el.fontFamily,
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: el.valueSize, color: el.valueColor },
                children: el.value,
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: el.labelSize, color: el.labelColor },
                children: el.label,
              },
            },
          ],
        },
      };

    default: {
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run tests/compose/satoriTree.elements.test.ts`. Expected: PASS.

- [ ] **Step 5: Run full compose suite + typecheck.** Run `npx vitest run tests/compose/ && npx tsc --noEmit`. Expected: all compose tests PASS and no type errors (exhaustive `never` switch confirms every `SceneElement` variant is handled).

- [ ] **Step 6: Commit.**
```
git add src/lib/compose/satoriTree.ts tests/compose/satoriTree.elements.test.ts
git commit -m "feat(compose): sceneToSatori element mapping for all SceneElement variants"
```

### Task C.1: SPIKE - verify @fontsource font feeds Satori + lock formats

**Files:**
- Create: `scripts/spike-font-acquisition.ts`

1. - [ ] **Step 1: Install font + render deps.** Run:
  ```
  npm i @fontsource/inter@5.2.8 @fontsource/noto-serif@5.2.8 @fontsource/jetbrains-mono@5.2.8 @woff2/woff2-rs@1.0.1 satori@0.26.0
  ```
  (satori is a shared compose dep; install once here. `@woff2/woff2-rs` is for the URL->TTF path. `tsx` is already available via `npx`.)

2. - [ ] **Step 2: Confirm the on-disk fontsource layout** (drives all path logic in C.2). Run:
  ```
  ls node_modules/@fontsource/inter/files/inter-latin-400-normal.woff node_modules/@fontsource/inter/files/inter-latin-700-normal.woff node_modules/@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff
  ```
  Expected: all four paths exist. NOTE for impl: @fontsource v5 ships `.woff`/`.woff2` only (no `.ttf`). Satori accepts WOFF; it does NOT accept WOFF2. So the fontsource path reads the `.woff`; `@woff2/woff2-rs` decompression is reserved for external woff2 URLs.

3. - [ ] **Step 3: Write throwaway spike** that reads a fontsource `.woff`, feeds it to satori, and asserts SVG output. Create `scripts/spike-font-acquisition.ts`:
  ```ts
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";
  import assert from "node:assert/strict";
  import satori from "satori";

  async function main() {
    // 1. fontsource ships .woff (satori-compatible), not raw TTF
    const woffPath = resolve(
      "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
    );
    const data = readFileSync(woffPath);
    assert.ok(data.length > 1000, "fontsource woff should be non-empty");
    // woff magic number 'wOFF'
    assert.equal(data.toString("ascii", 0, 4), "wOFF", "expected WOFF magic");

    // 2. satori must accept this buffer and emit SVG
    const svg = await satori(
      {
        type: "div",
        props: {
          style: { display: "flex", fontFamily: "Inter", fontSize: 48 },
          children: "Buzz",
        },
      },
      {
        width: 200,
        height: 100,
        fonts: [{ name: "Inter", data, weight: 400, style: "normal" }],
      },
    );
    assert.ok(svg.startsWith("<svg"), "satori should emit svg");
    assert.ok(svg.includes("<path"), "rendered text should produce glyph paths");

    // 3. confirm woff2 is NOT satori-feedable directly (justifies decompress path)
    const woff2 = readFileSync(
      resolve("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
    );
    assert.equal(woff2.toString("ascii", 0, 4), "wOF2", "expected WOFF2 magic");

    console.log("SPIKE PASS: fontsource .woff renders in satori; .woff2 is wOF2 (needs decompress for URL path)");
  }

  main().catch((e) => {
    console.error("SPIKE FAIL:", e);
    process.exit(1);
  });
  ```

4. - [ ] **Step 4: Run the spike (expected PASS).** Run:
  ```
  npx tsx scripts/spike-font-acquisition.ts
  ```
  Expected stdout: `SPIKE PASS: fontsource .woff renders in satori; .woff2 is wOF2 (needs decompress for URL path)`. If it fails, stop and reconcile before C.2. This confirms (a) the exact on-disk path template, (b) satori accepts fontsource WOFF, (c) woff2 needs decompression.

5. - [ ] **Step 5: Commit the spike + deps.** Run:
  ```
  git add package.json package-lock.json scripts/spike-font-acquisition.ts
  git commit -m "chore(compose): font acquisition spike, add fontsource+woff2+satori deps"
  ```

### Task C.2: resolveFont - fontsource lookup, woff2 decompress, class substitute, disk cache

**Files:**
- Create: `src/lib/compose/fonts.ts`
- Create: `src/lib/compose/__tests__/fonts.test.ts`
- Modify: `.gitignore`

1. - [ ] **Step 1: Write failing test.** Create `src/lib/compose/__tests__/fonts.test.ts`:
  ```ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { rm } from "node:fs/promises";
  import { resolve } from "node:path";
  import { resolveFont, FONTS_CACHE_DIR } from "../fonts";

  describe("resolveFont", () => {
    beforeAll(async () => {
      await rm(resolve(FONTS_CACHE_DIR), { recursive: true, force: true });
    });

    it("resolves a known @fontsource family to a usable WOFF/TTF buffer", async () => {
      const f = await resolveFont("Inter", "sans", 400);
      expect(f.family).toBe("Inter");
      expect(f.class).toBe("sans");
      expect(f.weight).toBe(400);
      expect(f.source).toBe("fontsource");
      expect(f.data.length).toBeGreaterThan(1000);
      // satori-compatible container: WOFF ('wOFF'), TTF (0x00010000), or OTF ('OTTO')
      const sig = f.data.toString("ascii", 0, 4);
      const isTtf = f.data.readUInt32BE(0) === 0x00010000;
      expect(sig === "wOFF" || sig === "OTTO" || isTtf).toBe(true);
      // never WOFF2 (satori cannot read it)
      expect(sig).not.toBe("wOF2");
      expect(f.filePath).toContain(FONTS_CACHE_DIR);
    });

    it("substitutes a bundled OFL font by class when family is unknown", async () => {
      const serif = await resolveFont("Totally Fake Family 9000", "serif");
      expect(serif.family).toBe("Noto Serif");
      expect(serif.source).toBe("substitute");
      expect(serif.data.length).toBeGreaterThan(1000);

      const disp = await resolveFont("Nonexistent Display", "display");
      expect(disp.family).toBe("Inter");
      expect(disp.source).toBe("substitute");

      const mono = await resolveFont("Made Up Mono", "mono");
      expect(mono.family).toBe("JetBrains Mono");
      expect(mono.source).toBe("substitute");
    });

    it("caches the resolved font (second call returns cached file fast)", async () => {
      const first = await resolveFont("Inter", "sans", 700);
      const second = await resolveFont("Inter", "sans", 700);
      expect(second.filePath).toBe(first.filePath);
      expect(second.data.equals(first.data)).toBe(true);
    });

    it("falls back to nearest available weight when exact weight missing", async () => {
      // fontsource Inter has no weight 123; resolver picks an available one, never throws
      const f = await resolveFont("Inter", "sans", 123);
      expect(f.source).toBe("fontsource");
      expect(f.data.length).toBeGreaterThan(1000);
    });
  });
  ```

2. - [ ] **Step 2: Run the test (expected FAIL - module missing).** Run:
  ```
  npx vitest run src/lib/compose/__tests__/fonts.test.ts
  ```
  Expected: FAIL with `Cannot find module '../fonts'` / `Failed to resolve import`.

3. - [ ] **Step 3: Implement `resolveFont`.** Create `src/lib/compose/fonts.ts`:
  ```ts
  import { readFile, mkdir, access, writeFile } from "node:fs/promises";
  import { constants as FS } from "node:fs";
  import { resolve, join } from "node:path";
  import { createRequire } from "node:module";

  const require = createRequire(import.meta.url);

  export interface ResolvedFont {
    family: string;
    class: "serif" | "sans" | "display" | "mono";
    filePath: string;
    data: Buffer;
    weight: number;
    source: "fontsource" | "google" | "site" | "substitute";
  }

  /** Project-local on-disk cache for resolved (satori-feedable) font files. */
  export const FONTS_CACHE_DIR = "data/fonts-cache";

  /** Known family name -> @fontsource package + canonical family. */
  const FONTSOURCE: Record<string, { pkg: string; family: string; weights: number[] }> = {
    inter: { pkg: "@fontsource/inter", family: "Inter", weights: [400, 700] },
    "noto serif": { pkg: "@fontsource/noto-serif", family: "Noto Serif", weights: [400, 700] },
    "jetbrains mono": { pkg: "@fontsource/jetbrains-mono", family: "JetBrains Mono", weights: [400, 700] },
  };

  /** Class -> bundled OFL substitute (must exist as an installed @fontsource pkg). */
  const SUBSTITUTE: Record<ResolvedFont["class"], string> = {
    serif: "noto serif",
    sans: "inter",
    display: "inter",
    mono: "jetbrains mono",
  };

  function normKey(family: string): string {
    return family.trim().toLowerCase();
  }

  async function exists(p: string): Promise<boolean> {
    try {
      await access(p, FS.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  function pickWeight(available: number[], want: number): number {
    if (available.includes(want)) return want;
    return available.reduce((best, w) =>
      Math.abs(w - want) < Math.abs(best - want) ? w : best,
    );
  }

  /**
   * Resolve the @fontsource package root via its package.json so we don't
   * depend on cwd or hoisting layout.
   */
  function fontsourcePkgDir(pkg: string): string {
    const pj = require.resolve(`${pkg}/package.json`);
    return pj.slice(0, pj.length - "/package.json".length);
  }

  /**
   * Build the on-disk file path for a fontsource static face.
   * v5 layout: files/<slug>-latin-<weight>-normal.woff (+ .woff2).
   * We use the .woff (satori-compatible); .woff2 needs decompression.
   */
  function fontsourceWoffPath(pkg: string, weight: number): string {
    const slug = pkg.replace("@fontsource/", "");
    return join(fontsourcePkgDir(pkg), "files", `${slug}-latin-${weight}-normal.woff`);
  }

  function cacheKey(family: string, weight: number, source: string): string {
    const safe = family.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return `${source}-${safe}-${weight}.woff`;
  }

  async function readCache(key: string): Promise<{ filePath: string; data: Buffer } | null> {
    const filePath = resolve(FONTS_CACHE_DIR, key);
    if (await exists(filePath)) {
      return { filePath, data: await readFile(filePath) };
    }
    return null;
  }

  async function writeCache(key: string, data: Buffer): Promise<string> {
    await mkdir(resolve(FONTS_CACHE_DIR), { recursive: true });
    const filePath = resolve(FONTS_CACHE_DIR, key);
    await writeFile(filePath, data);
    return filePath;
  }

  async function resolveFontsource(
    entry: { pkg: string; family: string; weights: number[] },
    klass: ResolvedFont["class"],
    weight: number,
    source: ResolvedFont["source"],
  ): Promise<ResolvedFont> {
    const w = pickWeight(entry.weights, weight);
    const key = cacheKey(entry.family, w, source);

    const cached = await readCache(key);
    if (cached) {
      return { family: entry.family, class: klass, filePath: cached.filePath, data: cached.data, weight: w, source };
    }

    const woffPath = fontsourceWoffPath(entry.pkg, w);
    const data = await readFile(woffPath);
    const filePath = await writeCache(key, data);
    return { family: entry.family, class: klass, filePath, data, weight: w, source };
  }

  /**
   * Resolve a font face to a satori-feedable buffer.
   *
   * Strategy:
   *  1. If `familyName` maps to an installed @fontsource package, read its WOFF.
   *  2. Else (future) decompress a known woff2 URL via @woff2/woff2-rs -> TTF.
   *  3. Else substitute a bundled OFL font by class.
   * Resolved buffers are cached on disk under FONTS_CACHE_DIR.
   */
  export async function resolveFont(
    familyName: string,
    klass: "serif" | "sans" | "display" | "mono",
    weight = 400,
  ): Promise<ResolvedFont> {
    const direct = FONTSOURCE[normKey(familyName)];
    if (direct) {
      return resolveFontsource(direct, klass, weight, "fontsource");
    }

    // Unknown family: substitute a bundled OFL font for the class.
    const subEntry = FONTSOURCE[SUBSTITUTE[klass]];
    return resolveFontsource(subEntry, klass, weight, "substitute");
  }
  ```
  Note: this satisfies the contract (`ResolvedFont` with `data:Buffer` + `filePath`). The `@woff2/woff2-rs` decompress branch (step 2 of the contract strategy) is wired in C.3 for external woff2 URLs; the fontsource and substitute branches are complete here.

4. - [ ] **Step 4: Run the test (expected PASS).** Run:
  ```
  npx vitest run src/lib/compose/__tests__/fonts.test.ts
  ```
  Expected: 4 passing.

5. - [ ] **Step 5: Ignore the on-disk cache.** Add `data/fonts-cache/` to `.gitignore` (append a new line if not present):
  ```
  data/fonts-cache/
  ```

6. - [ ] **Step 6: Commit.** Run:
  ```
  git add src/lib/compose/fonts.ts src/lib/compose/__tests__/fonts.test.ts .gitignore
  git commit -m "feat(compose): resolveFont via fontsource with class substitute and disk cache"
  ```

### Task C.3: woff2 URL branch - decompress external faces to TTF via @woff2/woff2-rs

**Files:**
- Modify: `src/lib/compose/fonts.ts`
- Modify: `src/lib/compose/__tests__/fonts.test.ts`

1. - [ ] **Step 1: Add failing test for the woff2-URL path.** Append to `src/lib/compose/__tests__/fonts.test.ts`:
  ```ts
  import { readFile } from "node:fs/promises";
  import { decompressWoff2ToTtf } from "../fonts";

  describe("decompressWoff2ToTtf", () => {
    it("decompresses a real woff2 buffer into a TTF (sfnt) buffer", async () => {
      // use the installed fontsource woff2 as a known-good sample
      const woff2 = await readFile(
        resolve("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
      );
      expect(woff2.toString("ascii", 0, 4)).toBe("wOF2");

      const ttf = decompressWoff2ToTtf(woff2);
      // sfnt: TrueType 0x00010000 or OpenType 'OTTO'
      const isTtf = ttf.readUInt32BE(0) === 0x00010000;
      const isOtto = ttf.toString("ascii", 0, 4) === "OTTO";
      expect(isTtf || isOtto).toBe(true);
      expect(ttf.toString("ascii", 0, 4)).not.toBe("wOF2");
      expect(ttf.length).toBeGreaterThan(woff2.length); // decompressed is larger
    });
  });
  ```

2. - [ ] **Step 2: Run the test (expected FAIL - export missing).** Run:
  ```
  npx vitest run src/lib/compose/__tests__/fonts.test.ts
  ```
  Expected: FAIL on `decompressWoff2ToTtf` import (not exported).

3. - [ ] **Step 3: Implement the woff2 decompress helper + wire a URL branch.** In `src/lib/compose/fonts.ts`, add the import near the top (after the `createRequire` line):
  ```ts
  import { decompress } from "@woff2/woff2-rs";
  ```
  Add the exported helper (place it above `resolveFont`):
  ```ts
  /**
   * Decompress a WOFF2 buffer into a satori-feedable TTF/OTF (sfnt) buffer.
   * @woff2/woff2-rs returns a Uint8Array; wrap as Buffer.
   */
  export function decompressWoff2ToTtf(woff2: Buffer): Buffer {
    if (woff2.toString("ascii", 0, 4) !== "wOF2") {
      throw new Error("decompressWoff2ToTtf: input is not a WOFF2 buffer");
    }
    return Buffer.from(decompress(woff2));
  }
  ```
  Then add an optional `woff2Url` branch to `resolveFont`. Change the signature and insert the URL handling before the substitute fallback:
  ```ts
  export async function resolveFont(
    familyName: string,
    klass: "serif" | "sans" | "display" | "mono",
    weight = 400,
    woff2Url?: string,
  ): Promise<ResolvedFont> {
    const direct = FONTSOURCE[normKey(familyName)];
    if (direct) {
      return resolveFontsource(direct, klass, weight, "fontsource");
    }

    if (woff2Url) {
      const key = cacheKey(familyName, weight, "google");
      const cached = await readCache(key);
      if (cached) {
        return { family: familyName, class: klass, filePath: cached.filePath, data: cached.data, weight, source: "google" };
      }
      const res = await fetch(woff2Url);
      if (!res.ok) throw new Error(`resolveFont: woff2 fetch ${res.status} for ${woff2Url}`);
      const ttf = decompressWoff2ToTtf(Buffer.from(await res.arrayBuffer()));
      const filePath = await writeCache(key, ttf);
      return { family: familyName, class: klass, filePath, data: ttf, weight, source: "google" };
    }

    const subEntry = FONTSOURCE[SUBSTITUTE[klass]];
    return resolveFontsource(subEntry, klass, weight, "substitute");
  }
  ```
  (The added 4th param is optional, so the contract call sites `resolveFont(family, klass, weight?)` remain valid.)

4. - [ ] **Step 4: Run the full test file (expected PASS).** Run:
  ```
  npx vitest run src/lib/compose/__tests__/fonts.test.ts
  ```
  Expected: all tests passing (the prior 4 + the new decompress test).

5. - [ ] **Step 5: Typecheck the module compiles against contracts.** Run:
  ```
  npx tsc --noEmit -p tsconfig.json
  ```
  Expected: no errors in `src/lib/compose/fonts.ts`.

6. - [ ] **Step 6: Commit.** Run:
  ```
  git add src/lib/compose/fonts.ts src/lib/compose/__tests__/fonts.test.ts
  git commit -m "feat(compose): decompress external woff2 faces to ttf for satori"
  ```

### Task C.4: Remove spike, fold its assertions into the suite

**Files:**
- Delete: `scripts/spike-font-acquisition.ts`
- Modify: `src/lib/compose/__tests__/fonts.test.ts`

1. - [ ] **Step 1: Add a satori smoke test** that proves a resolved font actually renders (the durable version of the spike). Append to `src/lib/compose/__tests__/fonts.test.ts`:
  ```ts
  import satori from "satori";

  describe("resolveFont -> satori smoke", () => {
    it("a resolved font produces glyph paths in satori", async () => {
      const f = await resolveFont("Inter", "sans", 400);
      const svg = await satori(
        {
          type: "div",
          props: {
            style: { display: "flex", fontFamily: f.family, fontSize: 48 },
            children: "Buzz",
          },
        },
        { width: 200, height: 100, fonts: [{ name: f.family, data: f.data, weight: f.weight, style: "normal" }] },
      );
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.includes("<path")).toBe(true);
    });
  });
  ```

2. - [ ] **Step 2: Run the suite (expected PASS).** Run:
  ```
  npx vitest run src/lib/compose/__tests__/fonts.test.ts
  ```
  Expected: all passing including the satori smoke test.

3. - [ ] **Step 3: Delete the throwaway spike** (its coverage now lives in the suite). Run:
  ```
  git rm scripts/spike-font-acquisition.ts
  ```

4. - [ ] **Step 4: Commit.** Run:
  ```
  git add src/lib/compose/__tests__/fonts.test.ts
  git commit -m "test(compose): fold font spike into satori smoke test, drop throwaway script"
  ```

### Task D.1: Install BrandKit extraction deps + add brandKit DB columns

**Files:**
- Modify: `package.json` (deps)
- Modify: `drizzle/schema.ts`
- Create: migration via `npm run db:generate`

- [ ] **Step 1: Install runtime deps for HTML/CSS/palette/og extraction.**
  ```bash
  npm install cheerio@^1.0.0 node-vibrant@^4.0.3 open-graph-scraper@^6.10.0
  ```
  These provide: `cheerio` (HTML parse), `node-vibrant` (palette from image buffer), `open-graph-scraper` (og:image/logo/site name). `postcss` is already a dep (used to parse inline `<style>` CSS). `sharp` already installed (image download/decode to raw pixels for Vibrant).

- [ ] **Step 2: Add `brandKit` + `brandKitUpdatedAt` columns to products table.** Edit `drizzle/schema.ts`, inside `products = sqliteTable("products", {...})`, after the `extractionError` line add:
  ```ts
    brandKit: text("brand_kit", { mode: "json" }), // JSON BrandKit (see brain/brandkit.ts)
    brandKitUpdatedAt: integer("brand_kit_updated_at"), // epoch ms when brandKit last derived
  ```

- [ ] **Step 3: Generate + run the migration.**
  ```bash
  npm run db:generate && npm run db:migrate
  ```
  Expected: a new SQL file under `drizzle/` adding the two columns; migration applies cleanly.

- [ ] **Step 4: Commit.**
  ```bash
  git add package.json package-lock.json drizzle/schema.ts drizzle/
  git commit -m "feat(brandkit): add brandKit columns + extraction deps"
  ```

### Task D.2: Save sample-site HTML fixture for extraction tests

**Files:**
- Create: `tests/fixtures/sample-site.html`

- [ ] **Step 1: Write a self-contained fixture exercising every extractor path (palette via inline CSS vars, font via google-fonts link + @font-face, logo via og:image and `<link rel=icon>`).** Create `tests/fixtures/sample-site.html`:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Acme Widgets</title>
    <meta property="og:site_name" content="Acme Widgets" />
    <meta property="og:image" content="https://cdn.example.com/og-cover.png" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --brand-bg: #0B0F1A;
        --brand-surface: #161B2E;
        --brand-ink: #F5F7FF;
        --brand-muted: #9AA3B2;
        --brand-accent: #FF5A36;
        --brand-accent-2: #36C2FF;
      }
      body { background: var(--brand-bg); color: var(--brand-ink); font-family: "Inter", sans-serif; }
      h1, h2, .display { font-family: "Sora", sans-serif; font-weight: 700; }
      .btn { background: var(--brand-accent); color: #FFFFFF; border-radius: 14px; }
      @font-face {
        font-family: "Sora";
        src: url("/fonts/Sora-Bold.woff2") format("woff2");
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <header><img src="/logo.svg" alt="Acme logo" class="logo" /></header>
    <main>
      <h1 class="display">Ship widgets faster</h1>
      <p>The calmest way to build.</p>
      <a class="btn" href="/signup">Get started</a>
    </main>
  </body>
  </html>
  ```

- [ ] **Step 2: Commit.**
  ```bash
  git add tests/fixtures/sample-site.html
  git commit -m "test(brandkit): add sample-site html fixture"
  ```

### Task D.3: coldStartBrandKit (failing test first)

**Files:**
- Create: `tests/brain/brandkit.coldstart.test.ts`
- Create: `src/lib/brain/brandkit.ts` (type + coldStart only this task)

- [ ] **Step 1: Write failing test for `coldStartBrandKit`.** Create `tests/brain/brandkit.coldstart.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { coldStartBrandKit } from "@/lib/brain/brandkit";
  import { normalizeProfile } from "@/lib/brain/types";

  const baseProfile = normalizeProfile({
    name: "Acme",
    visualIdentity: { style: "minimal modern", colors: "navy and coral", mood: "calm, premium" },
    brandPersonality: { archetypes: ["Sage"], traits: ["calm", "precise"], voiceDos: [], voiceDonts: [] },
  });

  describe("coldStartBrandKit", () => {
    it("returns a fully-populated BrandKit with sane defaults", () => {
      const kit = coldStartBrandKit(baseProfile);
      expect(kit.palette.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(kit.palette.accents.length).toBeGreaterThan(0);
      expect(kit.palette.accents[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(kit.type.display.class).toBe("display");
      expect(kit.type.body.class).toBe("sans");
      expect(["line", "solid", "geometric"]).toContain(kit.icons.style);
      expect(typeof kit.shape.radius).toBe("number");
      expect(["airy", "balanced", "tight"]).toContain(kit.shape.density);
      expect(["none", "warm", "duotone"]).toContain(kit.photo.treatment);
      expect(kit.source.from).toBe("derived");
      expect(kit.mood.length).toBeGreaterThan(0);
    });

    it("derives density 'tight' from 'minimal' style and 'airy' from 'spacious'", () => {
      const tight = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "minimal", colors: "", mood: "" } }));
      const airy = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "spacious airy", colors: "", mood: "" } }));
      expect(tight.shape.density).toBe("tight");
      expect(airy.shape.density).toBe("airy");
    });

    it("picks 'solid' icons for bold/playful, 'line' for minimal", () => {
      const bold = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "bold playful", colors: "", mood: "energetic" } }));
      const minimal = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "minimal clean", colors: "", mood: "calm" } }));
      expect(bold.icons.style).toBe("solid");
      expect(minimal.icons.style).toBe("line");
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL (module not found).**
  ```bash
  npx vitest run tests/brain/brandkit.coldstart.test.ts
  ```
  Expected: FAIL - `Cannot find module '@/lib/brain/brandkit'`.

- [ ] **Step 3: Implement the BrandKit type + trait helpers + coldStartBrandKit.** Create `src/lib/brain/brandkit.ts`:
  ```ts
  import type { ProductProfile } from "@/lib/brain/types";

  export interface FontSpec {
    family: string;
    class: "serif" | "sans" | "display" | "mono";
    source: "fontsource" | "google" | "site" | "substitute";
    file?: string;
    weights: number[];
  }

  export interface BrandKit {
    palette: { bg: string; surface: string; ink: string; muted: string; accents: string[]; onAccent: string };
    type: { display: FontSpec; body: FontSpec };
    logo: { src?: string; mark?: string };
    icons: { style: "line" | "solid" | "geometric" };
    shape: { radius: number; density: "airy" | "balanced" | "tight" };
    photo: { treatment: "none" | "warm" | "duotone" };
    mood: string[];
    source: { from: "landingUrl" | "profile" | "upload" | "derived"; at: number; fontNote?: string };
  }

  const HEX = /^#[0-9a-fA-F]{6}$/;

  /** Pull hex colors out of a freeform "colors" string (e.g. "navy #0B0F1A and coral"). */
  export function parseHexFromText(text: string): string[] {
    const out: string[] = [];
    const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push(expandHex(m[0]));
    }
    return out;
  }

  function expandHex(h: string): string {
    if (h.length === 4) {
      return "#" + h.slice(1).split("").map((c) => c + c).join("").toUpperCase();
    }
    return h.toUpperCase();
  }

  /** density from visual style keywords */
  export function densityFromStyle(style: string): "airy" | "balanced" | "tight" {
    const s = style.toLowerCase();
    if (/(airy|spacious|open|breathable|generous)/.test(s)) return "airy";
    if (/(minimal|dense|compact|tight|packed|utilitarian)/.test(s)) return "tight";
    return "balanced";
  }

  /** icon style from style + mood/personality keywords */
  export function iconStyleFromTraits(style: string, mood: string): "line" | "solid" | "geometric" {
    const s = (style + " " + mood).toLowerCase();
    if (/(geometric|brutalist|grid|technical|angular)/.test(s)) return "geometric";
    if (/(bold|playful|fun|energetic|vibrant|loud|chunky)/.test(s)) return "solid";
    return "line";
  }

  /** corner radius from style */
  export function radiusFromStyle(style: string): number {
    const s = style.toLowerCase();
    if (/(sharp|brutalist|angular|hard|square)/.test(s)) return 0;
    if (/(rounded|soft|friendly|pill|bubbly)/.test(s)) return 24;
    if (/(minimal|clean|modern)/.test(s)) return 8;
    return 12;
  }

  /** photo treatment from mood */
  export function treatmentFromMood(mood: string): "none" | "warm" | "duotone" {
    const m = mood.toLowerCase();
    if (/(warm|cozy|earthy|sunset|inviting)/.test(m)) return "warm";
    if (/(bold|graphic|striking|editorial|moody|high-contrast)/.test(m)) return "duotone";
    return "none";
  }

  function moodWords(profile: ProductProfile): string[] {
    const raw = `${profile.visualIdentity.mood} ${profile.tone} ${(profile.brandPersonality?.traits || []).join(" ")}`;
    const words = raw
      .toLowerCase()
      .split(/[\s,;./]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);
    return Array.from(new Set(words)).slice(0, 6);
  }

  const DEFAULT_DISPLAY: FontSpec = { family: "Sora", class: "display", source: "substitute", weights: [700] };
  const DEFAULT_BODY: FontSpec = { family: "Inter", class: "sans", source: "substitute", weights: [400, 600] };

  /** Derive a sane BrandKit purely from the profile when no site is available. */
  export function coldStartBrandKit(profile: ProductProfile): BrandKit {
    const style = profile.visualIdentity.style || "";
    const mood = profile.visualIdentity.mood || "";

    const found = parseHexFromText(profile.visualIdentity.colors || "");
    const accents = found.length > 0 ? found : ["#FF5A36", "#36C2FF"];

    return {
      palette: {
        bg: "#0B0F1A",
        surface: "#161B2E",
        ink: "#F5F7FF",
        muted: "#9AA3B2",
        accents,
        onAccent: "#FFFFFF",
      },
      type: { display: { ...DEFAULT_DISPLAY }, body: { ...DEFAULT_BODY } },
      logo: {},
      icons: { style: iconStyleFromTraits(style, mood) },
      shape: { radius: radiusFromStyle(style), density: densityFromStyle(style) },
      photo: { treatment: treatmentFromMood(mood) },
      mood: moodWords(profile),
      source: { from: "derived", at: Date.now() },
    };
  }

  export { HEX };
  ```

- [ ] **Step 4: Run the test, expect PASS.**
  ```bash
  npx vitest run tests/brain/brandkit.coldstart.test.ts
  ```
  Expected: 3 tests PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/brain/brandkit.ts tests/brain/brandkit.coldstart.test.ts
  git commit -m "feat(brandkit): BrandKit type + coldStartBrandKit defaults"
  ```

### Task D.4: getCachedBrandKit reads products.brandKit JSON

**Files:**
- Create: `tests/brain/brandkit.cache.test.ts`
- Modify: `src/lib/brain/brandkit.ts`

- [ ] **Step 1: Write failing test for `getCachedBrandKit`.** Create `tests/brain/brandkit.cache.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { getCachedBrandKit, coldStartBrandKit, type BrandKit } from "@/lib/brain/brandkit";
  import { normalizeProfile } from "@/lib/brain/types";
  import type { Product } from "../../drizzle/schema";

  const kit: BrandKit = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "minimal", colors: "#112233", mood: "calm" } }));

  function fakeProduct(brandKit: unknown): Product {
    return { id: 1, name: "x", description: "x", brandKit } as unknown as Product;
  }

  describe("getCachedBrandKit", () => {
    it("returns null when brandKit column is null", () => {
      expect(getCachedBrandKit(fakeProduct(null))).toBeNull();
    });

    it("returns the kit when column holds a parsed object (json mode)", () => {
      const got = getCachedBrandKit(fakeProduct(kit));
      expect(got?.palette.accents[0]).toBe("#112233");
    });

    it("parses a JSON string column (legacy/text storage)", () => {
      const got = getCachedBrandKit(fakeProduct(JSON.stringify(kit)));
      expect(got?.palette.bg).toBe(kit.palette.bg);
    });

    it("returns null on malformed JSON string instead of throwing", () => {
      expect(getCachedBrandKit(fakeProduct("{not json"))).toBeNull();
    });

    it("returns null when parsed value lacks a palette", () => {
      expect(getCachedBrandKit(fakeProduct({ foo: 1 }))).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  npx vitest run tests/brain/brandkit.cache.test.ts
  ```
  Expected: FAIL - `getCachedBrandKit is not a function` / not exported.

- [ ] **Step 3: Implement `getCachedBrandKit`.** In `src/lib/brain/brandkit.ts`, add the import at top (after the existing import line):
  ```ts
  import type { schema } from "@/lib/db";
  ```
  Then append before the final `export { HEX };` line:
  ```ts
  function isBrandKit(v: unknown): v is BrandKit {
    if (!v || typeof v !== "object") return false;
    const k = v as Partial<BrandKit>;
    return (
      !!k.palette &&
      typeof k.palette === "object" &&
      typeof (k.palette as BrandKit["palette"]).bg === "string" &&
      Array.isArray((k.palette as BrandKit["palette"]).accents) &&
      !!k.type &&
      !!k.source
    );
  }

  /** Read + validate the cached BrandKit off a product row. Tolerates json-mode (object) or text (string). */
  export function getCachedBrandKit(product: schema.Product): BrandKit | null {
    const raw = (product as { brandKit?: unknown }).brandKit;
    if (raw == null) return null;
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return isBrandKit(parsed) ? parsed : null;
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  ```bash
  npx vitest run tests/brain/brandkit.cache.test.ts
  ```
  Expected: 5 tests PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/brain/brandkit.ts tests/brain/brandkit.cache.test.ts
  git commit -m "feat(brandkit): getCachedBrandKit json/text parse + validation"
  ```

### Task D.5: HTML/CSS palette + logo + font extractors (pure, fixture-tested)

**Files:**
- Create: `tests/brain/brandkit.extract.test.ts`
- Modify: `src/lib/brain/brandkit.ts`

- [ ] **Step 1: Write failing test against the fixture.** Create `tests/brain/brandkit.extract.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "fs";
  import { join } from "path";
  import {
    extractCssHexColors,
    extractLogoCandidates,
    extractFontFamilies,
    extractOgImage,
  } from "@/lib/brain/brandkit";

  const html = readFileSync(join(__dirname, "../fixtures/sample-site.html"), "utf-8");
  const baseUrl = "https://acme.test";

  describe("extractCssHexColors", () => {
    it("pulls hex values from inline CSS custom properties + rules", () => {
      const hexes = extractCssHexColors(html);
      expect(hexes).toContain("#0B0F1A");
      expect(hexes).toContain("#FF5A36");
      expect(hexes).toContain("#36C2FF");
      expect(hexes).toContain("#F5F7FF");
    });
    it("dedupes and uppercases", () => {
      const hexes = extractCssHexColors(html);
      expect(new Set(hexes).size).toBe(hexes.length);
      expect(hexes.every((h) => h === h.toUpperCase())).toBe(true);
    });
  });

  describe("extractLogoCandidates", () => {
    it("returns absolute URLs for og:image, icon, apple-touch-icon, and inline logo img", () => {
      const c = extractLogoCandidates(html, baseUrl);
      expect(c).toContain("https://cdn.example.com/og-cover.png");
      expect(c).toContain("https://acme.test/favicon-32.png");
      expect(c).toContain("https://acme.test/apple-touch-icon.png");
      expect(c).toContain("https://acme.test/logo.svg");
    });
  });

  describe("extractOgImage", () => {
    it("returns the og:image absolute URL", () => {
      expect(extractOgImage(html, baseUrl)).toBe("https://cdn.example.com/og-cover.png");
    });
  });

  describe("extractFontFamilies", () => {
    it("reads display font from heading rules and body font from body rule", () => {
      const fonts = extractFontFamilies(html);
      expect(fonts.display).toBe("Sora");
      expect(fonts.body).toBe("Inter");
    });
    it("includes google-fonts families and @font-face families", () => {
      const fonts = extractFontFamilies(html);
      expect(fonts.googleFonts).toContain("Sora");
      expect(fonts.googleFonts).toContain("Inter");
      expect(fonts.fontFace).toContain("Sora");
    });
  });
  ```

- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  npx vitest run tests/brain/brandkit.extract.test.ts
  ```
  Expected: FAIL - extractors not exported.

- [ ] **Step 3: Implement the pure extractors.** In `src/lib/brain/brandkit.ts`, add imports at the top (after existing imports):
  ```ts
  import * as cheerio from "cheerio";
  import postcss from "postcss";
  ```
  Then append before `export { HEX };`:
  ```ts
  function absoluteUrl(href: string, baseUrl: string): string | null {
    if (!href) return null;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  }

  /** Collect every hex color appearing in inline <style> blocks (custom props + rules), deduped + uppercased. */
  export function extractCssHexColors(html: string): string[] {
    const $ = cheerio.load(html);
    const css = $("style")
      .map((_, el) => $(el).html() || "")
      .get()
      .join("\n");
    const out: string[] = [];
    const seen = new Set<string>();
    try {
      const root = postcss.parse(css);
      root.walkDecls((decl) => {
        for (const h of parseHexFromText(decl.value)) {
          if (!seen.has(h)) { seen.add(h); out.push(h); }
        }
      });
    } catch {
      // postcss parse failure -> fall back to raw regex over the css blob
    }
    for (const h of parseHexFromText(css)) {
      if (!seen.has(h)) { seen.add(h); out.push(h); }
    }
    return out;
  }

  /** og:image as an absolute URL, or null. */
  export function extractOgImage(html: string, baseUrl: string): string | null {
    const $ = cheerio.load(html);
    const og = $('meta[property="og:image"]').attr("content")
      || $('meta[name="og:image"]').attr("content")
      || $('meta[name="twitter:image"]').attr("content");
    return og ? absoluteUrl(og, baseUrl) : null;
  }

  /** Ordered logo/mark candidates (best-first): og:image, apple-touch-icon, icon links, inline logo imgs. */
  export function extractLogoCandidates(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const out: string[] = [];
    const push = (href?: string | null) => {
      const abs = href ? absoluteUrl(href, baseUrl) : null;
      if (abs && !out.includes(abs)) out.push(abs);
    };
    push($('meta[property="og:image"]').attr("content"));
    push($('link[rel="apple-touch-icon"]').attr("href"));
    $('link[rel~="icon"]').each((_, el) => push($(el).attr("href")));
    $('img[class*="logo" i], img[alt*="logo" i], img[id*="logo" i]').each((_, el) => push($(el).attr("src")));
    return out;
  }

  export interface ExtractedFonts {
    display?: string;
    body?: string;
    googleFonts: string[];
    fontFace: string[];
  }

  function firstFamily(value: string): string | undefined {
    const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!first) return undefined;
    const generic = ["serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy", "inherit", "initial"];
    return generic.includes(first.toLowerCase()) ? undefined : first;
  }

  /** Parse font-family from heading/body CSS rules + google-fonts <link> + @font-face. */
  export function extractFontFamilies(html: string): ExtractedFonts {
    const $ = cheerio.load(html);
    const css = $("style").map((_, el) => $(el).html() || "").get().join("\n");

    let display: string | undefined;
    let body: string | undefined;
    const fontFace: string[] = [];

    try {
      const root = postcss.parse(css);
      root.walkRules((rule) => {
        const sel = rule.selector.toLowerCase();
        const isHeading = /(^|[\s,])(h1|h2|h3|\.display|\.heading|\.title)/.test(sel);
        const isBody = /(^|[\s,])(body|html|p|\.body)/.test(sel);
        rule.walkDecls("font-family", (decl) => {
          const fam = firstFamily(decl.value);
          if (!fam) return;
          if (isHeading && !display) display = fam;
          else if (isBody && !body) body = fam;
        });
      });
      root.walkAtRules("font-face", (at) => {
        at.walkDecls("font-family", (decl) => {
          const fam = firstFamily(decl.value);
          if (fam && !fontFace.includes(fam)) fontFace.push(fam);
        });
      });
    } catch {
      // ignore CSS parse errors; google-fonts link below still works
    }

    const googleFonts: string[] = [];
    $('link[href*="fonts.googleapis.com"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const re = /family=([^&]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(href)) !== null) {
        const fam = decodeURIComponent(m[1]).split(":")[0].replace(/\+/g, " ").trim();
        if (fam && !googleFonts.includes(fam)) googleFonts.push(fam);
      }
    });

    if (!display && googleFonts[0]) display = googleFonts[0];
    if (!body && googleFonts[1]) body = googleFonts[1];

    return { display, body, googleFonts, fontFace };
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  ```bash
  npx vitest run tests/brain/brandkit.extract.test.ts
  ```
  Expected: all PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/brain/brandkit.ts tests/brain/brandkit.extract.test.ts
  git commit -m "feat(brandkit): html/css palette, logo, font extractors"
  ```

### Task D.6: Palette mapping + font resolution helpers

**Files:**
- Create: `tests/brain/brandkit.palette.test.ts`
- Modify: `src/lib/brain/brandkit.ts`

- [ ] **Step 1: Write failing test for palette mapping + font-spec building.** Create `tests/brain/brandkit.palette.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { buildPalette, relativeLuminance, buildFontSpecs } from "@/lib/brain/brandkit";

  describe("relativeLuminance", () => {
    it("white is brighter than black", () => {
      expect(relativeLuminance("#FFFFFF")).toBeGreaterThan(relativeLuminance("#000000"));
    });
  });

  describe("buildPalette", () => {
    it("assigns darkest as bg, lightest as ink, vivid as accent", () => {
      const p = buildPalette(["#0B0F1A", "#F5F7FF", "#161B2E", "#9AA3B2", "#FF5A36", "#36C2FF"]);
      expect(relativeLuminance(p.bg)).toBeLessThan(relativeLuminance(p.ink));
      expect(p.accents.length).toBeGreaterThan(0);
      expect(p.onAccent === "#FFFFFF" || p.onAccent === "#0B0F1A").toBe(true);
    });
    it("returns a usable palette even from a single color", () => {
      const p = buildPalette(["#FF5A36"]);
      expect(p.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.ink).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.accents[0]).toBe("#FF5A36");
    });
    it("returns null when given no colors", () => {
      expect(buildPalette([])).toBeNull();
    });
  });

  describe("buildFontSpecs", () => {
    it("marks site-sourced when family came from CSS, google when from google link", () => {
      const specs = buildFontSpecs({ display: "Sora", body: "Inter", googleFonts: ["Sora"], fontFace: ["Sora"] });
      expect(specs.display.family).toBe("Sora");
      expect(specs.display.source).toBe("site");
      expect(specs.body.family).toBe("Inter");
      expect(specs.display.class).toBe("display");
      expect(specs.body.class).toBe("sans");
    });
    it("falls back to substitute defaults when no fonts found", () => {
      const specs = buildFontSpecs({ googleFonts: [], fontFace: [] });
      expect(specs.display.source).toBe("substitute");
      expect(specs.body.source).toBe("substitute");
    });
  });
  ```

- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  npx vitest run tests/brain/brandkit.palette.test.ts
  ```
  Expected: FAIL - helpers not exported.

- [ ] **Step 3: Implement palette + font-spec builders.** In `src/lib/brain/brandkit.ts`, append before `export { HEX };`:
  ```ts
  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /** WCAG relative luminance 0..1. */
  export function relativeLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function saturation(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
  }

  function bestTextOn(hex: string): string {
    return relativeLuminance(hex) > 0.4 ? "#0B0F1A" : "#FFFFFF";
  }

  function darken(hex: string, amt: number): string {
    const rgb = hexToRgb(hex).map((c) => Math.max(0, Math.round(c * (1 - amt))));
    return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function lighten(hex: string, amt: number): string {
    const rgb = hexToRgb(hex).map((c) => Math.min(255, Math.round(c + (255 - c) * amt)));
    return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  /** Map an unordered hex list into a structured palette. Returns null if empty. */
  export function buildPalette(hexes: string[]): BrandKit["palette"] | null {
    const colors = Array.from(new Set(hexes.map(expandHex))).filter((h) => HEX.test(h));
    if (colors.length === 0) return null;

    const byLum = [...colors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
    const bg = byLum[0];
    const ink = byLum[byLum.length - 1] !== bg ? byLum[byLum.length - 1] : lighten(bg, 0.9);
    const surface = colors.length > 2 ? darken(ink, 0.85) : lighten(bg, 0.08);
    const muted = lighten(bg, 0.45);

    // accents = most saturated colors that aren't bg/ink, fallback to bg-derived
    const accents = [...colors]
      .filter((c) => c !== bg && c !== ink)
      .sort((a, b) => saturation(b) - saturation(a))
      .slice(0, 3);
    if (accents.length === 0) accents.push(saturation(ink) > saturation(bg) ? ink : lighten(bg, 0.6));

    return { bg, surface, ink, muted, accents, onAccent: bestTextOn(accents[0]) };
  }

  function fontClass(family: string): FontSpec["class"] {
    const f = family.toLowerCase();
    if (/(mono|code|consolas|courier)/.test(f)) return "mono";
    if (/(serif|georgia|times|playfair|lora|merriweather|garamond)/.test(f)) return "serif";
    return "sans";
  }

  /** Build display+body FontSpecs from extracted families, tagging source (site vs google vs substitute). */
  export function buildFontSpecs(fonts: ExtractedFonts): BrandKit["type"] {
    const known = new Set([...fonts.googleFonts, ...fonts.fontFace]);
    const mk = (family: string | undefined, role: "display" | "body"): FontSpec => {
      if (!family) return role === "display" ? { ...DEFAULT_DISPLAY } : { ...DEFAULT_BODY };
      const source: FontSpec["source"] = fonts.fontFace.includes(family) || known.has(family) ? "site" : "google";
      const klass = role === "display" ? "display" : fontClass(family);
      return {
        family,
        class: klass,
        source: fonts.googleFonts.includes(family) && !fonts.fontFace.includes(family) ? "google" : source,
        weights: role === "display" ? [700] : [400, 600],
      };
    };
    return { display: mk(fonts.display, "display"), body: mk(fonts.body, "body") };
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  ```bash
  npx vitest run tests/brain/brandkit.palette.test.ts
  ```
  Expected: all PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/brain/brandkit.ts tests/brain/brandkit.palette.test.ts
  git commit -m "feat(brandkit): palette mapping + font spec builders"
  ```

### Task D.7: deriveBrandKit orchestrator (fetch site, fall back to coldStart, never throw)

**Files:**
- Create: `tests/brain/brandkit.derive.test.ts`
- Modify: `src/lib/brain/brandkit.ts`

- [ ] **Step 1: Write failing test that mocks fetch + db so derive parses the fixture and falls back on errors.** Create `tests/brain/brandkit.derive.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { readFileSync } from "fs";
  import { join } from "path";

  const html = readFileSync(join(__dirname, "../fixtures/sample-site.html"), "utf-8");

  // db mock: a single mutable product row
  const row: Record<string, unknown> = { id: 7, landingUrl: "https://acme.test", profile: null };
  vi.mock("@/lib/db", () => {
    const get = () => row;
    const where = () => ({ get });
    const from = () => ({ where });
    return {
      db: { select: () => ({ from }) },
      schema: { products: { id: "id" } },
    };
  });

  // resolveFont mock: avoid disk/network; return a tiny buffer
  vi.mock("@/lib/compose/fonts", () => ({
    resolveFont: vi.fn(async (family: string, klass: string, weight = 400) => ({
      family, class: klass, filePath: "/tmp/x.woff2", data: Buffer.from("FONT"), weight, source: "google",
    })),
  }));

  // node-vibrant mock: deterministic swatches from any buffer
  vi.mock("node-vibrant/node", () => ({
    Vibrant: {
      from: () => ({
        getPalette: async () => ({
          Vibrant: { hex: "#FF5A36" },
          DarkMuted: { hex: "#0B0F1A" },
          LightVibrant: { hex: "#F5F7FF" },
        }),
      }),
    },
  }));

  import { deriveBrandKit } from "@/lib/brain/brandkit";

  beforeEach(() => {
    row.landingUrl = "https://acme.test";
    row.profile = JSON.stringify({ visualIdentity: { style: "minimal", colors: "#112233", mood: "calm" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => html, arrayBuffer: async () => new ArrayBuffer(8) })));
  });

  describe("deriveBrandKit", () => {
    it("derives a kit from the live site (palette + font + logo)", async () => {
      const kit = await deriveBrandKit(7);
      expect(kit.source.from).toBe("landingUrl");
      expect(kit.palette.accents.length).toBeGreaterThan(0);
      expect(kit.type.display.family).toBeTruthy();
      expect(kit.logo.src).toBeTruthy();
    });

    it("falls back to coldStart (derived) when there is no landingUrl", async () => {
      row.landingUrl = null;
      const kit = await deriveBrandKit(7);
      expect(kit.source.from).toBe("derived");
      expect(kit.palette.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("falls back to coldStart when fetch throws (never rejects)", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
      const kit = await deriveBrandKit(7);
      expect(kit.source.from).toBe("derived");
    });
  });
  ```

- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  npx vitest run tests/brain/brandkit.derive.test.ts
  ```
  Expected: FAIL - `deriveBrandKit` not exported.

- [ ] **Step 3: Implement `deriveBrandKit`.** In `src/lib/brain/brandkit.ts`, replace the top import block to add the runtime deps and helpers. First add imports after the existing ones:
  ```ts
  import { eq } from "drizzle-orm";
  import { db, schema } from "@/lib/db";
  import { normalizeProfile, type ProductProfile } from "@/lib/brain/types";
  import { resolveFont } from "@/lib/compose/fonts";
  import sharp from "sharp";
  ```
  (Adjust the existing `import type { ProductProfile }` line to avoid a duplicate: remove the standalone `import type { ProductProfile } from "@/lib/brain/types";` at the top since it's now covered by the line above.)
  Then append before `export { HEX };`:
  ```ts
  async function fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; BuzzBot/1.0)" },
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async function paletteFromImage(imageUrl: string): Promise<string[]> {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) return [];
      const buf = Buffer.from(await res.arrayBuffer());
      // normalize to png so Vibrant/sharp can decode svg/webp/ico variants
      const png = await sharp(buf).resize(200, 200, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const { Vibrant } = await import("node-vibrant/node");
      const swatches = await Vibrant.from(png).getPalette();
      return Object.values(swatches)
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => s.hex.toUpperCase());
    } catch {
      return [];
    }
  }

  async function attachFontData(kit: BrandKit): Promise<void> {
    for (const spec of [kit.type.display, kit.type.body]) {
      try {
        const resolved = await resolveFont(spec.family, spec.class, spec.weights[0]);
        spec.file = resolved.filePath;
        spec.source = resolved.source;
      } catch {
        // keep the family name; downstream renderer falls back to substitute
        kit.source.fontNote = `font "${spec.family}" unresolved`;
      }
    }
  }

  /**
   * Derive a BrandKit for a product from its landing site.
   * Pipeline: fetch HTML -> CSS hex palette (+ og:image/favicon palette via Vibrant) -> logo -> fonts.
   * Any failure degrades gracefully to coldStartBrandKit. NEVER throws.
   */
  export async function deriveBrandKit(productId: number): Promise<BrandKit> {
    let profile: ProductProfile;
    let landingUrl: string | null = null;

    try {
      const product = await db.select().from(schema.products).where(eq(schema.products.id, productId)).get();
      landingUrl = (product?.landingUrl as string | null) ?? null;
      const rawProfile = product?.profile;
      profile = rawProfile
        ? normalizeProfile(typeof rawProfile === "string" ? JSON.parse(rawProfile) : (rawProfile as Record<string, unknown>))
        : normalizeProfile({});
    } catch {
      return coldStartBrandKit(normalizeProfile({}));
    }

    const cold = coldStartBrandKit(profile);
    if (!landingUrl) return cold;

    const html = await fetchHtml(landingUrl);
    if (!html) return cold;

    try {
      // 1. palette: CSS hexes first, augmented by og/favicon image colors
      const cssHexes = extractCssHexColors(html);
      const logos = extractLogoCandidates(html, landingUrl);
      const og = extractOgImage(html, landingUrl);
      const imageColors = og ? await paletteFromImage(og) : [];
      const palette = buildPalette([...cssHexes, ...imageColors]) ?? cold.palette;

      // 2. fonts
      const fonts = extractFontFamilies(html);
      const type = buildFontSpecs(fonts);

      // 3. logo
      const logoSrc = logos[0];

      const kit: BrandKit = {
        palette,
        type,
        logo: logoSrc ? { src: logoSrc, mark: logos[1] } : cold.logo,
        icons: cold.icons,
        shape: cold.shape,
        photo: cold.photo,
        mood: cold.mood,
        source: { from: "landingUrl", at: Date.now() },
      };

      await attachFontData(kit);
      return kit;
    } catch {
      return cold;
    }
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  ```bash
  npx vitest run tests/brain/brandkit.derive.test.ts
  ```
  Expected: 3 tests PASS.

- [ ] **Step 5: Run the full brandkit suite to confirm no regressions.**
  ```bash
  npx vitest run tests/brain/brandkit.coldstart.test.ts tests/brain/brandkit.cache.test.ts tests/brain/brandkit.extract.test.ts tests/brain/brandkit.palette.test.ts tests/brain/brandkit.derive.test.ts
  ```
  Expected: all PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/brain/brandkit.ts tests/brain/brandkit.derive.test.ts
  git commit -m "feat(brandkit): deriveBrandKit orchestrator with coldStart fallback"
  ```

### Task D.8: Persist brandKit after extraction (wire into extract.ts)

**Files:**
- Create: `tests/brain/extract.brandkit.test.ts`
- Modify: `src/lib/brain/extract.ts`

- [ ] **Step 1: Write failing test asserting extraction persists brandKit + brandKitUpdatedAt and that a derive failure does not throw.** Create `tests/brain/extract.brandkit.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // capture every .set() payload made on products
  const setCalls: Array<Record<string, unknown>> = [];
  const existingRow = { id: 9, textProvider: "gemini", profile: null, marketingStrategy: null };

  vi.mock("@/lib/db", () => {
    const where = () => Promise.resolve(undefined);
    const set = (vals: Record<string, unknown>) => { setCalls.push(vals); return { where }; };
    const update = () => ({ set });
    const get = () => existingRow;
    const select = () => ({ from: () => ({ where: () => ({ get }) }) });
    return { db: { update, select }, schema: { products: { id: "id" } } };
  });
  vi.mock("@/lib/revisions", () => ({ snapshotChangedFields: vi.fn(async () => {}) }));
  vi.mock("@/lib/images", () => ({ prepareImages: vi.fn(async () => []) }));
  vi.mock("@/lib/providers", () => ({
    createTextProvider: () => ({
      generate: async () => ({ text: JSON.stringify({ profile: { name: "Acme" }, marketingStrategy: { visualDirection: "x" } }) }),
    }),
  }));
  vi.mock("@/lib/providers/errors", () => ({ classifyProviderError: (e: unknown) => String(e) }));

  const deriveBrandKit = vi.fn();
  vi.mock("@/lib/brain/brandkit", () => ({ deriveBrandKit: (id: number) => deriveBrandKit(id) }));

  import { extractProfileAndStrategy } from "@/lib/brain/extract";

  beforeEach(() => {
    setCalls.length = 0;
    deriveBrandKit.mockReset();
  });

  describe("extractProfileAndStrategy brandKit persistence", () => {
    it("derives + persists brandKit and brandKitUpdatedAt", async () => {
      deriveBrandKit.mockResolvedValue({ palette: { bg: "#000000", accents: ["#FFFFFF"] }, type: {}, source: { from: "landingUrl", at: 1 } });
      await extractProfileAndStrategy({ productId: 9, name: "Acme", description: "d", planFileContent: "", screenshotPaths: [] });

      expect(deriveBrandKit).toHaveBeenCalledWith(9);
      const bkUpdate = setCalls.find((c) => "brandKit" in c);
      expect(bkUpdate).toBeTruthy();
      expect(typeof bkUpdate!.brandKitUpdatedAt).toBe("number");
    });

    it("does not throw / does not mark extraction failed when derive rejects", async () => {
      deriveBrandKit.mockRejectedValue(new Error("derive boom"));
      await expect(
        extractProfileAndStrategy({ productId: 9, name: "Acme", description: "d", planFileContent: "", screenshotPaths: [] })
      ).resolves.toBeUndefined();
      // extraction itself still completed
      expect(setCalls.some((c) => c.extractionStatus === "done")).toBe(true);
      expect(setCalls.some((c) => c.extractionStatus === "failed")).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  npx vitest run tests/brain/extract.brandkit.test.ts
  ```
  Expected: FAIL - no brandKit set call / deriveBrandKit not invoked.

- [ ] **Step 3: Wire brandKit derivation into `extract.ts`.** In `src/lib/brain/extract.ts`, add the import after the existing imports (line 7 area):
  ```ts
  import { deriveBrandKit } from "@/lib/brain/brandkit";
  ```
  Then, immediately after the `extractionStatus: "done"` update block (after line 81's `.where(eq(schema.products.id, productId));`), insert:
  ```ts
      // Derive + persist brand kit (best-effort; never fails the extraction)
      try {
        const brandKit = await deriveBrandKit(productId);
        await db.update(schema.products)
          .set({ brandKit, brandKitUpdatedAt: Date.now() })
          .where(eq(schema.products.id, productId));
        console.log(`Derived brand kit for product ${productId} (source: ${brandKit.source.from})`);
      } catch (bkError) {
        console.error(`Brand kit derivation failed for product ${productId}:`, bkError);
      }
  ```
  Note: `deriveBrandKit` itself never throws, but the inner DB write could; the try/catch guarantees extraction stays "done".

- [ ] **Step 4: Run, expect PASS.**
  ```bash
  npx vitest run tests/brain/extract.brandkit.test.ts
  ```
  Expected: 2 tests PASS.

- [ ] **Step 5: Run the entire cluster D suite + typecheck.**
  ```bash
  npx vitest run tests/brain/brandkit.coldstart.test.ts tests/brain/brandkit.cache.test.ts tests/brain/brandkit.extract.test.ts tests/brain/brandkit.palette.test.ts tests/brain/brandkit.derive.test.ts tests/brain/extract.brandkit.test.ts && npx tsc --noEmit
  ```
  Expected: all tests PASS; no type errors.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/brain/extract.ts tests/brain/extract.brandkit.test.ts
  git commit -m "feat(brandkit): persist brandKit after extraction (best-effort)"
  ```

**Unresolved questions:**
1. `resolveFont` import path: contract says `src/lib/compose/fonts.ts` (cluster SETUP/other). D.7 mocks it; real run needs it to exist. Block D.7 on that cluster, or stub locally?
2. `node-vibrant` v4 import path is `node-vibrant/node`. OK to pin v4, or prefer v3 `node-vibrant`?
3. brandKit stored via drizzle `{ mode: "json" }` -> object on write. `getCachedBrandKit` handles both object+string. Confirm json-mode write is desired (vs `JSON.stringify`)?
4. og:image often a wide cover, not a logo. Acceptable to use it as top logo candidate, or restrict logos to icon/inline-img only?

## Phase P1 - Generation makes editable scenes

### Task F.1: Install satori + resvg + a real TTF font for the fidelity spike

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install runtime deps.** Run:
  ```bash
  npm install satori@^0.12.1 @resvg/resvg-js@^2.6.2 @fontsource/inter@^5.1.0
  ```
  `satori` produces SVG from the object tree, `@resvg/resvg-js` rasterizes to PNG, `@fontsource/inter` ships real TTF buffers we can load in tests and at runtime.

- [ ] **Step 2: Verify the Inter TTF is present on disk.** Run and confirm a non-zero byte count:
  ```bash
  ls -l node_modules/@fontsource/inter/files/inter-latin-400-normal.woff node_modules/@fontsource/inter/files/inter-latin-700-normal.woff 2>/dev/null; find node_modules/@fontsource/inter/files -name 'inter-latin-*-normal.ttf' 2>/dev/null | head
  ```
  Satori requires TTF/OTF/WOFF (not WOFF2). If only `.woff2` ships, additionally run `npm install @fontsource/inter` already includes legacy `.woff`; for tests we will use the `.woff` file. Record the exact path of a `400` and `700` weight file for use in F.2.

- [ ] **Step 3: Commit.**
  ```bash
  git add package.json package-lock.json
  git commit -m "chore(compose): add satori, resvg-js, inter font for scene rendering"
  ```

### Task F.2: SATORI/RESVG FIDELITY SPIKE - render a hand-written 3-element Scene to a real 1080x1350 PNG

**Files:**
- Test: `src/lib/compose/render/satoriResvg.spike.test.ts`

- [ ] **Step 1: Write the spike test (expected FAIL - imports satori/resvg + sceneToSatori, asserts PNG dims + size).** This is a throwaway-style integration spike proving the satori -> SVG -> resvg -> PNG pipeline works end-to-end against a real TTF, independent of our renderer wrapper.
  ```ts
  // src/lib/compose/render/satoriResvg.spike.test.ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "fs";
  import { join } from "path";
  import satori from "satori";
  import { Resvg } from "@resvg/resvg-js";
  import { sceneToSatori } from "@/lib/compose/satoriTree";
  import { SCENE_W, SCENE_H, type Scene } from "@/lib/compose/scene";

  function loadInter(weight: 400 | 700): Buffer {
    const file = weight === 700 ? "inter-latin-700-normal.woff" : "inter-latin-400-normal.woff";
    return readFileSync(join(process.cwd(), "node_modules/@fontsource/inter/files", file));
  }

  // PNG IHDR: bytes 16-19 = width, 20-23 = height (big-endian uint32)
  function pngDims(buf: Buffer): { width: number; height: number } {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  describe("satori+resvg fidelity spike", () => {
    it("renders a 3-element scene to a 1080x1350 PNG with real text", async () => {
      const scene: Scene = {
        w: SCENE_W,
        h: SCENE_H,
        background: { kind: "gradient", from: "#0B1020", to: "#1E3A8A", angle: 135 },
        elements: [
          { id: "h", type: "text", x: 80, y: 200, w: 920, h: 300, rotation: 0, z: 1, slot: "headline",
            content: "Ship faster", fontFamily: "Inter", fontWeight: 700, size: 96, color: "#FFFFFF", align: "left", lineHeight: 1.05 },
          { id: "s", type: "text", x: 80, y: 540, w: 920, h: 200, rotation: 0, z: 1, slot: "subhead",
            content: "A composable scene renderer", fontFamily: "Inter", fontWeight: 400, size: 44, color: "#CBD5E1", align: "left", lineHeight: 1.2 },
          { id: "box", type: "shape", x: 80, y: 1100, w: 360, h: 120, rotation: 0, z: 0, shape: "rect",
            fill: "#F59E0B", radius: 24 },
        ],
      };

      const tree = sceneToSatori(scene);
      const svg = await satori(tree as Parameters<typeof satori>[0], {
        width: SCENE_W,
        height: SCENE_H,
        fonts: [
          { name: "Inter", data: loadInter(400), weight: 400, style: "normal" },
          { name: "Inter", data: loadInter(700), weight: 700, style: "normal" },
        ],
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain("Ship faster");

      const resvg = new Resvg(svg, {
        font: { loadSystemFonts: false },
        fitTo: { mode: "width", value: SCENE_W },
      });
      const png = resvg.render().asPng();

      const { width, height } = pngDims(png);
      expect(width).toBe(SCENE_W);
      expect(height).toBe(SCENE_H);
      // Non-trivial: a real rasterized scene is far larger than an empty canvas
      expect(png.length).toBeGreaterThan(5000);
    });
  });
  ```

- [ ] **Step 2: Run the spike (expected FAIL - `src/lib/compose/render/satoriResvg.ts` not yet built, but this test imports only satori/resvg/satoriTree; if `sceneToSatori` is unimplemented it fails here).**
  ```bash
  npx vitest run src/lib/compose/render/satoriResvg.spike.test.ts
  ```
  Expected: FAIL (either `sceneToSatori` text not in SVG, or dims mismatch). If `sceneToSatori` already passes, this confirms the spike and we proceed.

- [ ] **Step 3: Make the spike pass by confirming `sceneToSatori` emits absolute-positioned children.** The renderer wrapper isn't needed for this spike; the only fix scope here is ensuring `sceneToSatori` output is satori-valid (it is per contract). Re-run:
  ```bash
  npx vitest run src/lib/compose/render/satoriResvg.spike.test.ts
  ```
  Expected: PASS (PNG is exactly 1080x1350, length > 5000 bytes).

- [ ] **Step 4: Commit.**
  ```bash
  git add src/lib/compose/render/satoriResvg.spike.test.ts
  git commit -m "test(compose): satori+resvg fidelity spike renders 1080x1350 png"
  ```

### Task F.3: Add SceneRenderInput / SceneRenderOutput / SceneRenderer to provider types

**Files:**
- Modify: `src/lib/providers/types.ts`
- Modify: `src/lib/providers/index.ts`

- [ ] **Step 1: Append the scene-renderer contract types to `types.ts`** (after `AudioProvider`, before `ProviderConfig`). Exact contract:
  ```ts
  // Scene rendering (Satori + resvg)
  export interface SceneRenderInput {
    scene: import("@/lib/compose/scene").Scene;
    fonts: { name: string; data: Buffer; weight?: number; style?: "normal" | "italic" }[];
  }

  export interface SceneRenderOutput {
    url: string;
    localPath?: string;
    svg?: string;
  }

  export type SceneRenderer = Provider<SceneRenderInput, SceneRenderOutput>;
  ```

- [ ] **Step 2: Re-export the new types from `index.ts`.** Add to the existing `export type { ... } from "./types"` block:
  ```ts
    SceneRenderInput,
    SceneRenderOutput,
    SceneRenderer,
  ```

- [ ] **Step 3: Typecheck the new types compile.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS (no errors from the additions).

- [ ] **Step 4: Commit.**
  ```bash
  git add src/lib/providers/types.ts src/lib/providers/index.ts
  git commit -m "feat(providers): add SceneRenderer input/output contract types"
  ```

### Task F.4: Add scene-renderer slot to the provider registry

**Files:**
- Test: `src/lib/providers/registry.sceneRenderer.test.ts`
- Modify: `src/lib/providers/registry.ts`
- Modify: `src/lib/providers/index.ts`

- [ ] **Step 1: Write the registry test (expected FAIL - `registerSceneRenderer`/`getSceneRenderer`/`hasSceneRenderer` don't exist).**
  ```ts
  // src/lib/providers/registry.sceneRenderer.test.ts
  import { describe, it, expect, beforeEach } from "vitest";
  import {
    registerSceneRenderer,
    getSceneRenderer,
    hasSceneRenderer,
  } from "@/lib/providers/registry";
  import type { SceneRenderer } from "@/lib/providers/types";

  const stub: SceneRenderer = {
    name: "stub/renderer",
    async generate() {
      return { url: "/api/media/x.png", localPath: "/api/media/x.png" };
    },
  };

  describe("scene-renderer registry slot", () => {
    it("has=false before registration and throws on get", () => {
      // fresh module state per test file; nothing registered yet
      expect(hasSceneRenderer()).toBe(false);
      expect(() => getSceneRenderer()).toThrow(/No scene renderer registered/);
    });

    it("has=true and returns the provider after registration", () => {
      registerSceneRenderer(stub);
      expect(hasSceneRenderer()).toBe(true);
      expect(getSceneRenderer()).toBe(stub);
      expect(getSceneRenderer().name).toBe("stub/renderer");
    });
  });
  ```

- [ ] **Step 2: Run (expected FAIL - exports missing).**
  ```bash
  npx vitest run src/lib/providers/registry.sceneRenderer.test.ts
  ```
  Expected: FAIL (cannot resolve `registerSceneRenderer`).

- [ ] **Step 3: Add the slot to `registry.ts`.** Extend the `import type` line, the `ProviderRegistry` interface, the `registry` object, and add three functions. Change the import line to:
  ```ts
  import type { TextProvider, ImageProvider, VideoProvider, AudioProvider, SceneRenderer } from "./types";
  ```
  Add to the `ProviderRegistry` interface:
  ```ts
    sceneRenderer: SceneRenderer | null;
  ```
  Add to the `registry` const:
  ```ts
    sceneRenderer: null,
  ```
  Append these functions:
  ```ts
  export function registerSceneRenderer(provider: SceneRenderer): void {
    registry.sceneRenderer = provider;
  }

  export function getSceneRenderer(): SceneRenderer {
    if (!registry.sceneRenderer) {
      throw new Error("No scene renderer registered");
    }
    return registry.sceneRenderer;
  }

  export function hasSceneRenderer(): boolean {
    return registry.sceneRenderer !== null;
  }
  ```

- [ ] **Step 4: Re-export from `index.ts`** (add to the `export { ... } from "./registry"` block):
  ```ts
    registerSceneRenderer,
    getSceneRenderer,
    hasSceneRenderer,
  ```

- [ ] **Step 5: Run (expected PASS).**
  ```bash
  npx vitest run src/lib/providers/registry.sceneRenderer.test.ts
  ```
  Expected: PASS (both cases green).

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/providers/registry.ts src/lib/providers/index.ts src/lib/providers/registry.sceneRenderer.test.ts
  git commit -m "feat(providers): add scene-renderer registry slot"
  ```

### Task F.5: Implement createSatoriResvgRenderer (Scene -> SVG -> PNG -> public/media)

**Files:**
- Test: `src/lib/compose/render/satoriResvg.test.ts`
- Create: `src/lib/compose/render/satoriResvg.ts`

- [ ] **Step 1: Write the renderer smoke test (expected FAIL - module not created).** Asserts the renderer returns a `localPath` under `/api/media/`, writes a real PNG to disk, exposes the SVG, and the PNG is 1080x1350.
  ```ts
  // src/lib/compose/render/satoriResvg.test.ts
  import { describe, it, expect } from "vitest";
  import { readFileSync, existsSync } from "fs";
  import { join } from "path";
  import { createSatoriResvgRenderer } from "@/lib/compose/render/satoriResvg";
  import { SCENE_W, SCENE_H, type Scene } from "@/lib/compose/scene";

  function loadInter(weight: 400 | 700): Buffer {
    const file = weight === 700 ? "inter-latin-700-normal.woff" : "inter-latin-400-normal.woff";
    return readFileSync(join(process.cwd(), "node_modules/@fontsource/inter/files", file));
  }

  function pngDims(buf: Buffer): { width: number; height: number } {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  const sampleScene: Scene = {
    w: SCENE_W,
    h: SCENE_H,
    background: { kind: "solid", color: "#101418" },
    elements: [
      { id: "h", type: "text", x: 80, y: 240, w: 920, h: 280, rotation: 0, z: 1, slot: "headline",
        content: "Render smoke", fontFamily: "Inter", fontWeight: 700, size: 88, color: "#FFFFFF", align: "left", lineHeight: 1.05 },
      { id: "b", type: "text", x: 80, y: 560, w: 920, h: 200, rotation: 0, z: 1, slot: "body",
        content: "Satori then resvg to a PNG.", fontFamily: "Inter", fontWeight: 400, size: 40, color: "#9CA3AF", align: "left", lineHeight: 1.3 },
    ],
  };

  describe("createSatoriResvgRenderer", () => {
    it("renders a scene to a 1080x1350 png saved under public/media", async () => {
      const renderer = createSatoriResvgRenderer();
      expect(renderer.name).toContain("satori");

      const out = await renderer.generate({
        scene: sampleScene,
        fonts: [
          { name: "Inter", data: loadInter(400), weight: 400, style: "normal" },
          { name: "Inter", data: loadInter(700), weight: 700, style: "normal" },
        ],
      });

      expect(out.localPath).toMatch(/^\/api\/media\/render-\d+\.png$/);
      expect(out.url).toBe(out.localPath);
      expect(out.svg).toContain("<svg");

      const filename = out.localPath!.replace("/api/media/", "");
      const diskPath = join(process.cwd(), "public", "media", filename);
      expect(existsSync(diskPath)).toBe(true);

      const png = readFileSync(diskPath);
      const { width, height } = pngDims(png);
      expect(width).toBe(SCENE_W);
      expect(height).toBe(SCENE_H);
      expect(png.length).toBeGreaterThan(5000);
    });

    it("throws a clear error when no fonts are provided", async () => {
      const renderer = createSatoriResvgRenderer();
      await expect(
        renderer.generate({ scene: sampleScene, fonts: [] })
      ).rejects.toThrow(/at least one font/i);
    });
  });
  ```

- [ ] **Step 2: Run (expected FAIL - module missing).**
  ```bash
  npx vitest run src/lib/compose/render/satoriResvg.test.ts
  ```
  Expected: FAIL (cannot find `@/lib/compose/render/satoriResvg`).

- [ ] **Step 3: Implement the renderer** mirroring `image.ts` save convention (filename `render-<ts>.png`, write to `public/media`, return localPath `/api/media/...`).
  ```ts
  // src/lib/compose/render/satoriResvg.ts
  import { mkdirSync, writeFileSync } from "fs";
  import { join } from "path";
  import satori from "satori";
  import { Resvg } from "@resvg/resvg-js";
  import { sceneToSatori } from "@/lib/compose/satoriTree";
  import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
  import type {
    SceneRenderer,
    SceneRenderInput,
    SceneRenderOutput,
  } from "@/lib/providers/types";

  export function createSatoriResvgRenderer(): SceneRenderer {
    return {
      name: "satori/resvg",

      async generate(input: SceneRenderInput): Promise<SceneRenderOutput> {
        if (!input.fonts || input.fonts.length === 0) {
          throw new Error("createSatoriResvgRenderer requires at least one font");
        }

        const tree = sceneToSatori(input.scene);

        const svg = await satori(tree as Parameters<typeof satori>[0], {
          width: input.scene.w || SCENE_W,
          height: input.scene.h || SCENE_H,
          fonts: input.fonts.map((f) => ({
            name: f.name,
            data: f.data,
            weight: (f.weight ?? 400) as number,
            style: f.style ?? "normal",
          })) as Parameters<typeof satori>[1]["fonts"],
        });

        const resvg = new Resvg(svg, {
          font: { loadSystemFonts: false },
          fitTo: { mode: "width", value: input.scene.w || SCENE_W },
        });
        const png = resvg.render().asPng();

        const mediaDir = join(process.cwd(), "public", "media");
        mkdirSync(mediaDir, { recursive: true });
        const filename = `render-${Date.now()}.png`;
        const localPath = join(mediaDir, filename);
        writeFileSync(localPath, png);

        const apiPath = `/api/media/${filename}`;
        return { url: apiPath, localPath: apiPath, svg };
      },
    };
  }
  ```

- [ ] **Step 4: Run (expected PASS).**
  ```bash
  npx vitest run src/lib/compose/render/satoriResvg.test.ts
  ```
  Expected: PASS (PNG 1080x1350 on disk; empty-fonts case throws).

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/compose/render/satoriResvg.ts src/lib/compose/render/satoriResvg.test.ts
  git commit -m "feat(compose): satori+resvg scene renderer to public/media png"
  ```

### Task F.6: Add createSceneRenderer() factory + index export

**Files:**
- Modify: `src/lib/providers/factory.ts`
- Modify: `src/lib/providers/index.ts`
- Test: `src/lib/providers/factory.sceneRenderer.test.ts`

- [ ] **Step 1: Write the factory test (expected FAIL - `createSceneRenderer` not exported).**
  ```ts
  // src/lib/providers/factory.sceneRenderer.test.ts
  import { describe, it, expect } from "vitest";
  import { createSceneRenderer } from "@/lib/providers/factory";

  describe("createSceneRenderer factory", () => {
    it("defaults to the satori/resvg renderer", () => {
      const r = createSceneRenderer();
      expect(r.name).toBe("satori/resvg");
      expect(typeof r.generate).toBe("function");
    });

    it("resolves 'satori' by explicit name", () => {
      expect(createSceneRenderer("satori").name).toBe("satori/resvg");
    });

    it("throws on unknown renderer name", () => {
      expect(() => createSceneRenderer("nope")).toThrow(/Unknown SCENE_RENDERER/);
    });
  });
  ```

- [ ] **Step 2: Run (expected FAIL).**
  ```bash
  npx vitest run src/lib/providers/factory.sceneRenderer.test.ts
  ```
  Expected: FAIL (no `createSceneRenderer` export).

- [ ] **Step 3: Add the factory to `factory.ts`.** Extend the type import and add a new factory function. Change the first import line to include `SceneRenderer`:
  ```ts
  import type { TextProvider, AudioProvider, VideoProvider, SceneRenderer } from "./types";
  ```
  Add this import:
  ```ts
  import { createSatoriResvgRenderer } from "@/lib/compose/render/satoriResvg";
  ```
  Append:
  ```ts
  export function createSceneRenderer(rendererName?: string): SceneRenderer {
    const renderer = rendererName || process.env.SCENE_RENDERER || "satori";
    switch (renderer) {
      case "satori":
      case "satori/resvg":
        return createSatoriResvgRenderer();
      default:
        throw new Error(`Unknown SCENE_RENDERER: ${renderer}`);
    }
  }
  ```

- [ ] **Step 4: Re-export from `index.ts`.** Update the factory export line:
  ```ts
  export { createTextProvider, createAudioProvider, createVideoProvider, createSceneRenderer } from "./factory";
  ```
  And add the renderer impl export near the other impls:
  ```ts
  export { createSatoriResvgRenderer } from "../compose/render/satoriResvg";
  ```

- [ ] **Step 5: Run (expected PASS).**
  ```bash
  npx vitest run src/lib/providers/factory.sceneRenderer.test.ts
  ```
  Expected: PASS (all three cases).

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/providers/factory.ts src/lib/providers/index.ts src/lib/providers/factory.sceneRenderer.test.ts
  git commit -m "feat(providers): createSceneRenderer factory + exports"
  ```

### Task F.7: Imagery supplier - Pollinations bg fetch + sharp cover-resize 1080x1350 + tint

**Files:**
- Test: `src/lib/providers/imagery.test.ts`
- Create: `src/lib/providers/imagery.ts`
- Modify: `src/lib/providers/index.ts`

- [ ] **Step 1: Write the imagery test (expected FAIL - module missing).** Covers the cover-resize output dims and the treatment branch. The Pollinations fetch is mocked via `global.fetch` so the test is offline and deterministic; we generate a tiny source JPEG with sharp, return it as the fetch body, then assert the supplier produces a 1080x1350 file under `public/media`.
  ```ts
  // src/lib/providers/imagery.test.ts
  import { describe, it, expect, vi, afterEach } from "vitest";
  import { readFileSync, existsSync } from "fs";
  import { join } from "path";
  import sharp from "sharp";
  import { fetchBackgroundImage } from "@/lib/providers/imagery";

  async function makeSourceJpeg(w: number, h: number): Promise<Buffer> {
    return sharp({
      create: { width: w, height: h, channels: 3, background: { r: 30, g: 80, b: 140 } },
    })
      .jpeg()
      .toBuffer();
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchBackgroundImage", () => {
    it("fetches a bg and cover-resizes to 1080x1350", async () => {
      const src = await makeSourceJpeg(1600, 900); // wide source -> must crop to 4:5
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(src, { status: 200 })
      );

      const out = await fetchBackgroundImage("a dim studio backdrop");

      expect(out.localPath).toMatch(/^\/api\/media\/bg-\d+\.jpg$/);
      const diskPath = join(process.cwd(), "public", "media", out.localPath.replace("/api/media/", ""));
      expect(existsSync(diskPath)).toBe(true);

      const meta = await sharp(readFileSync(diskPath)).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
    });

    it("applies a duotone treatment without changing dims", async () => {
      const src = await makeSourceJpeg(1200, 1500);
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(src, { status: 200 })
      );

      const out = await fetchBackgroundImage("city skyline", { treatment: "duotone" });
      const diskPath = join(process.cwd(), "public", "media", out.localPath.replace("/api/media/", ""));
      const meta = await sharp(readFileSync(diskPath)).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
    });

    it("throws on a non-ok fetch", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
      await expect(fetchBackgroundImage("x")).rejects.toThrow(/Pollinations/);
    });
  });
  ```

- [ ] **Step 2: Run (expected FAIL).**
  ```bash
  npx vitest run src/lib/providers/imagery.test.ts
  ```
  Expected: FAIL (cannot find `@/lib/providers/imagery`).

- [ ] **Step 3: Implement the supplier.** Fetches a Pollinations bg at 1080x1350 (mirrors `image.ts` URL + auth), then sharp cover-resizes to exactly 1080x1350 and applies optional warm/duotone tint, saving as `bg-<ts>.jpg` under `public/media`. Returns a `localPath` usable as a `Background` image `src`.
  ```ts
  // src/lib/providers/imagery.ts
  import { mkdirSync, writeFileSync } from "fs";
  import { join } from "path";
  import sharp from "sharp";
  import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

  const BASE_URL = "https://gen.pollinations.ai/image";

  export type ImageryTreatment = "none" | "warm" | "duotone";

  export interface FetchBackgroundOptions {
    treatment?: ImageryTreatment;
    width?: number;
    height?: number;
  }

  export interface BackgroundImageResult {
    url: string;
    localPath: string;
  }

  async function applyTreatment(
    pipeline: sharp.Sharp,
    treatment: ImageryTreatment
  ): Promise<sharp.Sharp> {
    if (treatment === "warm") {
      // Push toward amber: lift reds, trim blues, gentle saturation.
      return pipeline
        .modulate({ saturation: 1.08, brightness: 1.02 })
        .tint({ r: 255, g: 236, b: 210 });
    }
    if (treatment === "duotone") {
      // Desaturate to luminance, then map shadows->ink, highlights->accent.
      return pipeline
        .grayscale()
        .tint({ r: 80, g: 110, b: 170 })
        .modulate({ brightness: 1.04 });
    }
    return pipeline;
  }

  export async function fetchBackgroundImage(
    prompt: string,
    opts: FetchBackgroundOptions = {}
  ): Promise<BackgroundImageResult> {
    const width = opts.width ?? SCENE_W;
    const height = opts.height ?? SCENE_H;
    const treatment = opts.treatment ?? "none";
    const apiKey = process.env.POLLINATIONS_API_KEY;

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      model: "flux",
      nologo: "true",
      enhance: "true",
      seed: String(Math.floor(Math.random() * 1000000)),
    });
    const url = `${BASE_URL}/${encodeURIComponent(prompt)}?${params}`;

    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Pollinations API error: ${response.status}`);
    }

    const srcBuffer = Buffer.from(await response.arrayBuffer());

    let pipeline = sharp(srcBuffer).resize(width, height, {
      fit: "cover",
      position: "attention",
    });
    pipeline = await applyTreatment(pipeline, treatment);
    const outBuffer = await pipeline.jpeg({ quality: 88 }).toBuffer();

    const mediaDir = join(process.cwd(), "public", "media");
    mkdirSync(mediaDir, { recursive: true });
    const filename = `bg-${Date.now()}.jpg`;
    writeFileSync(join(mediaDir, filename), outBuffer);

    const apiPath = `/api/media/${filename}`;
    return { url: apiPath, localPath: apiPath };
  }
  ```

- [ ] **Step 4: Re-export from `index.ts`** (near the image impl export):
  ```ts
  export { fetchBackgroundImage } from "./imagery";
  export type { ImageryTreatment, FetchBackgroundOptions, BackgroundImageResult } from "./imagery";
  ```

- [ ] **Step 5: Run (expected PASS).**
  ```bash
  npx vitest run src/lib/providers/imagery.test.ts
  ```
  Expected: PASS (cover-resize -> 1080x1350 for both wide and tall sources; treatment keeps dims; 500 throws).

- [ ] **Step 6: Commit.**
  ```bash
  git add src/lib/providers/imagery.ts src/lib/providers/index.ts src/lib/providers/imagery.test.ts
  git commit -m "feat(providers): pollinations bg supplier with cover-resize + tint"
  ```

### Task F.8: Cluster F integration check (full suite + typecheck)

**Files:**
- Test: (runs all F tests together)

- [ ] **Step 1: Run all cluster F tests together (expected PASS).**
  ```bash
  npx vitest run src/lib/compose/render src/lib/providers/registry.sceneRenderer.test.ts src/lib/providers/factory.sceneRenderer.test.ts src/lib/providers/imagery.test.ts
  ```
  Expected: PASS (spike + renderer + registry + factory + imagery all green).

- [ ] **Step 2: Typecheck the cluster compiles against the canonical contracts.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS (no type errors in `providers/` or `compose/render/`).

- [ ] **Step 3: Confirm renderer is wireable end-to-end via registry+factory** (smoke, no commit):
  ```bash
  npx tsx -e "import {createSceneRenderer,registerSceneRenderer,getSceneRenderer,hasSceneRenderer} from './src/lib/providers'; const r=createSceneRenderer(); registerSceneRenderer(r); console.log('has',hasSceneRenderer(),'name',getSceneRenderer().name);"
  ```
  Expected output: `has true name satori/resvg`.

- [ ] **Step 4: Commit (only if any lint/format fixes were needed; otherwise skip).**
  ```bash
  git add -A
  git commit -m "test(compose): cluster F integration green" --allow-empty
  ```

**Unresolved questions:**
1. Inter `.ttf` vs `.woff` in `@fontsource/inter` files dir? tests assume `inter-latin-{400,700}-normal.woff` exists; if only `.woff2`, swap to a `@fontsource` pkg that ships `.ttf` (satori rejects woff2).
2. satori/resvg pinned versions OK (`satori@^0.12`, `@resvg/resvg-js@^2.6`)? or must match a version another cluster picks?
3. Does `sceneToSatori` set explicit `width/height/position:absolute` on root + children so resvg `fitTo:{width:1080}` yields exact 1350 height, or should renderer pass explicit `height` to satori (current impl does both)?
4. `fetchBackgroundImage` lives in `imagery.ts` (new file) per scope's "or"; confirm not `images.ts`.

### Task G.1: Archetype contract types + barrel scaffold

**Files:**
- Create: `src/lib/compose/archetypes/types.ts`
- Create: `src/lib/compose/archetypes/index.ts`
- Test: `src/lib/compose/archetypes/__tests__/index.scaffold.test.ts`

- [ ] **Step 1: Write failing scaffold test.** Create `src/lib/compose/archetypes/__tests__/index.scaffold.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ARCHETYPES, ARCHETYPE_IDS } from "@/lib/compose/archetypes";

const EXPECTED: string[] = [
  "editorial", "displayImage", "photoCaption", "iconCard", "quote",
  "stat", "steps", "feature", "announce", "article",
];

describe("ARCHETYPES barrel", () => {
  it("exposes the 10 archetype ids", () => {
    expect([...ARCHETYPE_IDS].sort()).toEqual([...EXPECTED].sort());
  });
  it("registers a builder fn for every id", () => {
    for (const id of ARCHETYPE_IDS) {
      expect(typeof ARCHETYPES[id]).toBe("function");
    }
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...EXPECTED].sort());
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/index.scaffold.test.ts`. Expected FAIL: cannot resolve `@/lib/compose/archetypes` (module missing).

- [ ] **Step 3: Create types re-export.** Create `src/lib/compose/archetypes/types.ts`:
```ts
import type { BrandKit } from "@/lib/brain/brandkit";
import type { Scene } from "@/lib/compose/scene";

export type ArchetypeId =
  | "editorial" | "displayImage" | "photoCaption" | "iconCard" | "quote"
  | "stat" | "steps" | "feature" | "announce" | "article";

export interface Brief {
  archetype: ArchetypeId;
  headline: string;
  subhead?: string;
  body?: string;
  imagery: { kind: "photo" | "gradient" | "solid"; scene?: string };
  accentIndex: number;
  caption: string;
  hashtags: string[];
}

export type ArchetypeBuilder = (kit: BrandKit, brief: Brief) => Scene;

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  "editorial", "displayImage", "photoCaption", "iconCard", "quote",
  "stat", "steps", "feature", "announce", "article",
] as const;
```

- [ ] **Step 4: Create barrel with placeholder registry.** Create `src/lib/compose/archetypes/index.ts`:
```ts
import type { ArchetypeBuilder, ArchetypeId } from "./types";

export type { ArchetypeId, Brief, ArchetypeBuilder } from "./types";
export { ARCHETYPE_IDS } from "./types";

export const ARCHETYPES: Record<ArchetypeId, ArchetypeBuilder> = {} as Record<
  ArchetypeId,
  ArchetypeBuilder
>;
```

- [ ] **Step 5: Run test, expect PARTIAL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/index.scaffold.test.ts`. Expected: first test (ids) PASS, second test (builders) FAIL (registry empty). This is the contract the next tasks fill. Leave RED on builder test until G.13.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/compose/archetypes/types.ts src/lib/compose/archetypes/index.ts src/lib/compose/archetypes/__tests__/index.scaffold.test.ts
git commit -m "feat(archetypes): types + barrel scaffold for builder registry"
```

---

### Task G.2: Shared layout helpers for builders

**Files:**
- Create: `src/lib/compose/archetypes/_shared.ts`
- Test: `src/lib/compose/archetypes/__tests__/_shared.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/_shared.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import {
  pickAccent, marginFor, gapFor, withinBounds, baseBackground,
} from "@/lib/compose/archetypes/_shared";
import type { BrandKit } from "@/lib/brain/brandkit";

const kit: BrandKit = {
  palette: { bg: "#0b0b0b", surface: "#161616", ink: "#ffffff", muted: "#9a9a9a", accents: ["#ff3366", "#33ccff"], onAccent: "#000000" },
  type: {
    display: { family: "Fraunces", class: "display", source: "fontsource", weights: [700] },
    body: { family: "Inter", class: "sans", source: "fontsource", weights: [400, 600] },
  },
  logo: {},
  icons: { style: "line" },
  shape: { radius: 24, density: "balanced" },
  photo: { treatment: "none" },
  mood: ["bold"],
  source: { from: "derived", at: 0 },
};

describe("_shared helpers", () => {
  it("pickAccent wraps the accent index", () => {
    expect(pickAccent(kit, 0)).toBe("#ff3366");
    expect(pickAccent(kit, 1)).toBe("#33ccff");
    expect(pickAccent(kit, 3)).toBe("#33ccff"); // 3 % 2 === 1
  });
  it("marginFor scales with density", () => {
    expect(marginFor("airy")).toBeGreaterThan(marginFor("balanced"));
    expect(marginFor("balanced")).toBeGreaterThan(marginFor("tight"));
  });
  it("gapFor scales with density", () => {
    expect(gapFor("airy")).toBeGreaterThan(gapFor("tight"));
  });
  it("withinBounds detects out-of-canvas elements", () => {
    expect(withinBounds({ x: 0, y: 0, w: SCENE_W, h: SCENE_H })).toBe(true);
    expect(withinBounds({ x: 100, y: 100, w: 200, h: 200 })).toBe(true);
    expect(withinBounds({ x: -1, y: 0, w: 10, h: 10 })).toBe(false);
    expect(withinBounds({ x: 0, y: 0, w: SCENE_W + 1, h: 10 })).toBe(false);
  });
  it("baseBackground returns solid/gradient/image per imagery.kind", () => {
    expect(baseBackground(kit, { kind: "solid" }, "#ff3366").kind).toBe("solid");
    expect(baseBackground(kit, { kind: "gradient" }, "#ff3366").kind).toBe("gradient");
    const img = baseBackground(kit, { kind: "photo", scene: "/x.png" }, "#ff3366");
    expect(img.kind).toBe("image");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/_shared.test.ts`. Expected FAIL: `_shared` module not found.

- [ ] **Step 3: Implement helpers.** Create `src/lib/compose/archetypes/_shared.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Background } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { Brief } from "./types";

export type Density = BrandKit["shape"]["density"];

export function pickAccent(kit: BrandKit, accentIndex: number): string {
  const accents = kit.palette.accents.length ? kit.palette.accents : [kit.palette.ink];
  const i = ((accentIndex % accents.length) + accents.length) % accents.length;
  return accents[i];
}

export function marginFor(density: Density): number {
  switch (density) {
    case "airy": return 120;
    case "tight": return 56;
    default: return 88;
  }
}

export function gapFor(density: Density): number {
  switch (density) {
    case "airy": return 56;
    case "tight": return 20;
    default: return 36;
  }
}

export function withinBounds(box: { x: number; y: number; w: number; h: number }): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.w >= 0 &&
    box.h >= 0 &&
    box.x + box.w <= SCENE_W &&
    box.y + box.h <= SCENE_H
  );
}

export function baseBackground(
  kit: BrandKit,
  imagery: Brief["imagery"],
  accent: string,
): Background {
  if (imagery.kind === "photo") {
    return {
      kind: "image",
      src: imagery.scene ?? "",
      fit: "cover",
      treatment: kit.photo.treatment,
    };
  }
  if (imagery.kind === "gradient") {
    return { kind: "gradient", from: kit.palette.bg, to: accent, angle: 160 };
  }
  return { kind: "solid", color: kit.palette.bg };
}

export const CANVAS = { w: SCENE_W, h: SCENE_H } as const;
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/_shared.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/_shared.ts src/lib/compose/archetypes/__tests__/_shared.test.ts
git commit -m "feat(archetypes): shared layout helpers (accent, density spacing, bounds, bg)"
```

---

### Task G.3: `editorial` builder

**Files:**
- Create: `src/lib/compose/archetypes/editorial.ts`
- Test: `src/lib/compose/archetypes/__tests__/editorial.test.ts`

- [ ] **Step 1: Add test fixtures module.** Create `src/lib/compose/archetypes/__tests__/_fixtures.ts`:
```ts
import type { BrandKit } from "@/lib/brain/brandkit";
import type { Brief, ArchetypeId } from "@/lib/compose/archetypes/types";

export const KIT: BrandKit = {
  palette: { bg: "#0b0b0b", surface: "#161616", ink: "#ffffff", muted: "#9a9a9a", accents: ["#ff3366", "#33ccff"], onAccent: "#000000" },
  type: {
    display: { family: "Fraunces", class: "display", source: "fontsource", weights: [700, 900] },
    body: { family: "Inter", class: "sans", source: "fontsource", weights: [400, 600] },
  },
  logo: { src: "/api/media/logo.png" },
  icons: { style: "line" },
  shape: { radius: 24, density: "balanced" },
  photo: { treatment: "none" },
  mood: ["bold", "modern"],
  source: { from: "derived", at: 0 },
};

export function makeBrief(archetype: ArchetypeId, over: Partial<Brief> = {}): Brief {
  return {
    archetype,
    headline: "Stop guessing what to post",
    subhead: "A system that picks the angle for you",
    body: "Pick a product. Get a week of posts. Edit one tap. Ship.",
    imagery: { kind: "gradient", scene: "abstract waves" },
    accentIndex: 0,
    caption: "caption text",
    hashtags: ["#growth", "#marketing"],
    ...over,
  };
}
```

- [ ] **Step 2: Write failing test.** Create `src/lib/compose/archetypes/__tests__/editorial.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { editorial } from "@/lib/compose/archetypes/editorial";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("editorial archetype", () => {
  const scene = editorial(KIT, makeBrief("editorial"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("contains the required slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("subhead");
    expect(slots).toContain("body");
  });
  it("keeps every element within canvas bounds", () => {
    for (const el of scene.elements) {
      expect(withinBounds(el)).toBe(true);
    }
  });
  it("renders headline text from the brief", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "content" in head ? head.content : "").toContain("Stop guessing");
  });
  it("uses the display font family for the headline", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "fontFamily" in head ? head.fontFamily : "").toBe(KIT.type.display.family);
  });
  it("uses accent[0] when accentIndex is 0", () => {
    const colors = scene.elements.flatMap((e) =>
      "color" in e ? [e.color] : "fill" in e && e.fill ? [e.fill] : [],
    );
    expect(colors).toContain("#ff3366");
  });
});
```

- [ ] **Step 3: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/editorial.test.ts`. Expected FAIL: `editorial` module not found.

- [ ] **Step 4: Implement editorial.** Create `src/lib/compose/archetypes/editorial.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const editorial: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m + 40;

  // accent rule above the headline (editorial signature)
  elements.push({
    id: "rule", type: "shape", shape: "line", x: m, y, w: 140, h: 6,
    rotation: 0, z: z++, fill: accent, radius: 3,
  });
  y += 6 + gap;

  const headSize = 86;
  const headLines = Math.max(1, Math.ceil(brief.headline.length / 18));
  const headH = Math.round(headSize * 1.05 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.05,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 38;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: accent, align: "left", lineHeight: 1.2,
    });
    y += subH + gap;
  }

  if (brief.body) {
    const bodySize = 30;
    const bodyH = SCENE_H - m - y;
    elements.push({
      id: "body", type: "text", slot: "body", x: m, y, w: colW, h: Math.max(bodySize, bodyH),
      rotation: 0, z: z++, content: brief.body,
      fontFamily: kit.type.body.family, fontWeight: 400,
      size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.45,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 5: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/editorial.test.ts`. Expected PASS (6 tests).

- [ ] **Step 6: Commit.**
```bash
git add src/lib/compose/archetypes/editorial.ts src/lib/compose/archetypes/__tests__/editorial.test.ts src/lib/compose/archetypes/__tests__/_fixtures.ts
git commit -m "feat(archetypes): editorial builder (rule + headline/subhead/body column)"
```

---

### Task G.4: `displayImage` builder

**Files:**
- Create: `src/lib/compose/archetypes/displayImage.ts`
- Test: `src/lib/compose/archetypes/__tests__/displayImage.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/displayImage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { displayImage } from "@/lib/compose/archetypes/displayImage";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("displayImage archetype", () => {
  const scene = displayImage(KIT, makeBrief("displayImage", { imagery: { kind: "photo", scene: "/api/media/p.png" } }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a full-bleed background image when imagery is photo", () => {
    expect(scene.background.kind).toBe("image");
  });
  it("overlays headline + bg scrim slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("bg");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
  it("headline uses ink color over the scrim", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "color" in head ? head.color : "").toBe(KIT.palette.ink);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/displayImage.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement displayImage.** Create `src/lib/compose/archetypes/displayImage.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const displayImage: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const scrimH = Math.round(SCENE_H * 0.5);
  const scrimY = SCENE_H - scrimH;
  // bottom scrim for legibility over the photo
  elements.push({
    id: "scrim", type: "shape", slot: "bg", shape: "rect", x: 0, y: scrimY,
    w: SCENE_W, h: scrimH, rotation: 0, z: z++, fill: kit.palette.bg, radius: 0,
  });

  const headSize = 92;
  const headLines = Math.max(1, Math.ceil(brief.headline.length / 16));
  const headH = Math.round(headSize * 1.04 * headLines);
  const colW = SCENE_W - m * 2;
  let headY = SCENE_H - m - headH;
  if (brief.subhead) headY -= 38 + gap;

  // accent pill marker
  elements.push({
    id: "marker", type: "pill", slot: "pill", x: m, y: headY - 56 - gap,
    w: 220, h: 56, rotation: 0, z: z + 1,
    text: brief.subhead ? "Featured" : "New",
    bg: accent, color: kit.palette.onAccent, fontFamily: kit.type.body.family, size: 26,
  });

  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y: headY, w: colW, h: headH,
    rotation: 0, z: z + 2, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.04,
  });

  if (brief.subhead) {
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y: headY + headH + gap,
      w: colW, h: 38 * 2, rotation: 0, z: z + 2, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600, size: 34,
      color: kit.palette.muted, align: "left", lineHeight: 1.2,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/displayImage.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/displayImage.ts src/lib/compose/archetypes/__tests__/displayImage.test.ts
git commit -m "feat(archetypes): displayImage builder (full-bleed photo + scrim overlay)"
```

---

### Task G.5: `photoCaption` builder

**Files:**
- Create: `src/lib/compose/archetypes/photoCaption.ts`
- Test: `src/lib/compose/archetypes/__tests__/photoCaption.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/photoCaption.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { photoCaption } from "@/lib/compose/archetypes/photoCaption";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("photoCaption archetype", () => {
  const scene = photoCaption(KIT, makeBrief("photoCaption", { imagery: { kind: "photo", scene: "/api/media/p.png" } }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has an image element occupying the top region", () => {
    const img = scene.elements.find((e) => e.type === "image");
    expect(img).toBeTruthy();
    expect(img!.y).toBe(0);
    expect(img!.h).toBeLessThan(SCENE_H);
  });
  it("places headline + body in the caption strip", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/photoCaption.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement photoCaption.** Create `src/lib/compose/archetypes/photoCaption.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor } from "./_shared";

export const photoCaption: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const imgH = Math.round(SCENE_H * 0.62);
  elements.push({
    id: "photo", type: "image", slot: "bg", x: 0, y: 0, w: SCENE_W, h: imgH,
    rotation: 0, z: z++, src: brief.imagery.scene ?? "", fit: "cover", radius: 0,
  });

  // caption strip background (surface)
  const stripY = imgH;
  const stripH = SCENE_H - imgH;
  elements.push({
    id: "strip", type: "shape", shape: "rect", x: 0, y: stripY, w: SCENE_W, h: stripH,
    rotation: 0, z: z++, fill: kit.palette.surface, radius: 0,
  });

  // accent tab on the strip
  elements.push({
    id: "tab", type: "shape", shape: "rect", x: m, y: stripY + gap, w: 64, h: 8,
    rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 4,
  });

  const colW = SCENE_W - m * 2;
  const headSize = 52;
  const headH = headSize * 2;
  const headY = stripY + gap + 8 + gap;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y: headY, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });

  const bodySize = 28;
  const bodyY = headY + headH + gap;
  const bodyH = SCENE_H - m - bodyY;
  elements.push({
    id: "body", type: "text", slot: "body", x: m, y: bodyY, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.4,
  });

  return {
    w: SCENE_W, h: SCENE_H,
    background: { kind: "solid", color: kit.palette.bg },
    elements,
  };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/photoCaption.test.ts`. Expected PASS (4 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/photoCaption.ts src/lib/compose/archetypes/__tests__/photoCaption.test.ts
git commit -m "feat(archetypes): photoCaption builder (top photo + bottom caption strip)"
```

---

### Task G.6: `iconCard` builder

**Files:**
- Create: `src/lib/compose/archetypes/iconCard.ts`
- Test: `src/lib/compose/archetypes/__tests__/iconCard.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/iconCard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { iconCard } from "@/lib/compose/archetypes/iconCard";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("iconCard archetype", () => {
  const scene = iconCard(KIT, makeBrief("iconCard"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has an icon element with the kit icon style", () => {
    const icon = scene.elements.find((e) => e.type === "icon");
    expect(icon).toBeTruthy();
    expect(icon && "iconStyle" in icon ? icon.iconStyle : "").toBe("line");
  });
  it("contains icon + headline + body slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("icon");
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/iconCard.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement iconCard.** Create `src/lib/compose/archetypes/iconCard.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const iconCard: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const cardX = m;
  const cardY = m;
  const cardW = SCENE_W - m * 2;
  const cardH = SCENE_H - m * 2;
  elements.push({
    id: "card", type: "shape", shape: "rect", x: cardX, y: cardY, w: cardW, h: cardH,
    rotation: 0, z: z++, fill: kit.palette.surface, radius: kit.shape.radius,
  });

  const innerPad = gap * 2;
  const iconSize = 120;
  const ix = cardX + innerPad;
  let iy = cardY + innerPad;
  // accent tile behind icon
  elements.push({
    id: "iconTile", type: "shape", shape: "rect", x: ix, y: iy, w: iconSize, h: iconSize,
    rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 2,
  });
  elements.push({
    id: "icon", type: "icon", slot: "icon", x: ix + 24, y: iy + 24, w: iconSize - 48, h: iconSize - 48,
    rotation: 0, z: z++, name: "sparkles", stroke: kit.palette.onAccent, strokeWidth: 2,
    iconStyle: kit.icons.style === "solid" ? "solid" : "line",
  });
  iy += iconSize + gap * 1.5;

  const colW = cardW - innerPad * 2;
  const headSize = 60;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: ix, y: iy, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });
  iy += headH + gap;

  const bodySize = 30;
  const bodyH = cardY + cardH - innerPad - iy;
  elements.push({
    id: "body", type: "text", slot: "body", x: ix, y: iy, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.45,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/iconCard.test.ts`. Expected PASS (4 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/iconCard.ts src/lib/compose/archetypes/__tests__/iconCard.test.ts
git commit -m "feat(archetypes): iconCard builder (surface card + accent icon tile)"
```

---

### Task G.7: `quote` builder

**Files:**
- Create: `src/lib/compose/archetypes/quote.ts`
- Test: `src/lib/compose/archetypes/__tests__/quote.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/quote.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { quote } from "@/lib/compose/archetypes/quote";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("quote archetype", () => {
  const scene = quote(KIT, makeBrief("quote"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a quote slot holding the headline copy", () => {
    const q = scene.elements.find((e) => e.slot === "quote");
    expect(q).toBeTruthy();
    expect(q && "content" in q ? q.content : "").toContain("Stop guessing");
  });
  it("has an attribution subhead slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("subhead");
  });
  it("renders the big quotation mark in the accent color", () => {
    const mark = scene.elements.find((e) => e.id === "quoteMark");
    expect(mark && "color" in mark ? mark.color : "").toBe("#ff3366");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/quote.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement quote.** Create `src/lib/compose/archetypes/quote.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const quote: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  const markSize = 200;
  const markY = m + 20;
  elements.push({
    id: "quoteMark", type: "text", x: m, y: markY, w: 200, h: markSize,
    rotation: 0, z: z++, content: "\u201C",
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: markSize, color: accent, align: "left", lineHeight: 1,
  });

  const quoteSize = 64;
  const quoteLines = Math.max(2, Math.ceil(brief.headline.length / 22));
  const quoteH = Math.round(quoteSize * 1.2 * quoteLines);
  const quoteY = markY + markSize - gap;
  elements.push({
    id: "quote", type: "text", slot: "quote", x: m, y: quoteY, w: colW, h: quoteH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights[0] ?? 700,
    size: quoteSize, color: kit.palette.ink, align: "left", lineHeight: 1.2,
  });

  const attrY = quoteY + quoteH + gap;
  elements.push({
    id: "attrRule", type: "shape", shape: "line", x: m, y: attrY + 18, w: 60, h: 4,
    rotation: 0, z: z++, fill: accent, radius: 2,
  });
  elements.push({
    id: "subhead", type: "text", slot: "subhead", x: m + 60 + gap / 2, y: attrY, w: colW - 60 - gap / 2, h: 40,
    rotation: 0, z: z++, content: brief.subhead ?? brief.caption,
    fontFamily: kit.type.body.family, fontWeight: 600,
    size: 30, color: kit.palette.muted, align: "left", lineHeight: 1.2,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/quote.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/quote.ts src/lib/compose/archetypes/__tests__/quote.test.ts
git commit -m "feat(archetypes): quote builder (oversized mark + pull quote + attribution)"
```

---

### Task G.8: `stat` builder

**Files:**
- Create: `src/lib/compose/archetypes/stat.ts`
- Test: `src/lib/compose/archetypes/__tests__/stat.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/stat.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stat } from "@/lib/compose/archetypes/stat";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("stat archetype", () => {
  const scene = stat(KIT, makeBrief("stat", { headline: "92%" }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("uses a statBlock element carrying value + label", () => {
    const sb = scene.elements.find((e) => e.type === "statBlock");
    expect(sb).toBeTruthy();
    expect(sb && "value" in sb ? sb.value : "").toBe("92%");
  });
  it("exposes a stat slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("stat");
  });
  it("colors the stat value with the accent", () => {
    const sb = scene.elements.find((e) => e.type === "statBlock");
    expect(sb && "valueColor" in sb ? sb.valueColor : "").toBe("#ff3366");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/stat.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement stat.** Create `src/lib/compose/archetypes/stat.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const stat: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  const blockH = 460;
  const blockY = Math.round((SCENE_H - blockH) / 2);
  elements.push({
    id: "stat", type: "statBlock", slot: "stat", x: m, y: blockY, w: colW, h: blockH,
    rotation: 0, z: z++,
    value: brief.headline,
    label: brief.subhead ?? brief.body ?? "",
    valueColor: accent, labelColor: kit.palette.ink,
    fontFamily: kit.type.display.family, valueSize: 240, labelSize: 40,
  });

  // supporting body below the stat block
  if (brief.body && brief.subhead) {
    const bodyY = blockY + blockH + gap;
    elements.push({
      id: "body", type: "text", slot: "body", x: m, y: bodyY, w: colW,
      h: Math.max(30, SCENE_H - m - bodyY), rotation: 0, z: z++, content: brief.body,
      fontFamily: kit.type.body.family, fontWeight: 400,
      size: 28, color: kit.palette.muted, align: "center", lineHeight: 1.4,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/stat.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/stat.ts src/lib/compose/archetypes/__tests__/stat.test.ts
git commit -m "feat(archetypes): stat builder (centered statBlock + supporting body)"
```

---

### Task G.9: `steps` builder

**Files:**
- Create: `src/lib/compose/archetypes/steps.ts`
- Test: `src/lib/compose/archetypes/__tests__/steps.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/steps.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { steps } from "@/lib/compose/archetypes/steps";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("steps archetype", () => {
  const scene = steps(KIT, makeBrief("steps", { body: "Pick a product.\nGet a week of posts.\nShip it." }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a headline slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
  });
  it("renders one numbered row per body line (3 here)", () => {
    const numbers = scene.elements.filter((e) => e.id.startsWith("stepNum"));
    expect(numbers).toHaveLength(3);
    const rows = scene.elements.filter((e) => e.id.startsWith("stepText"));
    expect(rows).toHaveLength(3);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/steps.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement steps.** Create `src/lib/compose/archetypes/steps.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const steps: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  const headSize = 60;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });
  y += headH + gap * 1.5;

  const lines = (brief.body ?? brief.subhead ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  const badge = 72;
  const rowH = 120;
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + i * (rowH + gap);
    elements.push({
      id: `stepBadge${i}`, type: "shape", shape: "rect", x: m, y: rowY, w: badge, h: badge,
      rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 2,
    });
    elements.push({
      id: `stepNum${i}`, type: "text", x: m, y: rowY + 12, w: badge, h: badge - 12,
      rotation: 0, z: z++, content: String(i + 1),
      fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
      size: 44, color: kit.palette.onAccent, align: "center", lineHeight: 1,
    });
    elements.push({
      id: `stepText${i}`, type: "text", x: m + badge + gap, y: rowY + 8, w: colW - badge - gap, h: rowH - 8,
      rotation: 0, z: z++, content: lines[i],
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: 34, color: kit.palette.ink, align: "left", lineHeight: 1.25,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/steps.test.ts`. Expected PASS (4 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/steps.ts src/lib/compose/archetypes/__tests__/steps.test.ts
git commit -m "feat(archetypes): steps builder (numbered accent badges per body line)"
```

---

### Task G.10: `feature` builder

**Files:**
- Create: `src/lib/compose/archetypes/feature.ts`
- Test: `src/lib/compose/archetypes/__tests__/feature.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/feature.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { feature } from "@/lib/compose/archetypes/feature";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("feature archetype", () => {
  const scene = feature(KIT, makeBrief("feature", { body: "Auto angle\nOne-tap edit\nScheduled ship" }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has headline + subhead slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("subhead");
  });
  it("renders an icon per feature line plus a label per line", () => {
    const icons = scene.elements.filter((e) => e.type === "icon");
    const labels = scene.elements.filter((e) => e.id.startsWith("featLabel"));
    expect(icons.length).toBe(3);
    expect(labels.length).toBe(3);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/feature.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement feature.** Create `src/lib/compose/archetypes/feature.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const feature: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const iconStyle = kit.icons.style === "solid" ? "solid" : "line";
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  const headSize = 66;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.08,
  });
  y += headH + gap;

  const subSize = 34;
  const subH = subSize * 2;
  elements.push({
    id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
    rotation: 0, z: z++, content: brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: subSize, color: kit.palette.muted, align: "left", lineHeight: 1.3,
  });
  y += subH + gap * 1.5;

  const lines = (brief.body ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  const iconBox = 64;
  const rowH = 100;
  const names = ["zap", "edit", "calendar", "check"];
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + i * (rowH + gap);
    elements.push({
      id: `featIcon${i}`, type: "icon", slot: i === 0 ? "icon" : undefined,
      x: m, y: rowY, w: iconBox, h: iconBox, rotation: 0, z: z++,
      name: names[i % names.length], stroke: accent, strokeWidth: 2.5, iconStyle,
    });
    elements.push({
      id: `featLabel${i}`, type: "text", x: m + iconBox + gap, y: rowY + 8,
      w: colW - iconBox - gap, h: rowH - 8, rotation: 0, z: z++, content: lines[i],
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: 34, color: kit.palette.ink, align: "left", lineHeight: 1.25,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/feature.test.ts`. Expected PASS (4 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/feature.ts src/lib/compose/archetypes/__tests__/feature.test.ts
git commit -m "feat(archetypes): feature builder (headline/subhead + icon feature rows)"
```

---

### Task G.11: `announce` builder

**Files:**
- Create: `src/lib/compose/archetypes/announce.ts`
- Test: `src/lib/compose/archetypes/__tests__/announce.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/announce.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { announce } from "@/lib/compose/archetypes/announce";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("announce archetype", () => {
  const scene = announce(KIT, makeBrief("announce"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("uses the accent as the scene background fill", () => {
    expect(scene.background.kind).toBe("solid");
    expect(scene.background.kind === "solid" ? scene.background.color : "").toBe("#ff3366");
  });
  it("has a pill + headline + button (cta) slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("pill");
    expect(slots).toContain("headline");
    expect(slots).toContain("cta");
  });
  it("headline uses the onAccent color for contrast", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "color" in head ? head.color : "").toBe(KIT.palette.onAccent);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/announce.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement announce.** Create `src/lib/compose/archetypes/announce.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor } from "./_shared";

export const announce: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  // eyebrow pill
  const pillH = 60;
  let y = m + 40;
  elements.push({
    id: "pill", type: "pill", slot: "pill", x: m, y, w: 260, h: pillH,
    rotation: 0, z: z++, text: "Announcement",
    bg: kit.palette.onAccent, color: accent, fontFamily: kit.type.body.family, size: 26,
  });
  y += pillH + gap * 1.5;

  const headSize = 104;
  const headLines = Math.max(2, Math.ceil(brief.headline.length / 14));
  const headH = Math.round(headSize * 1.02 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.onAccent, align: "left", lineHeight: 1.02,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 38;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: kit.palette.onAccent, align: "left", lineHeight: 1.25,
    });
  }

  // CTA button anchored near the bottom
  const btnH = 92;
  const btnW = Math.min(colW, 480);
  const btnY = SCENE_H - m - btnH;
  elements.push({
    id: "cta", type: "button", slot: "cta", x: m, y: btnY, w: btnW, h: btnH,
    rotation: 0, z: z++, label: "Learn more",
    bg: kit.palette.onAccent, color: accent, fontFamily: kit.type.body.family,
    size: 36, radius: kit.shape.radius,
  });

  return {
    w: SCENE_W, h: SCENE_H,
    background: { kind: "solid", color: accent },
    elements,
  };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/announce.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/announce.ts src/lib/compose/archetypes/__tests__/announce.test.ts
git commit -m "feat(archetypes): announce builder (accent bg + pill + headline + cta)"
```

---

### Task G.12: `article` builder

**Files:**
- Create: `src/lib/compose/archetypes/article.ts`
- Test: `src/lib/compose/archetypes/__tests__/article.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/article.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { article } from "@/lib/compose/archetypes/article";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("article archetype", () => {
  const scene = article(KIT, makeBrief("article"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a kicker pill, headline, and body slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("pill");
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("renders a logo element when the kit provides a logo src", () => {
    const logo = scene.elements.find((e) => e.type === "logo");
    expect(logo).toBeTruthy();
    expect(logo && "src" in logo ? logo.src : "").toBe(KIT.logo.src);
  });
  it("omits the logo when the kit has no logo src", () => {
    const noLogoKit = { ...KIT, logo: {} };
    const s2 = article(noLogoKit, makeBrief("article"));
    expect(s2.elements.some((e) => e.type === "logo")).toBe(false);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/article.test.ts`. Expected FAIL: module not found.

- [ ] **Step 3: Implement article.** Create `src/lib/compose/archetypes/article.ts`:
```ts
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const article: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  // optional logo top-left
  if (kit.logo.src) {
    const logoH = 64;
    elements.push({
      id: "logo", type: "logo", slot: "logo", x: m, y, w: 180, h: logoH,
      rotation: 0, z: z++, src: kit.logo.src,
    });
    y += logoH + gap;
  }

  // kicker pill
  const pillH = 52;
  elements.push({
    id: "kicker", type: "pill", slot: "pill", x: m, y, w: 220, h: pillH,
    rotation: 0, z: z++, text: "Read",
    bg: accent, color: kit.palette.onAccent, fontFamily: kit.type.body.family, size: 24,
  });
  y += pillH + gap;

  const headSize = 72;
  const headLines = Math.max(2, Math.ceil(brief.headline.length / 18));
  const headH = Math.round(headSize * 1.08 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.08,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 36;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: accent, align: "left", lineHeight: 1.25,
    });
    y += subH + gap;
  }

  // divider rule then body paragraph
  elements.push({
    id: "divider", type: "shape", shape: "line", x: m, y, w: colW, h: 2,
    rotation: 0, z: z++, fill: kit.palette.muted, radius: 1,
  });
  y += 2 + gap;

  const bodySize = 30;
  const bodyH = SCENE_H - m - y;
  elements.push({
    id: "body", type: "text", slot: "body", x: m, y, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.ink, align: "left", lineHeight: 1.5,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/article.test.ts`. Expected PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/compose/archetypes/article.ts src/lib/compose/archetypes/__tests__/article.test.ts
git commit -m "feat(archetypes): article builder (logo + kicker + headline + body column)"
```

---

### Task G.13: Wire all 10 builders into the ARCHETYPES registry

**Files:**
- Modify: `src/lib/compose/archetypes/index.ts`
- Test: `src/lib/compose/archetypes/__tests__/index.scaffold.test.ts` (re-run, now green)

- [ ] **Step 1: Populate the registry.** Replace the placeholder body in `src/lib/compose/archetypes/index.ts`:
```ts
import type { ArchetypeBuilder, ArchetypeId } from "./types";
import { editorial } from "./editorial";
import { displayImage } from "./displayImage";
import { photoCaption } from "./photoCaption";
import { iconCard } from "./iconCard";
import { quote } from "./quote";
import { stat } from "./stat";
import { steps } from "./steps";
import { feature } from "./feature";
import { announce } from "./announce";
import { article } from "./article";

export type { ArchetypeId, Brief, ArchetypeBuilder } from "./types";
export { ARCHETYPE_IDS } from "./types";

export const ARCHETYPES: Record<ArchetypeId, ArchetypeBuilder> = {
  editorial,
  displayImage,
  photoCaption,
  iconCard,
  quote,
  stat,
  steps,
  feature,
  announce,
  article,
};
```

- [ ] **Step 2: Run scaffold test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/index.scaffold.test.ts`. Expected: both tests PASS (registry now has all 10 builders).

- [ ] **Step 3: Commit.**
```bash
git add src/lib/compose/archetypes/index.ts
git commit -m "feat(archetypes): register all 10 builders in ARCHETYPES record"
```

---

### Task G.14: `selectArchetype(hookType, usage)` rule-map + least-used tiebreak

**Files:**
- Create: `src/lib/compose/archetypes/select.ts`
- Modify: `src/lib/compose/archetypes/index.ts` (re-export `selectArchetype`)
- Test: `src/lib/compose/archetypes/__tests__/select.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/compose/archetypes/__tests__/select.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectArchetype } from "@/lib/compose/archetypes/select";
import { ARCHETYPE_IDS } from "@/lib/compose/archetypes/types";
import type { HookType } from "@/lib/brain/types";

const zero: Record<string, number> = {};

describe("selectArchetype rule-map", () => {
  it("pain -> editorial when usage is equal", () => {
    expect(selectArchetype("pain", zero)).toBe("editorial");
  });
  it("curiosity -> editorial when usage is equal", () => {
    expect(selectArchetype("curiosity", zero)).toBe("editorial");
  });
  it("desire -> displayImage when usage is equal", () => {
    expect(selectArchetype("desire", zero)).toBe("displayImage");
  });
  it("contrarian -> displayImage when usage is equal", () => {
    expect(selectArchetype("contrarian", zero)).toBe("displayImage");
  });
  it("social-proof -> quote or stat when usage is equal", () => {
    const pick = selectArchetype("social-proof", zero);
    expect(["quote", "stat"]).toContain(pick);
  });
  it("returns a valid archetype id for every hook type", () => {
    const hooks: HookType[] = ["curiosity", "pain", "desire", "social-proof", "contrarian"];
    for (const h of hooks) {
      expect(ARCHETYPE_IDS).toContain(selectArchetype(h, zero));
    }
  });
});

describe("selectArchetype least-used tiebreak", () => {
  it("avoids the rule-map pick when it is already saturated", () => {
    // pain rule-map pick is editorial; saturate editorial, leave others at 0
    const usage = { editorial: 9 };
    const pick = selectArchetype("pain", usage);
    expect(pick).not.toBe("editorial");
    expect(ARCHETYPE_IDS).toContain(pick);
  });
  it("for social-proof picks the less-used of its preferred pair", () => {
    expect(selectArchetype("social-proof", { quote: 5, stat: 0 })).toBe("stat");
    expect(selectArchetype("social-proof", { quote: 0, stat: 5 })).toBe("quote");
  });
  it("reaches non-rule-map archetypes (steps/feature/announce/iconCard/photoCaption/article) via least-used", () => {
    // saturate every rule-map preferred id; least-used among remainder must surface
    const usage = { editorial: 9, displayImage: 9, quote: 9, stat: 9 };
    const pick = selectArchetype("curiosity", usage);
    expect(["steps", "feature", "announce", "iconCard", "photoCaption", "article"]).toContain(pick);
  });
  it("keeps preferred pick when it is the least used", () => {
    const usage = { editorial: 0, displayImage: 4, quote: 4, stat: 4, steps: 4, feature: 4, announce: 4, iconCard: 4, photoCaption: 4, article: 4 };
    expect(selectArchetype("pain", usage)).toBe("editorial");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/archetypes/__tests__/select.test.ts`. Expected FAIL: `select` module not found.

- [ ] **Step 3: Implement selectArchetype.** Create `src/lib/compose/archetypes/select.ts`:
```ts
import type { HookType } from "@/lib/brain/types";
import { suggestLeastUsed } from "@/lib/brain/rotation";
import { ARCHETYPE_IDS, type ArchetypeId } from "./types";

// Preferred candidates per hook type. First entry is the default when usage is flat.
const RULE_MAP: Record<HookType, ArchetypeId[]> = {
  pain: ["editorial"],
  curiosity: ["editorial"],
  desire: ["displayImage"],
  contrarian: ["displayImage"],
  "social-proof": ["quote", "stat"],
};

// Threshold above which a preferred pick is considered saturated and we fall
// back to the global least-used archetype to keep the rotation fresh.
const SATURATION = 3;

export function selectArchetype(
  hookType: HookType,
  usage: Record<string, number>,
): ArchetypeId {
  const preferred = RULE_MAP[hookType] ?? ["editorial"];

  // Among the preferred candidates, take the least used (stable: ties -> first listed).
  const preferredPick = suggestLeastUsed(preferred, usage) ?? preferred[0];

  // If the chosen preferred archetype is saturated, rotate to the globally
  // least-used archetype across all 10 ids. suggestLeastUsed keeps the first
  // listed id on ties, so ARCHETYPE_IDS order is the tiebreak.
  if ((usage[preferredPick] ?? 0) > SATURATION) {
    const global = suggestLeastUsed([...ARCHETYPE_IDS], usage);
    if (global) return global;
  }

  return preferredPick;
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/select.test.ts`. Expected PASS (10 tests). Note: the "keeps preferred pick when it is the least used" case holds because editorial usage 0 is below SATURATION so the rule-map pick stands.

- [ ] **Step 5: Re-export from barrel.** Add to `src/lib/compose/archetypes/index.ts` (after the `ARCHETYPES` export):
```ts
export { selectArchetype } from "./select";
```

- [ ] **Step 6: Commit.**
```bash
git add src/lib/compose/archetypes/select.ts src/lib/compose/archetypes/index.ts src/lib/compose/archetypes/__tests__/select.test.ts
git commit -m "feat(archetypes): selectArchetype rule-map + least-used rotation tiebreak"
```

---

### Task G.15: Cross-builder snapshot of element counts + slots (all 10)

**Files:**
- Create: `src/lib/compose/archetypes/__tests__/all.snapshot.test.ts`

- [ ] **Step 1: Write the snapshot/contract test.** Create `src/lib/compose/archetypes/__tests__/all.snapshot.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ARCHETYPES, ARCHETYPE_IDS } from "@/lib/compose/archetypes";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("all archetypes - structural contract", () => {
  for (const id of ARCHETYPE_IDS) {
    it(`${id}: builds a valid 1080x1350 scene with in-bounds elements`, () => {
      const scene = ARCHETYPES[id](KIT, makeBrief(id));
      expect(scene.w).toBe(SCENE_W);
      expect(scene.h).toBe(SCENE_H);
      expect(scene.elements.length).toBeGreaterThan(0);
      for (const el of scene.elements) {
        expect(withinBounds(el)).toBe(true);
        expect(typeof el.id).toBe("string");
        expect(el.id.length).toBeGreaterThan(0);
      }
      // element ids are unique within a scene
      const ids = scene.elements.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it("snapshots the {count, slots} signature for all 10 archetypes", () => {
    const signature: Record<string, { count: number; slots: string[] }> = {};
    for (const id of ARCHETYPE_IDS) {
      const scene = ARCHETYPES[id](KIT, makeBrief(id));
      const slots = scene.elements
        .map((e) => e.slot)
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort();
      signature[id] = { count: scene.elements.length, slots };
    }
    expect(signature).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run to create the snapshot, expect PASS.** Run `npx vitest run src/lib/compose/archetypes/__tests__/all.snapshot.test.ts`. Expected PASS: 10 per-archetype tests pass; the snapshot test writes `__snapshots__/all.snapshot.test.ts.snap` on first run and passes.

- [ ] **Step 3: Sanity-run the whole archetypes suite.** Run `npx vitest run src/lib/compose/archetypes`. Expected: all archetype tests (scaffold, shared, 10 builders, select, snapshot) PASS.

- [ ] **Step 4: Commit (include generated snapshot).**
```bash
git add src/lib/compose/archetypes/__tests__/all.snapshot.test.ts src/lib/compose/archetypes/__tests__/__snapshots__/all.snapshot.test.ts.snap
git commit -m "test(archetypes): cross-builder structural + slot-signature snapshot"
```

### Task H.1: zod briefSchema matching Brief contract

**Files:**
- Create: `src/lib/brain/briefSchema.ts`
- Test: `src/lib/brain/briefSchema.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/brain/briefSchema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { briefSchema } from "./briefSchema";
import type { Brief } from "@/lib/compose/archetypes";

const valid: Brief = {
  archetype: "editorial",
  headline: "Stop guessing your numbers",
  subhead: "See cash flow in one screen",
  body: "Connect once, get a daily snapshot.",
  imagery: { kind: "photo", scene: "sunlit desk with a ceramic mug" },
  accentIndex: 0,
  caption: "the full caption text",
  hashtags: ["founders", "saas"],
};

describe("briefSchema", () => {
  it("parses a valid brief", () => {
    const parsed = briefSchema.parse(valid);
    expect(parsed.archetype).toBe("editorial");
    expect(parsed.imagery.kind).toBe("photo");
    expect(parsed.hashtags).toEqual(["founders", "saas"]);
  });

  it("parses a minimal brief without optional fields", () => {
    const minimal = {
      archetype: "stat",
      headline: "92% faster",
      imagery: { kind: "solid" },
      accentIndex: 2,
      caption: "cap",
      hashtags: [],
    };
    const parsed = briefSchema.parse(minimal);
    expect(parsed.subhead).toBeUndefined();
    expect(parsed.body).toBeUndefined();
  });

  it("rejects an unknown archetype", () => {
    expect(() => briefSchema.parse({ ...valid, archetype: "bogus" })).toThrow();
  });

  it("rejects an unknown imagery kind", () => {
    expect(() => briefSchema.parse({ ...valid, imagery: { kind: "video" } })).toThrow();
  });

  it("rejects a missing headline", () => {
    const { headline, ...rest } = valid;
    void headline;
    expect(() => briefSchema.parse(rest)).toThrow();
  });

  it("rejects a non-string hashtag", () => {
    expect(() => briefSchema.parse({ ...valid, hashtags: [1, 2] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (module not found):
```
npx vitest run src/lib/brain/briefSchema.test.ts
```

- [ ] **Step 3: Implement `src/lib/brain/briefSchema.ts`.** Write the zod schema typed as `ZodType<Brief>` so it matches the canonical `Brief` exactly:
```ts
import { z } from "zod";
import type { Brief } from "@/lib/compose/archetypes";

const archetypeIdSchema = z.enum([
  "editorial",
  "displayImage",
  "photoCaption",
  "iconCard",
  "quote",
  "stat",
  "steps",
  "feature",
  "announce",
  "article",
]);

const imagerySchema = z.object({
  kind: z.enum(["photo", "gradient", "solid"]),
  scene: z.string().optional(),
});

export const briefSchema: z.ZodType<Brief> = z.object({
  archetype: archetypeIdSchema,
  headline: z.string().min(1),
  subhead: z.string().optional(),
  body: z.string().optional(),
  imagery: imagerySchema,
  accentIndex: z.number().int().min(0),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
```

- [ ] **Step 4: Run test, expect PASS:**
```
npx vitest run src/lib/brain/briefSchema.test.ts
```

- [ ] **Step 5: Commit:**
```
git add src/lib/brain/briefSchema.ts src/lib/brain/briefSchema.test.ts
git commit -m "feat(brain): add zod briefSchema matching Brief contract"
```

### Task H.2: Extend buildContentGenerationPrompt to emit Brief fields

**Files:**
- Modify: `src/lib/brain/prompts.ts`
- Test: `src/lib/brain/prompts.brief.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/brain/prompts.brief.test.ts` asserting the new JSON shape is documented in the prompt and the legacy `imagePrompt` block is gone:
```ts
import { describe, it, expect } from "vitest";
import { buildContentGenerationPrompt } from "./prompts";

const rawProfile = {
  name: "Acme",
  tagline: "ship faster",
  coreValue: "automate the boring parts",
  visualIdentity: { style: "minimal", colors: "navy and amber", mood: "calm" },
};
const rawStrategy = {
  hooks: [{ text: "you wasted 4 hours on a reel", type: "pain" }],
  visualDirection: "warm editorial stills",
};

describe("buildContentGenerationPrompt brief output", () => {
  const { prompt } = buildContentGenerationPrompt(
    rawProfile, rawStrategy, 0, "instagram", "post", undefined, undefined, "Acme"
  );

  it("documents the brief JSON keys", () => {
    expect(prompt).toContain('"archetype"');
    expect(prompt).toContain('"headline"');
    expect(prompt).toContain('"subhead"');
    expect(prompt).toContain('"body"');
    expect(prompt).toContain('"imagery"');
    expect(prompt).toContain('"accentIndex"');
    expect(prompt).toContain('"caption"');
    expect(prompt).toContain('"hashtags"');
  });

  it("lists the allowed archetype ids", () => {
    expect(prompt).toContain("editorial");
    expect(prompt).toContain("displayImage");
    expect(prompt).toContain("photoCaption");
    expect(prompt).toContain("stat");
  });

  it("documents imagery.kind options and optional scene", () => {
    expect(prompt).toContain('"kind"');
    expect(prompt).toContain("photo");
    expect(prompt).toContain("gradient");
    expect(prompt).toContain("solid");
    expect(prompt).toContain('"scene"');
  });

  it("no longer emits the legacy imagePrompt block", () => {
    expect(prompt).not.toContain('"brandColorUsage"');
    expect(prompt).not.toContain('"aspectRatio"');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL:**
```
npx vitest run src/lib/brain/prompts.brief.test.ts
```

- [ ] **Step 3: Replace the legacy output block in `buildContentGenerationPrompt`.** In `src/lib/brain/prompts.ts`, replace the final `sections.push("Produce BOTH a caption and image generation instructions together...")` block (the one returning `{caption, hashtags, imagePrompt:{...}}`, starting at line 445 and ending at line 458) with the brief-shaped instructions:
```ts
  sections.push(`Produce a structured creative BRIEF: pick the visual archetype, write the on-image copy, choose imagery, and write the caption together so they are creatively aligned.

ARCHETYPE — pick the one that best fits the hook and content:
- editorial: magazine-style headline + subhead over a background
- displayImage: full-bleed image with minimal overlay copy
- photoCaption: photo with a short caption strip
- iconCard: a single concept anchored by an icon
- quote: a pulled quote / testimonial
- stat: one big number + label
- steps: a short numbered sequence
- feature: one feature spotlight with headline + body
- announce: an announcement / launch card
- article: long-form headline + body, text-forward

ON-IMAGE COPY rules (this is text rendered ON the image, separate from the caption):
- headline: 2-7 words, the single punchiest idea. Required.
- subhead: optional supporting line, <= 12 words.
- body: optional, only for feature/article/steps; <= 30 words.
- Keep on-image copy SHORT. The caption carries the long copy, not the image.

IMAGERY:
- kind "photo": a generated still life / environment (no people, no text, no devices). Provide "scene" as a 20-60 word natural-language paragraph leading with the main visual element, weaving brand colors (${brandColors || "infer from product"}) and mood (${brandMood || "infer from product"}). Include a camera spec (e.g. "shot on 50mm f/2.0"). No quality tags like "8k".
- kind "gradient": a brand-color gradient background. Omit "scene".
- kind "solid": a flat brand-color background. Omit "scene".

accentIndex: integer index (0-based) selecting which brand accent color to emphasize.

Return ONLY valid JSON:
{
  "archetype": "one of: editorial | displayImage | photoCaption | iconCard | quote | stat | steps | feature | announce | article",
  "headline": "2-7 word on-image headline",
  "subhead": "optional supporting line or omit",
  "body": "optional body copy for feature/article/steps or omit",
  "imagery": {
    "kind": "one of: photo | gradient | solid",
    "scene": "for kind=photo only: 20-60 word scene paragraph, no people/text/devices; omit otherwise"
  },
  "accentIndex": 0,
  "caption": "the full caption text without hashtags",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`);
```

- [ ] **Step 4: Run test, expect PASS:**
```
npx vitest run src/lib/brain/prompts.brief.test.ts
```

- [ ] **Step 5: Commit:**
```
git add src/lib/brain/prompts.ts src/lib/brain/prompts.brief.test.ts
git commit -m "feat(brain): emit structured brief shape from content prompt"
```

### Task H.3: Wire generate.ts image path to brief -> scene -> render

**Files:**
- Modify: `src/lib/generate.ts`
- Test: `src/lib/generate.scene.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/generate.scene.test.ts`. Mock every cross-cluster dependency (DB, providers, brandkit, archetypes, scene renderer, fonts) so the image path is exercised in isolation:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene } from "@/lib/compose/scene";

const fakeScene: Scene = {
  w: 1080, h: 1350,
  background: { kind: "solid", color: "#111111" },
  elements: [],
};

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { query: { products: { findFirst: (...a: unknown[]) => findFirst(...a) }, instagramAccounts: { findFirst: vi.fn().mockResolvedValue(null) } } },
  schema: { products: { id: "id" }, instagramAccounts: { id: "id" } },
}));

const textGenerate = vi.fn();
vi.mock("@/lib/providers", () => ({
  createTextProvider: () => ({ name: "t", generate: textGenerate }),
  createPollinationsImageProvider: () => ({ name: "img", generate: vi.fn().mockResolvedValue({ url: "http://x/bg.png", localPath: "/api/media/bg.png" }) }),
  getSceneRenderer: () => ({ name: "scene", generate: vi.fn().mockResolvedValue({ url: "http://x/out.png", localPath: "/api/media/out.png" }) }),
}));

vi.mock("@/lib/settings", () => ({ getTextProvider: vi.fn().mockResolvedValue("gemini") }));

const getCached = vi.fn();
const derive = vi.fn();
vi.mock("@/lib/brain/brandkit", () => ({
  getCachedBrandKit: (...a: unknown[]) => getCached(...a),
  deriveBrandKit: (...a: unknown[]) => derive(...a),
}));

const archBuilder = vi.fn().mockReturnValue(fakeScene);
vi.mock("@/lib/compose/archetypes", () => ({
  ARCHETYPES: new Proxy({}, { get: () => archBuilder }),
}));

vi.mock("@/lib/compose/fonts", () => ({
  resolveFont: vi.fn().mockResolvedValue({ family: "Inter", class: "sans", filePath: "/f.ttf", data: Buffer.from("x"), weight: 400, source: "fontsource" }),
}));

import { generateContent } from "./generate";

const kit = {
  palette: { bg: "#fff", surface: "#eee", ink: "#111", muted: "#999", accents: ["#f00", "#0f0"], onAccent: "#fff" },
  type: { display: { family: "Inter", class: "sans", source: "fontsource", weights: [700] }, body: { family: "Inter", class: "sans", source: "fontsource", weights: [400] } },
  logo: {}, icons: { style: "line" }, shape: { radius: 12, density: "balanced" }, photo: { treatment: "none" }, mood: [],
  source: { from: "derived", at: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    id: 1, name: "Acme", textProvider: "gemini", instagramAccountId: null,
    profile: JSON.stringify({ name: "Acme", visualIdentity: { style: "", colors: "", mood: "" } }),
    marketingStrategy: JSON.stringify({ hooks: [], visualDirection: "" }),
  });
  getCached.mockReturnValue(kit);
});

describe("generateContent image path", () => {
  it("parses a brief and produces a post with scene + mediaUrl", async () => {
    textGenerate.mockResolvedValue({ text: JSON.stringify({
      archetype: "stat", headline: "92% faster", imagery: { kind: "solid" },
      accentIndex: 0, caption: "cap text", hashtags: ["a", "b"],
    }) });

    const posts = await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });

    expect(posts).toHaveLength(1);
    expect(posts[0].scene).toEqual(fakeScene);
    expect(posts[0].mediaUrl).toBe("/api/media/out.png");
    expect(posts[0].publicMediaUrl).toBe("http://x/out.png");
    expect(posts[0].content).toBe("cap text");
    expect(archBuilder).toHaveBeenCalledWith(kit, expect.objectContaining({ archetype: "stat" }));
  });

  it("derives a brand kit when none is cached", async () => {
    getCached.mockReturnValue(null);
    derive.mockResolvedValue(kit);
    textGenerate.mockResolvedValue({ text: JSON.stringify({
      archetype: "editorial", headline: "hi", imagery: { kind: "gradient" },
      accentIndex: 0, caption: "c", hashtags: [],
    }) });

    await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    expect(derive).toHaveBeenCalledWith(1);
  });

  it("fetches a photo background when imagery.kind is photo", async () => {
    textGenerate.mockResolvedValue({ text: JSON.stringify({
      archetype: "displayImage", headline: "hi", imagery: { kind: "photo", scene: "a sunlit desk" },
      accentIndex: 0, caption: "c", hashtags: [],
    }) });

    await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    const brief = archBuilder.mock.calls[0][1];
    expect(brief.imagery.scene).toBe("a sunlit desk");
  });

  it("rejects an invalid brief from the model", async () => {
    textGenerate.mockResolvedValue({ text: JSON.stringify({ archetype: "bogus", headline: "x", imagery: { kind: "solid" }, accentIndex: 0, caption: "c", hashtags: [] }) });
    await expect(generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (`scene` not on post, `getSceneRenderer` import missing, no brief parsing):
```
npx vitest run src/lib/generate.scene.test.ts
```

- [ ] **Step 3: Update imports + GeneratedPost type in `src/lib/generate.ts`.** Replace lines 1-9 (the import block) with:
```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import type { Platform, ContentPurpose, ContentTargeting, GenerationMetadata, MediaType } from "@/lib/brain/types";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import { createTextProvider, createPollinationsImageProvider, getSceneRenderer } from "@/lib/providers";
import { getTextProvider } from "@/lib/settings";
import { getDefaults, type ContentConfig } from "@/lib/content/defaults";
import { briefSchema } from "@/lib/brain/briefSchema";
import { getCachedBrandKit, deriveBrandKit } from "@/lib/brain/brandkit";
import { ARCHETYPES, type Brief } from "@/lib/compose/archetypes";
import { resolveFont } from "@/lib/compose/fonts";
import type { Scene, Background } from "@/lib/compose/scene";
```
Then add `scene?: Scene | null;` to the `GeneratedPost` interface (after `config?: ContentConfig;`):
```ts
  config?: ContentConfig;
  scene?: Scene | null;
```
(Note: `buildFluxPrompt` and `ImagePrompt` imports are removed since the legacy flux path is replaced.)

- [ ] **Step 4: Replace the parse + render loop.** In `src/lib/generate.ts`, replace from the `let generatedItems...` declaration (line 99) through the end of the per-item loop and the final `if (posts.length === 0)` / return (lines 99-150) with brief-based logic:
```ts
  let briefs: Brief[];
  if (generateCount > 1) {
    const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Failed to parse array response");
    briefs = (JSON.parse(arrayMatch[0]) as unknown[]).map((b) => briefSchema.parse(b));
  } else {
    const objMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Failed to parse response");
    briefs = [briefSchema.parse(JSON.parse(objMatch[0]))];
  }

  const kit = getCachedBrandKit(product) || (await deriveBrandKit(productId));

  // Resolve the two brand fonts once; reused across every brief in this batch.
  const displaySpec = kit.type.display;
  const bodySpec = kit.type.body;
  const [displayFont, bodyFont] = await Promise.all([
    resolveFont(displaySpec.family, displaySpec.class, displaySpec.weights[0]),
    resolveFont(bodySpec.family, bodySpec.class, bodySpec.weights[0]),
  ]);
  const fonts = [
    { name: displayFont.family, data: displayFont.data, weight: displayFont.weight },
    { name: bodyFont.family, data: bodyFont.data, weight: bodyFont.weight },
  ];

  const renderer = getSceneRenderer();
  const posts: GeneratedPost[] = [];

  for (const brief of briefs) {
    const scene = ARCHETYPES[brief.archetype](kit, brief);

    // For photo imagery, generate a background still and set it on the scene.
    if (brief.imagery.kind === "photo" && brief.imagery.scene) {
      const imageProvider = createPollinationsImageProvider();
      const bg = await imageProvider.generate({
        prompt: brief.imagery.scene,
        width: SCENE_W,
        height: SCENE_H,
      });
      const background: Background = {
        kind: "image",
        src: bg.url,
        fit: "cover",
        treatment: kit.photo.treatment,
      };
      scene.background = background;
    }

    const rendered = await renderer.generate({ scene, fonts });

    posts.push({
      content: sanitizeCaption(brief.caption),
      hashtags: (brief.hashtags || []).map((t) => t.replace(/^#+/, "")),
      mediaUrl: rendered.localPath || rendered.url,
      publicMediaUrl: rendered.url,
      config,
      scene,
      metadata,
    });
  }

  if (posts.length === 0) throw new Error("Failed to generate any content");
  return posts;
```
Also add the `SCENE_W`/`SCENE_H` import to the import block from Step 3:
```ts
import type { Scene, Background } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
```
Remove the now-dead `ENABLE_IMAGE_GENERATION`, `visualIdentity`, `visualDirection` locals (old lines 111-113) since the flux path is gone.

- [ ] **Step 5: Run test, expect PASS:**
```
npx vitest run src/lib/generate.scene.test.ts
```

- [ ] **Step 6: Commit:**
```
git add src/lib/generate.ts src/lib/generate.scene.test.ts
git commit -m "feat(generate): render image posts from brief via brandkit + scene renderer"
```

### Task H.4: Persist scene in worker insert

**Files:**
- Modify: `src/lib/worker.ts`
- Test: `src/lib/worker.scene.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/worker.scene.test.ts` verifying `runScheduledGeneration` passes a stringified `scene` (and `null` when absent) into the content insert. Export the runner for testability in Step 3:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene } from "@/lib/compose/scene";

const fakeScene: Scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#000" }, elements: [] };

const insertValues = vi.fn();
const returning = vi.fn().mockResolvedValue([{ id: 7 }]);
const selectWhere = vi.fn();
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (...a: unknown[]) => selectWhere(...a) }) }),
    insert: () => ({ values: (v: unknown) => { insertValues(v); return { returning }; } }),
    update: () => ({ set: () => ({ where: (...a: unknown[]) => updateWhere(...a) }) }),
  },
  schema: { generationSchedules: { enabled: "enabled", id: "id" }, content: {} },
}));

const generateContent = vi.fn();
vi.mock("@/lib/generate", () => ({ generateContent: (...a: unknown[]) => generateContent(...a) }));
vi.mock("@/lib/discord", () => ({ sendPostForApproval: vi.fn().mockResolvedValue(true) }));

import { runScheduledGeneration } from "./worker";

const baseSchedule = {
  id: 1, productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post",
  config: null, count: 1, enabled: true, preferredTime: "00:00", frequencyHours: 24, lastRunAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  returning.mockResolvedValue([{ id: 7 }]);
  selectWhere.mockResolvedValue([baseSchedule]);
});

const basePost = {
  content: "c", hashtags: ["a"], mediaUrl: "/api/media/o.png", publicMediaUrl: "http://x/o.png",
  metadata: { hookUsed: null, pillarUsed: null, targetType: null, targetValue: null, toneConstraints: [], visualDirection: "" },
};

describe("runScheduledGeneration scene persistence", () => {
  it("stringifies scene into the insert when present", async () => {
    generateContent.mockResolvedValue([{ ...basePost, scene: fakeScene }]);
    await runScheduledGeneration();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ scene: JSON.stringify(fakeScene) }));
  });

  it("inserts null scene when absent", async () => {
    generateContent.mockResolvedValue([{ ...basePost }]);
    await runScheduledGeneration();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ scene: null }));
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (`runScheduledGeneration` not exported; `scene` absent from insert):
```
npx vitest run src/lib/worker.scene.test.ts
```

- [ ] **Step 3: Export the runner.** In `src/lib/worker.ts`, change `async function runScheduledGeneration()` (line 25) to `export async function runScheduledGeneration()`.

- [ ] **Step 4: Add scene to the insert.** In `src/lib/worker.ts`, inside the `db.insert(schema.content).values({...})` object, add the `scene` field right after the `config` line (line 57):
```ts
          config: post.config ? JSON.stringify(post.config) : null,
          scene: post.scene ? JSON.stringify(post.scene) : null,
```

- [ ] **Step 5: Run test, expect PASS:**
```
npx vitest run src/lib/worker.scene.test.ts
```

- [ ] **Step 6: Commit:**
```
git add src/lib/worker.ts src/lib/worker.scene.test.ts
git commit -m "feat(worker): persist rendered scene json on content insert"
```

### Task H.5: Graceful fallbacks for imagery + render failure (spec §12)

**Files:**
- Modify: `src/lib/generate.ts`
- Test: `src/lib/generate.fallback.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/generate.fallback.test.ts`. Reuse the H.3 mock setup, but make the imagery provider and renderer fail, and assert the post still composes:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene } from "@/lib/compose/scene";

const fakeScene: Scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#111" }, elements: [] };

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { query: { products: { findFirst: (...a: unknown[]) => findFirst(...a) }, instagramAccounts: { findFirst: vi.fn().mockResolvedValue(null) } } },
  schema: { products: { id: "id" }, instagramAccounts: { id: "id" } },
}));

const textGenerate = vi.fn();
const imageGenerate = vi.fn();
const sceneGenerate = vi.fn();
vi.mock("@/lib/providers", () => ({
  createTextProvider: () => ({ name: "t", generate: textGenerate }),
  createPollinationsImageProvider: () => ({ name: "img", generate: imageGenerate }),
  getSceneRenderer: () => ({ name: "scene", generate: sceneGenerate }),
}));
vi.mock("@/lib/settings", () => ({ getTextProvider: vi.fn().mockResolvedValue("gemini") }));
const kit = {
  palette: { bg: "#fff", surface: "#eee", ink: "#111", muted: "#999", accents: ["#f00"], onAccent: "#fff" },
  type: { display: { family: "Inter", class: "sans", source: "fontsource", weights: [700] }, body: { family: "Inter", class: "sans", source: "fontsource", weights: [400] } },
  logo: {}, icons: { style: "line" }, shape: { radius: 12, density: "balanced" }, photo: { treatment: "none" }, mood: [], source: { from: "derived", at: 0 },
};
vi.mock("@/lib/brain/brandkit", () => ({ getCachedBrandKit: () => kit, deriveBrandKit: vi.fn() }));
const archBuilder = vi.fn().mockReturnValue(structuredClone(fakeScene));
vi.mock("@/lib/compose/archetypes", () => ({ ARCHETYPES: new Proxy({}, { get: () => archBuilder }) }));
vi.mock("@/lib/compose/fonts", () => ({ resolveFont: vi.fn().mockResolvedValue({ family: "Inter", class: "sans", filePath: "/f.ttf", data: Buffer.from("x"), weight: 400, source: "fontsource" }) }));

import { generateContent } from "./generate";

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    id: 1, name: "Acme", textProvider: "gemini", instagramAccountId: null,
    profile: JSON.stringify({ name: "Acme", visualIdentity: { style: "", colors: "", mood: "" } }),
    marketingStrategy: JSON.stringify({ hooks: [], visualDirection: "" }),
  });
});

describe("generateContent fallbacks", () => {
  it("falls back to a gradient background when the photo provider fails", async () => {
    textGenerate.mockResolvedValue({ text: JSON.stringify({ archetype: "displayImage", headline: "hi", imagery: { kind: "photo", scene: "x" }, accentIndex: 0, caption: "c", hashtags: [] }) });
    imageGenerate.mockRejectedValue(new Error("pollinations 500"));
    sceneGenerate.mockResolvedValue({ url: "http://x/out.png", localPath: "/api/media/out.png" });

    const posts = await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    expect(posts).toHaveLength(1);
    expect(posts[0].scene!.background.kind).toBe("gradient");
    expect(posts[0].mediaUrl).toBe("/api/media/out.png");
  });

  it("keeps the scene and nulls media when the renderer fails", async () => {
    textGenerate.mockResolvedValue({ text: JSON.stringify({ archetype: "stat", headline: "hi", imagery: { kind: "solid" }, accentIndex: 0, caption: "c", hashtags: [] }) });
    sceneGenerate.mockRejectedValue(new Error("resvg boom"));

    const posts = await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    expect(posts).toHaveLength(1);
    expect(posts[0].scene).toBeTruthy();
    expect(posts[0].mediaUrl).toBeNull();
    expect(posts[0].publicMediaUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (current loop rethrows on imagery/render error):

```
npx vitest run src/lib/generate.fallback.test.ts
```

- [ ] **Step 3: Wrap imagery + render in the H.3 loop.** In `src/lib/generate.ts`, replace the per-brief loop body (the `for (const brief of briefs)` block from Task H.3) with the fallback-guarded version:

```ts
  for (const brief of briefs) {
    const scene = ARCHETYPES[brief.archetype](kit, brief);

    // Photo background: on any failure, degrade to a brand gradient so the post still composes.
    if (brief.imagery.kind === "photo" && brief.imagery.scene) {
      try {
        const imageProvider = createPollinationsImageProvider();
        const bg = await imageProvider.generate({ prompt: brief.imagery.scene, width: SCENE_W, height: SCENE_H });
        scene.background = { kind: "image", src: bg.url, fit: "cover", treatment: kit.photo.treatment };
      } catch (err) {
        console.error("[generate] imagery failed, falling back to gradient:", err);
        scene.background = { kind: "gradient", from: kit.palette.bg, to: kit.palette.surface, angle: 145 };
      }
    }

    // Render: on failure, keep the (editable) scene but write no broken PNG.
    let mediaUrl: string | null = null;
    let publicMediaUrl: string | null = null;
    try {
      const rendered = await renderer.generate({ scene, fonts });
      mediaUrl = rendered.localPath || rendered.url;
      publicMediaUrl = rendered.url;
    } catch (err) {
      console.error("[generate] render failed, persisting scene without PNG:", err);
    }

    posts.push({
      content: sanitizeCaption(brief.caption),
      hashtags: (brief.hashtags || []).map((t) => t.replace(/^#+/, "")),
      mediaUrl,
      publicMediaUrl,
      config,
      scene,
      metadata,
    });
  }
```

- [ ] **Step 4: Run test, expect PASS:**

```
npx vitest run src/lib/generate.fallback.test.ts
```

- [ ] **Step 5: Commit:**

```
git add src/lib/generate.ts src/lib/generate.fallback.test.ts
git commit -m "feat(generate): degrade imagery to gradient + survive render failure"
```

---

## Phase P2 - Embedded editor

### Task I.1: Scene mutation helpers (move/resize/setText/swapImage)

**Files:**
- Create: `src/lib/compose/edit.ts`
- Test: `src/lib/compose/edit.test.ts`

- [ ] **Step 1: Write failing test for mutation helpers.** Create `src/lib/compose/edit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import { moveElement, resizeElement, setText, swapImage, findElement } from "@/lib/compose/edit";

function baseScene(): Scene {
  const els: SceneElement[] = [
    { id: "h1", type: "text", x: 100, y: 100, w: 400, h: 80, rotation: 0, z: 1, slot: "headline", content: "Hi", fontFamily: "Inter", fontWeight: 700, size: 48, color: "#000", align: "left", lineHeight: 1.1 },
    { id: "img1", type: "image", x: 0, y: 0, w: 1080, h: 600, rotation: 0, z: 0, slot: "bg", src: "/api/media/a.png", fit: "cover" },
  ];
  return { w: 1080, h: 1350, background: { kind: "solid", color: "#fff" }, elements: els };
}

describe("scene edit helpers", () => {
  it("findElement returns the matching element or undefined", () => {
    expect(findElement(baseScene(), "h1")?.type).toBe("text");
    expect(findElement(baseScene(), "nope")).toBeUndefined();
  });

  it("moveElement updates x/y and is immutable", () => {
    const s = baseScene();
    const next = moveElement(s, "h1", 250, 300);
    expect(findElement(next, "h1")).toMatchObject({ x: 250, y: 300 });
    expect(findElement(s, "h1")).toMatchObject({ x: 100, y: 100 }); // original untouched
    expect(next).not.toBe(s);
    expect(next.elements).not.toBe(s.elements);
  });

  it("moveElement clamps inside the scene bounds", () => {
    const next = moveElement(baseScene(), "h1", -50, 2000);
    // x clamped to >=0, y clamped so element stays within SCENE_H
    expect(findElement(next, "h1")!.x).toBe(0);
    expect(findElement(next, "h1")!.y).toBe(1350 - 80);
  });

  it("resizeElement enforces a minimum size and clamps to bounds", () => {
    const next = resizeElement(baseScene(), "h1", 5, 5);
    const el = findElement(next, "h1")!;
    expect(el.w).toBeGreaterThanOrEqual(8);
    expect(el.h).toBeGreaterThanOrEqual(8);
    const big = resizeElement(baseScene(), "h1", 5000, 5000);
    expect(findElement(big, "h1")!.w).toBe(1080 - 100); // clamped to right edge from x=100
    expect(findElement(big, "h1")!.h).toBe(1350 - 100);
  });

  it("setText updates text-bearing content fields", () => {
    const t = setText(baseScene(), "h1", "Hello world");
    expect(findElement(t, "h1")).toMatchObject({ content: "Hello world" });
  });

  it("setText throws for non-text elements", () => {
    expect(() => setText(baseScene(), "img1", "x")).toThrow();
  });

  it("swapImage updates src of an image element", () => {
    const s2 = swapImage(baseScene(), "img1", "/api/media/b.png");
    expect(findElement(s2, "img1")).toMatchObject({ src: "/api/media/b.png" });
  });

  it("swapImage throws for non-image elements", () => {
    expect(() => swapImage(baseScene(), "h1", "/x.png")).toThrow();
  });

  it("unknown id throws", () => {
    expect(() => moveElement(baseScene(), "ghost", 0, 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/lib/compose/edit.test.ts`. Expected: FAIL (module `@/lib/compose/edit` not found).

- [ ] **Step 3: Implement the helpers.** Create `src/lib/compose/edit.ts`:
```ts
import { SCENE_W, SCENE_H, type Scene, type SceneElement } from "@/lib/compose/scene";

const MIN_SIZE = 8;

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function findElement(scene: Scene, id: string): SceneElement | undefined {
  return scene.elements.find((el) => el.id === id);
}

function replaceElement(
  scene: Scene,
  id: string,
  fn: (el: SceneElement) => SceneElement,
): Scene {
  let found = false;
  const elements = scene.elements.map((el) => {
    if (el.id !== id) return el;
    found = true;
    return fn(el);
  });
  if (!found) throw new Error(`Element not found: ${id}`);
  return { ...scene, elements };
}

export function moveElement(scene: Scene, id: string, x: number, y: number): Scene {
  return replaceElement(scene, id, (el) => ({
    ...el,
    x: clamp(Math.round(x), 0, Math.max(0, SCENE_W - el.w)),
    y: clamp(Math.round(y), 0, Math.max(0, SCENE_H - el.h)),
  }));
}

export function resizeElement(scene: Scene, id: string, w: number, h: number): Scene {
  return replaceElement(scene, id, (el) => ({
    ...el,
    w: clamp(Math.round(w), MIN_SIZE, Math.max(MIN_SIZE, SCENE_W - el.x)),
    h: clamp(Math.round(h), MIN_SIZE, Math.max(MIN_SIZE, SCENE_H - el.y)),
  }));
}

// Text-bearing element types and the field that holds their copy.
const TEXT_FIELD: Partial<Record<SceneElement["type"], string>> = {
  text: "content",
  pill: "text",
  button: "label",
  chatBubble: "text",
};

export function setText(scene: Scene, id: string, value: string): Scene {
  return replaceElement(scene, id, (el) => {
    const field = TEXT_FIELD[el.type];
    if (!field) throw new Error(`Element ${id} (${el.type}) has no editable text`);
    return { ...el, [field]: value } as SceneElement;
  });
}

export function swapImage(scene: Scene, id: string, src: string): Scene {
  return replaceElement(scene, id, (el) => {
    if (el.type !== "image" && el.type !== "logo") {
      throw new Error(`Element ${id} (${el.type}) is not an image`);
    }
    return { ...el, src } as SceneElement;
  });
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/lib/compose/edit.test.ts`. Expected: PASS (all cases green).

- [ ] **Step 5: Commit.**
```
git add src/lib/compose/edit.ts src/lib/compose/edit.test.ts
git commit -m "feat(compose): scene edit helpers (move/resize/setText/swapImage)"
```

### Task I.2: contentRevisions table + scene snapshot helper

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `src/lib/contentRevisions.ts`
- Test: `src/lib/contentRevisions.test.ts`

- [ ] **Step 1: Add the table to the schema.** In `drizzle/schema.ts`, add after the `productRevisions` table definition:
```ts
export const contentRevisions = sqliteTable("content_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentId: integer("content_id").notNull().references(() => content.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // scene | mediaUrl
  content: text("content").notNull(), // prior JSON / value
  source: text("source").notNull(), // manual | generation
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```
Then add the inferred types near the other exports at the bottom of the file:
```ts
export type ContentRevision = typeof contentRevisions.$inferSelect;
export type NewContentRevision = typeof contentRevisions.$inferInsert;
```

- [ ] **Step 2: Generate + apply the migration.** Run `npm run db:generate` then `npm run db:migrate`. Confirm a new file under `drizzle/migrations/` creating `content_revisions`.

- [ ] **Step 3: Write failing test for the snapshot helper.** Create `src/lib/contentRevisions.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { snapshotContentScene } from "@/lib/contentRevisions";

async function makeContent(scene: string | null): Promise<number> {
  const [row] = await db
    .insert(schema.content)
    .values({
      mediaType: "image",
      targetSurface: "post",
      content: "x",
      status: "draft",
      scene,
    })
    .returning();
  return row.id;
}

describe("snapshotContentScene", () => {
  let cid: number;
  beforeEach(async () => {
    cid = await makeContent(JSON.stringify({ w: 1080, h: 1350, old: true }));
  });

  it("inserts a revision row holding the prior scene JSON", async () => {
    await snapshotContentScene(cid, JSON.stringify({ w: 1080, h: 1350, old: true }), "manual");
    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, cid));
    expect(revs.length).toBe(1);
    expect(revs[0].field).toBe("scene");
    expect(revs[0].source).toBe("manual");
    expect(JSON.parse(revs[0].content)).toMatchObject({ old: true });
  });

  it("is a no-op when prior scene is null/empty", async () => {
    const empty = await makeContent(null);
    await snapshotContentScene(empty, null, "manual");
    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, empty));
    expect(revs.length).toBe(0);
  });
});
```

- [ ] **Step 4: Run test, expect FAIL.** Run `npx vitest run src/lib/contentRevisions.test.ts`. Expected: FAIL (module `@/lib/contentRevisions` not found).

- [ ] **Step 5: Implement the helper.** Create `src/lib/contentRevisions.ts`:
```ts
import { db, schema } from "@/lib/db";

/**
 * Snapshot the PRIOR scene JSON of a content row before it is overwritten.
 * No-op when there is nothing to preserve.
 */
export async function snapshotContentScene(
  contentId: number,
  priorScene: string | null | undefined,
  source: "manual" | "generation",
): Promise<void> {
  if (!priorScene) return;
  await db.insert(schema.contentRevisions).values({
    contentId,
    field: "scene",
    content: priorScene,
    source,
  });
}
```

- [ ] **Step 6: Run test, expect PASS.** Run `npx vitest run src/lib/contentRevisions.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit.**
```
git add drizzle/schema.ts drizzle/migrations src/lib/contentRevisions.ts src/lib/contentRevisions.test.ts
git commit -m "feat(content): content_revisions table + scene snapshot helper"
```

### Task I.3: POST /api/content/[id]/scene - persist, re-render, snapshot

**Files:**
- Create: `src/app/api/content/[id]/scene/route.ts`
- Test: `src/app/api/content/[id]/scene/route.test.ts`

- [ ] **Step 1: Write failing round-trip test.** Create `src/app/api/content/[id]/scene/route.test.ts`. It stubs `getSceneRenderer` (the server source-of-truth renderer from the renderer cluster) and asserts the row is updated with the new scene + a fresh PNG path, and a revision is snapshotted:
```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// Stub the server renderer (source of truth) so the route test is hermetic.
vi.mock("@/lib/providers", async (orig) => {
  const actual = await orig<typeof import("@/lib/providers")>();
  return {
    ...actual,
    getSceneRenderer: () => ({
      name: "stub",
      async generate() {
        return { url: "/api/media/scene-stub.png", localPath: "/api/media/scene-stub.png" };
      },
    }),
  };
});

import { POST } from "@/app/api/content/[id]/scene/route";

const sampleScene = {
  w: 1080,
  h: 1350,
  background: { kind: "solid", color: "#fff" },
  elements: [
    { id: "h1", type: "text", x: 60, y: 80, w: 600, h: 120, rotation: 0, z: 1, slot: "headline", content: "Edited", fontFamily: "Inter", fontWeight: 700, size: 56, color: "#111", align: "left", lineHeight: 1.1 },
  ],
};

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/content/1/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/content/[id]/scene", () => {
  let cid: number;
  beforeAll(async () => {
    const [row] = await db
      .insert(schema.content)
      .values({
        mediaType: "image",
        targetSurface: "post",
        content: "orig",
        status: "draft",
        mediaUrl: "/api/media/old.png",
        scene: JSON.stringify({ w: 1080, h: 1350, background: { kind: "solid", color: "#000" }, elements: [] }),
      })
      .returning();
    cid = row.id;
  });

  it("persists scene, re-renders PNG, updates media urls, snapshots prior scene", async () => {
    const res = await POST(makeReq({ scene: sampleScene }), {
      params: Promise.resolve({ id: String(cid) }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mediaUrl).toBe("/api/media/scene-stub.png");

    const [row] = await db.select().from(schema.content).where(eq(schema.content.id, cid));
    expect(JSON.parse(row.scene!)).toMatchObject({ elements: [{ id: "h1", content: "Edited" }] });
    expect(row.mediaUrl).toBe("/api/media/scene-stub.png");
    expect(row.publicMediaUrl).toBe("/api/media/scene-stub.png");

    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, cid));
    expect(revs.length).toBe(1);
    expect(JSON.parse(revs[0].content)).toMatchObject({ background: { color: "#000" } });
  });

  it("404s for an unknown content id", async () => {
    const res = await POST(makeReq({ scene: sampleScene }), {
      params: Promise.resolve({ id: "999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s when scene is missing/invalid", async () => {
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: String(cid) }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/app/api/content/[id]/scene/route.test.ts`. Expected: FAIL (route module missing).

- [ ] **Step 3: Implement the route.** Create `src/app/api/content/[id]/scene/route.ts`. It validates the scene shape, loads fonts for the scene's families via `resolveFont` against the product's cached BrandKit, renders via `getSceneRenderer()`, persists scene + media urls, and snapshots the prior scene:
```ts
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSceneRenderer } from "@/lib/providers";
import { resolveFont } from "@/lib/compose/fonts";
import { getCachedBrandKit } from "@/lib/brain/brandkit";
import { snapshotContentScene } from "@/lib/contentRevisions";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

function isScene(v: unknown): v is Scene {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    s.w === SCENE_W &&
    s.h === SCENE_H &&
    !!s.background &&
    Array.isArray(s.elements)
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentId = parseInt(id, 10);
  if (Number.isNaN(contentId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scene = (body as { scene?: unknown })?.scene;
  if (!isScene(scene)) {
    return NextResponse.json({ error: "Invalid scene" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(schema.content)
    .where(eq(schema.content.id, contentId));
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve the fonts referenced by the scene so the server render matches the editor.
  const kit = row.productId
    ? await (async () => {
        const [p] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, row.productId!));
        return p ? getCachedBrandKit(p) : null;
      })()
    : null;

  const fams = new Map<string, { name: string; klass: "serif" | "sans" | "display" | "mono"; weight: number }>();
  for (const el of scene.elements) {
    if ("fontFamily" in el && typeof (el as { fontFamily?: string }).fontFamily === "string") {
      const family = (el as { fontFamily: string }).fontFamily;
      const weight = "fontWeight" in el ? Number((el as { fontWeight?: number }).fontWeight) || 400 : 400;
      const klass =
        kit && kit.type.display.family === family ? kit.type.display.class
        : kit && kit.type.body.family === family ? kit.type.body.class
        : "sans";
      fams.set(`${family}:${weight}`, { name: family, klass, weight });
    }
  }

  const fonts = await Promise.all(
    [...fams.values()].map(async (f) => {
      const rf = await resolveFont(f.name, f.klass, f.weight);
      return { name: rf.family, data: rf.data, weight: rf.weight, style: "normal" as const };
    }),
  );

  const rendered = await getSceneRenderer().generate({ scene, fonts });

  // Snapshot the prior scene before overwriting.
  await snapshotContentScene(contentId, row.scene, "manual");

  const mediaUrl = rendered.localPath ?? rendered.url;
  const [updated] = await db
    .update(schema.content)
    .set({
      scene: JSON.stringify(scene),
      mediaUrl,
      publicMediaUrl: rendered.url,
    })
    .where(eq(schema.content.id, contentId))
    .returning();

  return NextResponse.json(updated);
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/app/api/content/[id]/scene/route.test.ts`. Expected: PASS (round-trip + 404 + 400 cases green).

- [ ] **Step 5: Commit.**
```
git add "src/app/api/content/[id]/scene/route.ts" "src/app/api/content/[id]/scene/route.test.ts"
git commit -m "feat(content): POST scene route - persist, re-render PNG, snapshot revision"
```

### Task I.4: GET /api/content/[id]/scene - load scene for editor

**Files:**
- Modify: `src/app/api/content/[id]/scene/route.ts`
- Test: `src/app/api/content/[id]/scene/get.test.ts`

- [ ] **Step 1: Write failing test for GET.** Create `src/app/api/content/[id]/scene/get.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { db, schema } from "@/lib/db";
import { GET } from "@/app/api/content/[id]/scene/route";

describe("GET /api/content/[id]/scene", () => {
  let withScene: number;
  let noScene: number;
  const scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#abc" }, elements: [] };

  beforeAll(async () => {
    const [a] = await db
      .insert(schema.content)
      .values({ mediaType: "image", targetSurface: "post", content: "a", status: "draft", scene: JSON.stringify(scene) })
      .returning();
    withScene = a.id;
    const [b] = await db
      .insert(schema.content)
      .values({ mediaType: "image", targetSurface: "post", content: "b", status: "draft", scene: null })
      .returning();
    noScene = b.id;
  });

  it("returns the parsed scene + brandKit fields", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(withScene) }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scene).toMatchObject({ background: { color: "#abc" } });
  });

  it("returns scene:null when the row has no scene", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(noScene) }) });
    expect(res.status).toBe(200);
    expect((await res.json()).scene).toBeNull();
  });

  it("404s for unknown id", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/app/api/content/[id]/scene/get.test.ts`. Expected: FAIL (`GET` not exported).

- [ ] **Step 3: Add GET handler.** In `src/app/api/content/[id]/scene/route.ts`, add at the top of the exported handlers (after imports):
```ts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentId = parseInt(id, 10);
  if (Number.isNaN(contentId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const [row] = await db
    .select()
    .from(schema.content)
    .where(eq(schema.content.id, contentId));
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const kit =
    row.productId != null
      ? await (async () => {
          const [p] = await db
            .select()
            .from(schema.products)
            .where(eq(schema.products.id, row.productId!));
          return p ? getCachedBrandKit(p) : null;
        })()
      : null;
  return NextResponse.json({
    scene: row.scene ? (JSON.parse(row.scene) as Scene) : null,
    mediaUrl: row.mediaUrl,
    brandKit: kit,
  });
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/app/api/content/[id]/scene/get.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**
```
git add "src/app/api/content/[id]/scene/route.ts" "src/app/api/content/[id]/scene/get.test.ts"
git commit -m "feat(content): GET scene route - load scene + brandKit for editor"
```

### Task I.5: GET /api/fonts/[family]/[weight] - serve BrandKit TTFs to the browser

**Files:**
- Create: `src/app/api/fonts/[family]/[weight]/route.ts`
- Test: `src/app/api/fonts/[family]/[weight]/route.test.ts`

- [ ] **Step 1: Write failing test.** Editor preview fonts must equal server fonts, so this serves the exact `resolveFont` bytes. Create `src/app/api/fonts/[family]/[weight]/route.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/compose/fonts", () => ({
  resolveFont: vi.fn(async (family: string, _k: string, weight?: number) => ({
    family,
    class: "sans",
    filePath: `/fake/${family}.ttf`,
    data: Buffer.from([0x00, 0x01, 0x00, 0x00]), // sfnt header bytes
    weight: weight ?? 400,
    source: "fontsource",
  })),
}));

import { GET } from "@/app/api/fonts/[family]/[weight]/route";

describe("GET /api/fonts/[family]/[weight]", () => {
  it("returns font bytes with a font content-type", async () => {
    const res = await GET(new Request("http://x/api/fonts/Inter/700?class=sans"), {
      params: Promise.resolve({ family: "Inter", weight: "700" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/font/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(4);
  });

  it("defaults weight to 400 when non-numeric", async () => {
    const { resolveFont } = await import("@/lib/compose/fonts");
    await GET(new Request("http://x/api/fonts/Inter/abc"), {
      params: Promise.resolve({ family: "Inter", weight: "abc" }),
    });
    expect(resolveFont).toHaveBeenLastCalledWith("Inter", "sans", 400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run "src/app/api/fonts/[family]/[weight]/route.test.ts"`. Expected: FAIL (route missing).

- [ ] **Step 3: Implement the route.** Create `src/app/api/fonts/[family]/[weight]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveFont } from "@/lib/compose/fonts";

type FontClass = "serif" | "sans" | "display" | "mono";
const CLASSES: FontClass[] = ["serif", "sans", "display", "mono"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ family: string; weight: string }> },
) {
  const { family, weight } = await params;
  const fam = decodeURIComponent(family);
  const w = parseInt(weight, 10);
  const klassParam = new URL(req.url).searchParams.get("class");
  const klass: FontClass = CLASSES.includes(klassParam as FontClass)
    ? (klassParam as FontClass)
    : "sans";

  let resolved;
  try {
    resolved = await resolveFont(fam, klass, Number.isNaN(w) ? 400 : w);
  } catch {
    return new NextResponse("Font not found", { status: 404 });
  }

  const ext = resolved.filePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "woff2" ? "font/woff2" :
    ext === "woff" ? "font/woff" :
    ext === "otf" ? "font/otf" :
    "font/ttf";

  return new NextResponse(new Uint8Array(resolved.data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run "src/app/api/fonts/[family]/[weight]/route.test.ts"`. Expected: PASS.

- [ ] **Step 5: Commit.**
```
git add "src/app/api/fonts/[family]/[weight]/route.ts" "src/app/api/fonts/[family]/[weight]/route.test.ts"
git commit -m "feat(fonts): serve BrandKit TTFs to browser so editor fonts match server"
```

### Task I.6: SceneCanvas - live SVG preview via server render

**Files:**
- Create: `src/app/api/content/[id]/scene/preview/route.ts`
- Create: `src/components/editor/SceneCanvas.tsx`
- Test: `src/app/api/content/[id]/scene/preview/route.test.ts`

- [ ] **Step 1: Write failing test for the preview (SVG) route.** Satori is heavy to run in-browser, so the canvas fetches an SVG from a debounced server render (same code path = pixel-faithful). Create `src/app/api/content/[id]/scene/preview/route.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/providers", async (orig) => {
  const actual = await orig<typeof import("@/lib/providers")>();
  return {
    ...actual,
    getSceneRenderer: () => ({
      name: "stub",
      async generate() {
        return { url: "/x.png", svg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" };
      },
    }),
  };
});
vi.mock("@/lib/compose/fonts", () => ({
  resolveFont: vi.fn(async (family: string, klass: string, weight?: number) => ({
    family, class: klass, filePath: `/x/${family}.ttf`, data: Buffer.from([0]), weight: weight ?? 400, source: "fontsource",
  })),
}));

import { POST } from "@/app/api/content/[id]/scene/preview/route";

const scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#fff" }, elements: [] };

describe("POST /api/content/[id]/scene/preview", () => {
  it("returns image/svg+xml for a posted scene", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ scene }) }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await res.text()).toContain("<svg");
  });

  it("400s on an invalid scene", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ scene: { w: 1 } }) }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run "src/app/api/content/[id]/scene/preview/route.test.ts"`. Expected: FAIL (route missing).

- [ ] **Step 3: Implement the preview route.** Create `src/app/api/content/[id]/scene/preview/route.ts` (no DB write; SVG only):
```ts
import { NextRequest, NextResponse } from "next/server";
import { getSceneRenderer } from "@/lib/providers";
import { resolveFont } from "@/lib/compose/fonts";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

function isScene(v: unknown): v is Scene {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return s.w === SCENE_W && s.h === SCENE_H && !!s.background && Array.isArray(s.elements);
}

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const scene = (body as { scene?: unknown })?.scene;
  if (!isScene(scene)) {
    return NextResponse.json({ error: "Invalid scene" }, { status: 400 });
  }

  const fams = new Map<string, number>();
  for (const el of scene.elements) {
    if ("fontFamily" in el && typeof (el as { fontFamily?: string }).fontFamily === "string") {
      const family = (el as { fontFamily: string }).fontFamily;
      const weight = "fontWeight" in el ? Number((el as { fontWeight?: number }).fontWeight) || 400 : 400;
      fams.set(`${family}::${weight}`, weight);
    }
  }
  const fonts = await Promise.all(
    [...fams.entries()].map(async ([key, weight]) => {
      const family = key.split("::")[0];
      const rf = await resolveFont(family, "sans", weight);
      return { name: rf.family, data: rf.data, weight: rf.weight, style: "normal" as const };
    }),
  );

  const out = await getSceneRenderer().generate({ scene, fonts });
  if (!out.svg) {
    return NextResponse.json({ error: "Renderer produced no SVG" }, { status: 500 });
  }
  return new NextResponse(out.svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run "src/app/api/content/[id]/scene/preview/route.test.ts"`. Expected: PASS.

- [ ] **Step 5: Implement the SceneCanvas component.** Create `src/components/editor/SceneCanvas.tsx` (debounced SVG fetch; scales 1080x1350 down to a display box; renders the SVG as the backdrop layer for handle overlays):
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

interface Props {
  contentId: number;
  scene: Scene;
  displayW: number; // CSS px of the canvas box width
  children?: React.ReactNode; // handle overlays, positioned by the parent in scene coords * scale
}

export function SceneCanvas({ contentId, scene, displayW, children }: Props) {
  const [svg, setSvg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = displayW / SCENE_W;
  const displayH = SCENE_H * scale;

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/content/${contentId}/scene/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene }),
        });
        if (res.ok) setSvg(await res.text());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [contentId, scene]);

  return (
    <div
      className="relative select-none rounded-lg border border-gray-200 overflow-hidden bg-white"
      style={{ width: displayW, height: displayH }}
    >
      <div
        className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* Overlay layer in scene coordinates, scaled to the display box */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: SCENE_W, height: SCENE_H, transform: `scale(${scale})` }}
      >
        {children}
      </div>
      {loading && (
        <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-gray-400">
          rendering…
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit.**
```
git add "src/app/api/content/[id]/scene/preview/route.ts" "src/app/api/content/[id]/scene/preview/route.test.ts" src/components/editor/SceneCanvas.tsx
git commit -m "feat(editor): live SVG preview route + SceneCanvas component"
```

### Task I.7: ElementHandle - drag/resize overlay bound to one element

**Files:**
- Create: `src/components/editor/ElementHandle.tsx`
- Create: `src/components/editor/useDragResize.ts`
- Test: `src/components/editor/useDragResize.test.ts`

- [ ] **Step 1: Write failing test for the drag/resize delta math.** Pure helper so it's unit-testable without a DOM. Create `src/components/editor/useDragResize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyDrag, applyResize } from "@/components/editor/useDragResize";

const start = { x: 100, y: 200, w: 300, h: 150 };

describe("drag/resize delta math (scene coords)", () => {
  it("applyDrag adds scaled pointer delta to start position", () => {
    // pointer moved 50px right, 20px down on screen; canvas scale 0.5 => scene delta 100/40
    const next = applyDrag(start, { dx: 50, dy: 20 }, 0.5);
    expect(next).toMatchObject({ x: 200, y: 240 });
  });

  it("applyResize grows w/h by scaled delta", () => {
    const next = applyResize(start, { dx: 50, dy: 20 }, 0.5);
    expect(next).toMatchObject({ w: 400, h: 190 });
  });

  it("applyResize never goes below the minimum", () => {
    const next = applyResize(start, { dx: -10000, dy: -10000 }, 1);
    expect(next.w).toBeGreaterThanOrEqual(8);
    expect(next.h).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.** Run `npx vitest run src/components/editor/useDragResize.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement the delta helper.** Create `src/components/editor/useDragResize.ts`:
```ts
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PointerDelta {
  dx: number;
  dy: number;
}

const MIN = 8;

/** Translate a box by a screen-space pointer delta, converted to scene coords. */
export function applyDrag(start: Box, d: PointerDelta, scale: number): Box {
  return {
    ...start,
    x: Math.round(start.x + d.dx / scale),
    y: Math.round(start.y + d.dy / scale),
  };
}

/** Resize a box from its top-left anchor by a screen-space pointer delta. */
export function applyResize(start: Box, d: PointerDelta, scale: number): Box {
  return {
    ...start,
    w: Math.max(MIN, Math.round(start.w + d.dx / scale)),
    h: Math.max(MIN, Math.round(start.h + d.dy / scale)),
  };
}
```

- [ ] **Step 4: Run test, expect PASS.** Run `npx vitest run src/components/editor/useDragResize.test.ts`. Expected: PASS.

- [ ] **Step 5: Implement the ElementHandle overlay.** Create `src/components/editor/ElementHandle.tsx` (transparent box in scene coords; pointer-drag the body to move, drag the SE corner to resize; emits new x/y/w/h):
```tsx
"use client";

import { useRef } from "react";
import { applyDrag, applyResize, type Box } from "@/components/editor/useDragResize";

interface Props {
  box: Box;
  scale: number; // canvas display scale (displayW / SCENE_W)
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
}

export function ElementHandle({ box, scale, selected, onSelect, onMove, onResize }: Props) {
  const startBox = useRef<Box>(box);
  const startPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    startBox.current = box;
    startPt.current = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const next = applyDrag(
        startBox.current,
        { dx: ev.clientX - startPt.current.x, dy: ev.clientY - startPt.current.y },
        scale,
      );
      onMove(next.x, next.y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function beginResize(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    startBox.current = box;
    startPt.current = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const next = applyResize(
        startBox.current,
        { dx: ev.clientX - startPt.current.x, dy: ev.clientY - startPt.current.y },
        scale,
      );
      onResize(next.w, next.h);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      onPointerDown={beginDrag}
      className={`absolute cursor-move ${selected ? "ring-2 ring-blue-500" : "ring-1 ring-blue-300/40 hover:ring-blue-400"}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {selected && (
        <div
          onPointerDown={beginResize}
          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full bg-blue-600 border-2 border-white"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit.**
```
git add src/components/editor/ElementHandle.tsx src/components/editor/useDragResize.ts src/components/editor/useDragResize.test.ts
git commit -m "feat(editor): draggable/resizable element handle overlay"
```

### Task I.8: SceneEditor - wire canvas + handles + side panel + save

**Files:**
- Create: `src/components/editor/SceneEditor.tsx`
- Test: `src/components/editor/SceneEditor.test.tsx`

- [ ] **Step 1: Write failing render test.** Verifies the editor renders a handle per element and a text field for the selected text element, and that editing text calls `setText`-equivalent local mutation. Create `src/components/editor/SceneEditor.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Scene } from "@/lib/compose/scene";
import { SceneEditor } from "@/components/editor/SceneEditor";

// Canvas posts to the preview route; stub fetch so it never hits the network.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", {
        headers: { "Content-Type": "image/svg+xml" },
      }),
    ),
  );
});

const scene: Scene = {
  w: 1080,
  h: 1350,
  background: { kind: "solid", color: "#fff" },
  elements: [
    { id: "h1", type: "text", x: 60, y: 80, w: 600, h: 120, rotation: 0, z: 1, slot: "headline", content: "Hi", fontFamily: "Inter", fontWeight: 700, size: 56, color: "#111", align: "left", lineHeight: 1.1 },
    { id: "bg1", type: "image", x: 0, y: 0, w: 1080, h: 1350, rotation: 0, z: 0, slot: "bg", src: "/api/media/a.png", fit: "cover" },
  ],
};

describe("SceneEditor", () => {
  it("renders one handle per element", () => {
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={() => {}} />);
    expect(screen.getAllByTestId("element-handle")).toHaveLength(2);
  });

  it("editing the selected text element's content updates the textarea value", () => {
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={() => {}} />);
    fireEvent.pointerDown(screen.getAllByTestId("element-handle")[0]);
    const ta = screen.getByLabelText("Text") as HTMLTextAreaElement;
    expect(ta.value).toBe("Hi");
    fireEvent.change(ta, { target: { value: "Hello" } });
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("Save posts the scene and calls onSaved with the updated row", async () => {
    const onSaved = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/scene")) {
        return new Response(JSON.stringify({ id: 1, mediaUrl: "/api/media/new.png" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", {
        headers: { "Content-Type": "image/svg+xml" },
      });
    });
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /save layout/i }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: "/api/media/new.png" })));
  });
});
```

- [ ] **Step 2: Add the test-deps + jsdom config.** Ensure `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` are dev deps (SETUP added vitest; add these if missing): `npm i -D @testing-library/react @testing-library/jest-dom jsdom`. In `vitest.config.ts` confirm `test.environment` supports a `jsdom` override (the SETUP config uses `environmentMatchGlobs` or per-file `// @vitest-environment jsdom`). Add the docblock to the top of the test file if needed:
```tsx
// @vitest-environment jsdom
```

- [ ] **Step 3: Run test, expect FAIL.** Run `npx vitest run src/components/editor/SceneEditor.test.tsx`. Expected: FAIL (component missing).

- [ ] **Step 4: Implement SceneEditor.** Create `src/components/editor/SceneEditor.tsx` (holds local Scene copy, uses edit helpers, renders SceneCanvas + handles + a properties panel with Text + Swap image; Save POSTs to the scene route):
```tsx
"use client";

import { useMemo, useState } from "react";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import { SCENE_W } from "@/lib/compose/scene";
import { moveElement, resizeElement, setText, swapImage, findElement } from "@/lib/compose/edit";
import { SceneCanvas } from "@/components/editor/SceneCanvas";
import { ElementHandle } from "@/components/editor/ElementHandle";

const DISPLAY_W = 420;
const SCALE = DISPLAY_W / SCENE_W;

const TEXT_TYPES = ["text", "pill", "button", "chatBubble"] as const;
function readText(el: SceneElement): string | null {
  switch (el.type) {
    case "text": return el.content;
    case "pill": return el.text;
    case "button": return el.label;
    case "chatBubble": return el.text;
    default: return null;
  }
}
const isTextType = (el: SceneElement) => (TEXT_TYPES as readonly string[]).includes(el.type);
const isImageType = (el: SceneElement) => el.type === "image" || el.type === "logo";

interface Props {
  contentId: number;
  initialScene: Scene;
  onSaved: (row: { id: number; mediaUrl?: string | null; publicMediaUrl?: string | null }) => void;
}

export function SceneEditor({ contentId, initialScene, onSaved }: Props) {
  const [scene, setScene] = useState<Scene>(initialScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [swapUrl, setSwapUrl] = useState("");

  const selected = useMemo(
    () => (selectedId ? findElement(scene, selectedId) : undefined),
    [scene, selectedId],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${contentId}/scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      if (res.ok) onSaved(await res.json());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-6">
      <SceneCanvas contentId={contentId} scene={scene} displayW={DISPLAY_W}>
        {[...scene.elements]
          .sort((a, b) => a.z - b.z)
          .map((el) => (
            <div key={el.id} data-testid="element-handle">
              <ElementHandle
                box={{ x: el.x, y: el.y, w: el.w, h: el.h }}
                scale={SCALE}
                selected={el.id === selectedId}
                onSelect={() => setSelectedId(el.id)}
                onMove={(x, y) => setScene((s) => moveElement(s, el.id, x, y))}
                onResize={(w, h) => setScene((s) => resizeElement(s, el.id, w, h))}
              />
            </div>
          ))}
      </SceneCanvas>

      <div className="w-72 space-y-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Layout"}
        </button>

        {!selected && (
          <p className="text-sm text-gray-400">Select an element to edit it.</p>
        )}

        {selected && isTextType(selected) && (
          <div>
            <label htmlFor="el-text" className="block text-sm font-medium text-gray-700 mb-1">
              Text
            </label>
            <textarea
              id="el-text"
              aria-label="Text"
              value={readText(selected) ?? ""}
              onChange={(e) => setScene((s) => setText(s, selected.id, e.target.value))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
        )}

        {selected && isImageType(selected) && (
          <div>
            <label htmlFor="el-img" className="block text-sm font-medium text-gray-700 mb-1">
              Image URL
            </label>
            <input
              id="el-img"
              aria-label="Image URL"
              value={swapUrl}
              onChange={(e) => setSwapUrl(e.target.value)}
              placeholder="/api/media/…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <button
              onClick={() => swapUrl && setScene((s) => swapImage(s, selected.id, swapUrl))}
              className="mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-900"
            >
              Swap Image
            </button>
          </div>
        )}

        {selected && (
          <div className="text-xs text-gray-400">
            x {selected.x} · y {selected.y} · w {selected.w} · h {selected.h}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test, expect PASS.** Run `npx vitest run src/components/editor/SceneEditor.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit.**
```
git add src/components/editor/SceneEditor.tsx src/components/editor/SceneEditor.test.tsx package.json package-lock.json vitest.config.ts
git commit -m "feat(editor): SceneEditor - canvas + handles + properties panel + save"
```

### Task I.9: Mount the editor in the content detail page

**Files:**
- Modify: `src/app/content/[id]/page.tsx`

- [ ] **Step 1: Import the editor + scene loading state.** In `src/app/content/[id]/page.tsx`, add to the imports at the top:
```tsx
import type { Scene } from "@/lib/compose/scene";
import { SceneEditor } from "@/components/editor/SceneEditor";
```
And add state near the other `useState` declarations (after `const [scheduledAt, setScheduledAt] = useState("");`):
```tsx
const [scene, setScene] = useState<Scene | null>(null);
```

- [ ] **Step 2: Fetch the scene during data load.** In `fetchData`, after `setLightboxSrc`/before `setLoading(false)` returns, add a scene fetch (separate request, tolerant of missing scene):
```tsx
    try {
      const sceneRes = await fetch(`/api/content/${params.id}/scene`);
      if (sceneRes.ok) {
        const sceneData = await sceneRes.json();
        setScene(sceneData.scene ?? null);
      }
    } catch {
      setScene(null);
    }
```
Place this immediately before `setLoading(false);` at the end of `fetchData`.

- [ ] **Step 3: Render the editor block.** In the JSX, inside `<main>` after the Media URL `</div>` block (before the closing `</div>` of the white card), add a Layout Editor section that mounts the editor when a scene exists:
```tsx
          {/* Layout editor */}
          {scene && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Layout
              </label>
              <SceneEditor
                contentId={Number(params.id)}
                initialScene={scene}
                onSaved={(row) => {
                  if (row.mediaUrl) setMediaUrl(row.mediaUrl);
                }}
              />
            </div>
          )}
```

- [ ] **Step 4: Verify the build typechecks.** Run `npx tsc --noEmit`. Expected: no errors from the edited page (resolves `@/lib/compose/scene`, `@/components/editor/SceneEditor`).

- [ ] **Step 5: Commit.**
```
git add "src/app/content/[id]/page.tsx"
git commit -m "feat(content): mount SceneEditor in content detail page"
```

### Task I.10: Full cluster verification

**Files:**
- Test: (runs all cluster tests; no new files)

- [ ] **Step 1: Run all cluster tests together.** Run:
```
npx vitest run src/lib/compose/edit.test.ts src/lib/contentRevisions.test.ts "src/app/api/content/[id]/scene/route.test.ts" "src/app/api/content/[id]/scene/get.test.ts" "src/app/api/fonts/[family]/[weight]/route.test.ts" "src/app/api/content/[id]/scene/preview/route.test.ts" src/components/editor/useDragResize.test.ts src/components/editor/SceneEditor.test.tsx
```
Expected: all suites PASS.

- [ ] **Step 2: Typecheck the whole project.** Run `npx tsc --noEmit`. Expected: no errors. If `@/lib/compose/scene`, `@/lib/compose/fonts`, `@/lib/brain/brandkit`, or `getSceneRenderer` are unresolved, those are upstream-cluster deps (scene/fonts/brandkit + SceneRenderer); confirm they are merged before this cluster lands.

- [ ] **Step 3: Lint.** Run `npm run lint`. Expected: no new errors in `src/components/editor/**` or `src/app/api/content/**` or `src/app/api/fonts/**`.

- [ ] **Step 4: Commit any lint fixups (if needed).**
```
git add -A
git commit -m "chore(editor): lint + typecheck fixups for scene editor cluster"
```

### Task I.11: Minimal BrandKit override (logo + palette) - spec §5 / §16.2

**Files:**
- Create: `src/app/api/products/[id]/brandkit/route.ts`
- Create: `src/components/BrandKitOverride.tsx`
- Modify: `src/app/products/[id]/page.tsx` (mount the override control)
- Test: `src/app/api/products/[id]/brandkit/route.test.ts`

- [ ] **Step 1: Write failing API test.** Create `src/app/api/products/[id]/brandkit/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { query: { products: { findFirst: (...a: unknown[]) => findFirst(...a) } }, update: () => ({ set: updateSet }) },
  schema: { products: { id: "id" } },
}));

import { PATCH } from "./route";

const baseKit = {
  palette: { bg: "#fff", surface: "#eee", ink: "#111", muted: "#999", accents: ["#f00"], onAccent: "#fff" },
  type: { display: { family: "Inter", class: "sans", source: "fontsource", weights: [700] }, body: { family: "Inter", class: "sans", source: "fontsource", weights: [400] } },
  logo: { src: "/old.png" }, icons: { style: "line" }, shape: { radius: 12, density: "balanced" }, photo: { treatment: "none" }, mood: [], source: { from: "derived", at: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ id: 1, brandKit: baseKit });
});

describe("PATCH /api/products/[id]/brandkit", () => {
  it("patches palette hexes and logo, persists merged kit", async () => {
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ palette: { accents: ["#00f"] }, logo: { src: "/new.png" } }) });
    const res = await PATCH(req, { params: { id: "1" } });
    expect(res.status).toBe(200);
    const saved = updateSet.mock.calls[0][0].brandKit;
    expect(saved.palette.accents).toEqual(["#00f"]);
    expect(saved.palette.bg).toBe("#fff"); // untouched fields preserved
    expect(saved.logo.src).toBe("/new.png");
    expect(saved.source.from).toBe("upload");
  });

  it("rejects an invalid hex", async () => {
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ palette: { ink: "notacolor" } }) });
    const res = await PATCH(req, { params: { id: "1" } });
    expect(res.status).toBe(400);
  });

  it("404s when product or brandKit is missing", async () => {
    findFirst.mockResolvedValue(undefined);
    const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ palette: { ink: "#000000" } }) });
    const res = await PATCH(req, { params: { id: "1" } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (route missing):

```
npx vitest run "src/app/api/products/[id]/brandkit/route.test.ts"
```

- [ ] **Step 3: Implement the PATCH route.** Create `src/app/api/products/[id]/brandkit/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { z } from "zod";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "invalid hex");

// Only palette hexes + logo are editable in v1 (spec minimal override).
const overrideSchema = z.object({
  palette: z.object({
    bg: hex.optional(), surface: hex.optional(), ink: hex.optional(),
    muted: hex.optional(), onAccent: hex.optional(),
    accents: z.array(hex).optional(),
  }).partial().optional(),
  logo: z.object({ src: z.string().min(1).optional(), mark: z.string().optional() }).partial().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let patch;
  try {
    patch = overrideSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid override" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, Number(params.id)) });
  if (!product || !product.brandKit) {
    return Response.json({ error: "product or brandKit not found" }, { status: 404 });
  }

  const kit = product.brandKit as Record<string, any>;
  const merged = {
    ...kit,
    palette: { ...kit.palette, ...(patch.palette || {}) },
    logo: { ...kit.logo, ...(patch.logo || {}) },
    source: { ...kit.source, from: "upload", at: kit.source?.at ?? 0 },
  };

  await db.update(schema.products)
    .set({ brandKit: merged, brandKitUpdatedAt: new Date() })
    .where(eq(schema.products.id, Number(params.id)));

  return Response.json({ ok: true, brandKit: merged });
}
```

- [ ] **Step 4: Run test, expect PASS:**

```
npx vitest run "src/app/api/products/[id]/brandkit/route.test.ts"
```

- [ ] **Step 5: Add the minimal UI control.** Create `src/components/BrandKitOverride.tsx`:

```tsx
"use client";
import { useState } from "react";

interface Props { productId: number; palette: { accents: string[]; bg: string; ink: string }; logoSrc?: string; }

export function BrandKitOverride({ productId, palette, logoSrc }: Props) {
  const [accent, setAccent] = useState(palette.accents[0] || "#000000");
  const [logo, setLogo] = useState(logoSrc || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/products/${productId}/brandkit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ palette: { accents: [accent] }, logo: logo ? { src: logo } : undefined }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved" : "Failed - check hex/logo");
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <h4 className="text-sm font-semibold">Brand override</h4>
      <label className="flex items-center gap-2 text-sm">Accent
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
        <span className="font-mono">{accent}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">Logo URL
        <input className="flex-1 rounded border px-2 py-1" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="/api/media/logo.png" />
      </label>
      <button onClick={save} disabled={saving} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">
        {saving ? "Saving..." : "Save override"}
      </button>
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Mount it in the product detail page.** In `src/app/products/[id]/page.tsx`, where the product's BrandKit is available, render `<BrandKitOverride productId={product.id} palette={kit.palette} logoSrc={kit.logo?.src} />` (only when `product.brandKit` exists). Import at top: `import { BrandKitOverride } from "@/components/BrandKitOverride";`

- [ ] **Step 7: Commit:**

```
git add "src/app/api/products/[id]/brandkit" src/components/BrandKitOverride.tsx src/app/products/[id]/page.tsx
git commit -m "feat(brandkit): minimal override for logo + palette accents"
```

---

## Self-review resolutions

Decisions resolving the cross-cluster questions surfaced during drafting (apply during execution):

- **`getSceneRenderer()` exposure**: the renderer cluster (F) registers a `SceneRenderer` in `registry.ts` and **re-exports `getSceneRenderer` from `src/lib/providers/index.ts`** (alongside `createSceneRenderer`). `generate.ts` and the editor import it from `@/lib/providers`. F also calls `registerSceneRenderer(createSatoriResvgRenderer())` at provider bootstrap (where the other providers register).
- **`SceneRenderOutput.svg` always populated**: `createSatoriResvgRenderer` MUST return `svg` on every render (the editor preview route depends on it). Update the F renderer to always include `svg` in its output.
- **Scene revisions table**: keep the new **`contentRevisions`** table (I.2). `productRevisions` is product-scoped (`field: planFile|profile|...`); content scene edits need a content-scoped log. This is an accepted addition beyond spec §9 (schema delta: one new table).
- **Image swap source (v1)**: a free-text media URL field (light scope). A media-browser picker is deferred to v2.
- **Spec coverage confirmed**: Scene/SatoriTree (B), Fonts incl. acquisition spike (C), Schema (E), BrandKit derive/coldstart/cache (D), minimal override (I.11), Renderer + fidelity spike + imagery supplier (F), 10 archetypes + selector (G), Brief/zod + generate/prompts/worker wiring (H.1-H.4), §12 fallbacks (H.5), editor + fonts route + revisions (I). Video pipeline untouched per scope.

## Execution order (dependency-sorted)

Task 0 (setup) -> E.1 (schema) -> B.* (scene) -> C.* (fonts) -> D.* (brandkit) -> F.* (renderer/imagery) -> G.* (archetypes) -> H.1..H.5 (brief + wiring + fallbacks) -> I.1..I.11 (editor + override). Within a cluster, tasks are already ordered.
