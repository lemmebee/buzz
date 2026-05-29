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
