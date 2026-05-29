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
