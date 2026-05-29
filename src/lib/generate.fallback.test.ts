import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene } from "@/lib/compose/scene";

const fakeScene: Scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#111" }, elements: [] };

// A photo scene whose background-image src AND an image element both carry the LLM prompt
// text "x" as a placeholder (mirrors how displayImage / photoCaption seed brief.imagery.scene).
const photoSceneFixture: Scene = {
  w: 1080,
  h: 1350,
  background: { kind: "image", src: "x", fit: "cover", treatment: "none" },
  elements: [
    { id: "photo", type: "image", slot: "bg", x: 0, y: 0, w: 1080, h: 800, rotation: 0, z: 1, src: "x", fit: "cover" },
  ],
};

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { query: { products: { findFirst: (...a: unknown[]) => findFirst(...a) }, instagramAccounts: { findFirst: vi.fn().mockResolvedValue(null) } } },
  schema: { products: { id: "id" }, instagramAccounts: { id: "id" } },
}));

const textGenerate = vi.fn();
const fetchBackgroundImage = vi.fn();
const sceneGenerate = vi.fn();
vi.mock("@/lib/providers", () => ({
  createTextProvider: () => ({ name: "t", generate: textGenerate }),
  fetchBackgroundImage: (...a: unknown[]) => fetchBackgroundImage(...a),
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
vi.mock("@/lib/compose/archetypes", () => ({ ARCHETYPES: new Proxy({}, { get: () => archBuilder }), selectArchetype: () => "displayImage" }));
vi.mock("@/lib/brain/rotation", () => ({ getUsageStats: vi.fn().mockResolvedValue({ hooks: {}, pillars: {}, pains: {}, desires: {}, objections: {}, archetypes: {} }) }));
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
  it("patches the real photo slot (bg + image element) with the local supplier path", async () => {
    archBuilder.mockReturnValueOnce(structuredClone(photoSceneFixture));
    textGenerate.mockResolvedValue({ text: JSON.stringify({ archetype: "photoCaption", headline: "hi", imagery: { kind: "photo", scene: "x" }, accentIndex: 0, caption: "c", hashtags: [] }) });
    fetchBackgroundImage.mockResolvedValue({ url: "/api/media/bg.jpg", localPath: "/api/media/bg.jpg" });
    sceneGenerate.mockResolvedValue({ url: "http://x/out.png", localPath: "/api/media/out.png" });

    const posts = await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    expect(posts).toHaveLength(1);
    // Supplier was called with the prompt text + the kit treatment.
    expect(fetchBackgroundImage).toHaveBeenCalledWith("x", { treatment: "none" });
    const bg = posts[0].scene!.background;
    expect(bg.kind).toBe("image");
    expect((bg as { src: string }).src).toBe("/api/media/bg.jpg");
    // The image element that held the placeholder is patched too; none retains "x".
    const imgEl = posts[0].scene!.elements.find((e) => e.type === "image") as { src: string };
    expect(imgEl.src).toBe("/api/media/bg.jpg");
    expect(posts[0].mediaUrl).toBe("/api/media/out.png");
  });

  it("falls back to a gradient and scrubs the placeholder when the supplier fails", async () => {
    archBuilder.mockReturnValueOnce(structuredClone(photoSceneFixture));
    textGenerate.mockResolvedValue({ text: JSON.stringify({ archetype: "displayImage", headline: "hi", imagery: { kind: "photo", scene: "x" }, accentIndex: 0, caption: "c", hashtags: [] }) });
    fetchBackgroundImage.mockRejectedValue(new Error("pollinations 500"));
    sceneGenerate.mockResolvedValue({ url: "http://x/out.png", localPath: "/api/media/out.png" });

    const posts = await generateContent({ productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post" });
    expect(posts).toHaveLength(1);
    expect(posts[0].scene!.background.kind).toBe("gradient");
    // No image element may keep the prompt-text placeholder as its src.
    const imgEl = posts[0].scene!.elements.find((e) => e.type === "image") as { src: string };
    expect(imgEl.src).toBe("");
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
