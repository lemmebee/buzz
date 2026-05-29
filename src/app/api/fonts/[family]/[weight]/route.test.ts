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
