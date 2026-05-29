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
  // System now picks the archetype; return a fixed one for deterministic tests.
  selectArchetype: () => "stat",
}));

vi.mock("@/lib/brain/rotation", () => ({
  getUsageStats: vi.fn().mockResolvedValue({ hooks: {}, pillars: {}, pains: {}, desires: {}, objections: {}, archetypes: {} }),
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
