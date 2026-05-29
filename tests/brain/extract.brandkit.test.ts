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
    // brand_kit_updated_at column is drizzle timestamp mode -> a Date instance.
    expect(bkUpdate!.brandKitUpdatedAt).toBeInstanceOf(Date);
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
