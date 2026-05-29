import { describe, it, expect } from "vitest";

describe("setup", () => {
  it("runs vitest and resolves @ alias deps", async () => {
    const satori = (await import("satori")).default;
    const { Resvg } = await import("@resvg/resvg-js");
    expect(typeof satori).toBe("function");
    expect(typeof Resvg).toBe("function");
  });
});
