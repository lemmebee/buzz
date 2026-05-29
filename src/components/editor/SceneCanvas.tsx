"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

interface Props {
  contentId: number;
  scene: Scene;
  displayW: number; // CSS px of the canvas box width
  children?: React.ReactNode; // handle overlays, positioned by the parent in scene coords * scale
}

export function SceneCanvas({ contentId, scene, displayW, children }: Props) {
  const [svg, setSvg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = displayW / SCENE_W;
  const displayH = SCENE_H * scale;

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/content/${contentId}/scene/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene }),
        });
        if (res.ok) setSvg(await res.text());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [contentId, scene]);

  return (
    <div
      className="relative select-none rounded-lg border border-gray-200 overflow-hidden bg-white"
      style={{ width: displayW, height: displayH }}
    >
      <div
        className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* Overlay layer in scene coordinates, scaled to the display box */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: SCENE_W, height: SCENE_H, transform: `scale(${scale})` }}
      >
        {children}
      </div>
      {loading && (
        <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-gray-400">
          rendering...
        </div>
      )}
    </div>
  );
}
