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
