import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/providers", async (orig) => {
  const actual = await orig<typeof import("@/lib/providers")>();
  return {
    ...actual,
    createSceneRenderer: () => ({
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
