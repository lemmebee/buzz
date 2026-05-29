// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Scene } from "@/lib/compose/scene";
import { SceneEditor } from "@/components/editor/SceneEditor";

// Canvas posts to the preview route; stub fetch so it never hits the network.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", {
        headers: { "Content-Type": "image/svg+xml" },
      }),
    ),
  );
});

const scene: Scene = {
  w: 1080,
  h: 1350,
  background: { kind: "solid", color: "#fff" },
  elements: [
    { id: "h1", type: "text", x: 60, y: 80, w: 600, h: 120, rotation: 0, z: 1, slot: "headline", content: "Hi", fontFamily: "Inter", fontWeight: 700, size: 56, color: "#111", align: "left", lineHeight: 1.1 },
    { id: "bg1", type: "image", x: 0, y: 0, w: 1080, h: 1350, rotation: 0, z: 0, slot: "bg", src: "/api/media/a.png", fit: "cover" },
  ],
};

describe("SceneEditor", () => {
  it("renders one handle per element", () => {
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={() => {}} />);
    expect(screen.getAllByTestId("element-handle")).toHaveLength(2);
  });

  it("editing the selected text element's content updates the textarea value", () => {
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={() => {}} />);
    fireEvent.pointerDown(screen.getAllByTestId("element-handle")[0]);
    const ta = screen.getByLabelText("Text") as HTMLTextAreaElement;
    expect(ta.value).toBe("Hi");
    fireEvent.change(ta, { target: { value: "Hello" } });
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("Save posts the scene and calls onSaved with the updated row", async () => {
    const onSaved = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/scene")) {
        return new Response(JSON.stringify({ id: 1, mediaUrl: "/api/media/new.png" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", {
        headers: { "Content-Type": "image/svg+xml" },
      });
    });
    render(<SceneEditor contentId={1} initialScene={scene} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /save layout/i }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: "/api/media/new.png" })));
  });
});
