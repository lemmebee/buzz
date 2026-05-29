import { describe, it, expect } from "vitest";
import { coldStartBrandKit } from "@/lib/brain/brandkit";
import { normalizeProfile } from "@/lib/brain/types";

const baseProfile = normalizeProfile({
  name: "Acme",
  visualIdentity: { style: "minimal modern", colors: "navy and coral", mood: "calm, premium" },
  brandPersonality: { archetypes: ["Sage"], traits: ["calm", "precise"], voiceDos: [], voiceDonts: [] },
});

describe("coldStartBrandKit", () => {
  it("returns a fully-populated BrandKit with sane defaults", () => {
    const kit = coldStartBrandKit(baseProfile);
    expect(kit.palette.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(kit.palette.accents.length).toBeGreaterThan(0);
    expect(kit.palette.accents[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(kit.type.display.class).toBe("display");
    expect(kit.type.body.class).toBe("sans");
    expect(["line", "solid", "geometric"]).toContain(kit.icons.style);
    expect(typeof kit.shape.radius).toBe("number");
    expect(["airy", "balanced", "tight"]).toContain(kit.shape.density);
    expect(["none", "warm", "duotone"]).toContain(kit.photo.treatment);
    expect(kit.source.from).toBe("derived");
    expect(kit.mood.length).toBeGreaterThan(0);
  });

  it("derives density 'tight' from 'minimal' style and 'airy' from 'spacious'", () => {
    const tight = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "minimal", colors: "", mood: "" } }));
    const airy = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "spacious airy", colors: "", mood: "" } }));
    expect(tight.shape.density).toBe("tight");
    expect(airy.shape.density).toBe("airy");
  });

  it("picks 'solid' icons for bold/playful, 'line' for minimal", () => {
    const bold = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "bold playful", colors: "", mood: "energetic" } }));
    const minimal = coldStartBrandKit(normalizeProfile({ visualIdentity: { style: "minimal clean", colors: "", mood: "calm" } }));
    expect(bold.icons.style).toBe("solid");
    expect(minimal.icons.style).toBe("line");
  });
});
