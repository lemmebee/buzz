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
