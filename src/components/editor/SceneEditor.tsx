"use client";

import { useMemo, useState } from "react";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import { SCENE_W } from "@/lib/compose/scene";
import { moveElement, resizeElement, setText, swapImage, findElement } from "@/lib/compose/edit";
import { SceneCanvas } from "@/components/editor/SceneCanvas";
import { ElementHandle } from "@/components/editor/ElementHandle";

const DISPLAY_W = 420;
const SCALE = DISPLAY_W / SCENE_W;

const TEXT_TYPES = ["text", "pill", "button", "chatBubble"] as const;
function readText(el: SceneElement): string | null {
  switch (el.type) {
    case "text": return el.content;
    case "pill": return el.text;
    case "button": return el.label;
    case "chatBubble": return el.text;
    default: return null;
  }
}
const isTextType = (el: SceneElement) => (TEXT_TYPES as readonly string[]).includes(el.type);
const isImageType = (el: SceneElement) => el.type === "image" || el.type === "logo";

interface Props {
  contentId: number;
  initialScene: Scene;
  onSaved: (row: { id: number; mediaUrl?: string | null; publicMediaUrl?: string | null }) => void;
}

export function SceneEditor({ contentId, initialScene, onSaved }: Props) {
  const [scene, setScene] = useState<Scene>(initialScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [swapUrl, setSwapUrl] = useState("");

  const selected = useMemo(
    () => (selectedId ? findElement(scene, selectedId) : undefined),
    [scene, selectedId],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${contentId}/scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      if (res.ok) onSaved(await res.json());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-6">
      <SceneCanvas contentId={contentId} scene={scene} displayW={DISPLAY_W}>
        {/* Keep DOM order == elements order; stacking is controlled via z-index. */}
        {scene.elements.map((el) => (
          <ElementHandle
            key={el.id}
            data-testid="element-handle"
            box={{ x: el.x, y: el.y, w: el.w, h: el.h }}
            z={el.z}
            scale={SCALE}
            selected={el.id === selectedId}
            onSelect={() => setSelectedId(el.id)}
            onMove={(x, y) => setScene((s) => moveElement(s, el.id, x, y))}
            onResize={(w, h) => setScene((s) => resizeElement(s, el.id, w, h))}
          />
        ))}
      </SceneCanvas>

      <div className="w-72 space-y-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Layout"}
        </button>

        {!selected && (
          <p className="text-sm text-gray-400">Select an element to edit it.</p>
        )}

        {selected && isTextType(selected) && (
          <div>
            <label htmlFor="el-text" className="block text-sm font-medium text-gray-700 mb-1">
              Text
            </label>
            <textarea
              id="el-text"
              aria-label="Text"
              value={readText(selected) ?? ""}
              onChange={(e) => setScene((s) => setText(s, selected.id, e.target.value))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
        )}

        {selected && isImageType(selected) && (
          <div>
            <label htmlFor="el-img" className="block text-sm font-medium text-gray-700 mb-1">
              Image URL
            </label>
            <input
              id="el-img"
              aria-label="Image URL"
              value={swapUrl}
              onChange={(e) => setSwapUrl(e.target.value)}
              placeholder="/api/media/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <button
              onClick={() => swapUrl && setScene((s) => swapImage(s, selected.id, swapUrl))}
              className="mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-900"
            >
              Swap Image
            </button>
          </div>
        )}

        {selected && (
          <div className="text-xs text-gray-400">
            x {selected.x} - y {selected.y} - w {selected.w} - h {selected.h}
          </div>
        )}
      </div>
    </div>
  );
}
