import { describe, it, expect } from "vitest";
import { buildContentGenerationPrompt } from "./prompts";

const rawProfile = {
  name: "Acme",
  tagline: "ship faster",
  coreValue: "automate the boring parts",
  visualIdentity: { style: "minimal", colors: "navy and amber", mood: "calm" },
};
const rawStrategy = {
  hooks: [{ text: "you wasted 4 hours on a reel", type: "pain" }],
  visualDirection: "warm editorial stills",
};

describe("buildContentGenerationPrompt brief output", () => {
  const { prompt } = buildContentGenerationPrompt(
    rawProfile, rawStrategy, 0, "instagram", "post", undefined, undefined, "Acme"
  );

  it("documents the brief JSON keys", () => {
    expect(prompt).toContain('"archetype"');
    expect(prompt).toContain('"headline"');
    expect(prompt).toContain('"subhead"');
    expect(prompt).toContain('"body"');
    expect(prompt).toContain('"imagery"');
    expect(prompt).toContain('"accentIndex"');
    expect(prompt).toContain('"caption"');
    expect(prompt).toContain('"hashtags"');
  });

  it("lists the allowed archetype ids", () => {
    expect(prompt).toContain("editorial");
    expect(prompt).toContain("displayImage");
    expect(prompt).toContain("photoCaption");
    expect(prompt).toContain("stat");
  });

  it("documents imagery.kind options and optional scene", () => {
    expect(prompt).toContain('"kind"');
    expect(prompt).toContain("photo");
    expect(prompt).toContain("gradient");
    expect(prompt).toContain("solid");
    expect(prompt).toContain('"scene"');
  });

  it("no longer emits the legacy imagePrompt block", () => {
    expect(prompt).not.toContain('"brandColorUsage"');
    expect(prompt).not.toContain('"aspectRatio"');
  });
});
