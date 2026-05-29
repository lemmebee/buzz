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
      new Response(new Uint8Array(src), { status: 200 })
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
      new Response(new Uint8Array(src), { status: 200 })
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
