import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene } from "@/lib/compose/scene";

const fakeScene: Scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#000" }, elements: [] };

const insertValues = vi.fn();
const returning = vi.fn().mockResolvedValue([{ id: 7 }]);
const selectWhere = vi.fn();
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (...a: unknown[]) => selectWhere(...a) }) }),
    insert: () => ({ values: (v: unknown) => { insertValues(v); return { returning }; } }),
    update: () => ({ set: () => ({ where: (...a: unknown[]) => updateWhere(...a) }) }),
  },
  schema: { generationSchedules: { enabled: "enabled", id: "id" }, content: {} },
}));

const generateContent = vi.fn();
vi.mock("@/lib/generate", () => ({ generateContent: (...a: unknown[]) => generateContent(...a) }));
vi.mock("@/lib/discord", () => ({ sendPostForApproval: vi.fn().mockResolvedValue(true) }));

import { runScheduledGeneration } from "./worker";

const baseSchedule = {
  id: 1, productId: 1, platform: "instagram", mediaType: "image", targetSurface: "post",
  config: null, count: 1, enabled: true, preferredTime: "00:00", frequencyHours: 24, lastRunAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  returning.mockResolvedValue([{ id: 7 }]);
  selectWhere.mockResolvedValue([baseSchedule]);
});

const basePost = {
  content: "c", hashtags: ["a"], mediaUrl: "/api/media/o.png", publicMediaUrl: "http://x/o.png",
  metadata: { hookUsed: null, pillarUsed: null, targetType: null, targetValue: null, toneConstraints: [], visualDirection: "" },
};

describe("runScheduledGeneration scene persistence", () => {
  it("passes the raw scene object into the insert when present (column is mode:json)", async () => {
    generateContent.mockResolvedValue([{ ...basePost, scene: fakeScene }]);
    await runScheduledGeneration();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ scene: fakeScene }));
  });

  it("inserts null scene when absent", async () => {
    generateContent.mockResolvedValue([{ ...basePost }]);
    await runScheduledGeneration();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ scene: null }));
  });
});
