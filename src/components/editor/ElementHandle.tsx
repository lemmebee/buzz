"use client";

import { useRef } from "react";
import { applyDrag, applyResize, type Box } from "@/components/editor/useDragResize";

interface Props {
  box: Box;
  scale: number; // canvas display scale (displayW / SCENE_W)
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  z?: number;
  "data-testid"?: string;
}

export function ElementHandle({ box, scale, selected, onSelect, onMove, onResize, z, ...rest }: Props) {
  const startBox = useRef<Box>(box);
  const startPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    startBox.current = box;
    startPt.current = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const next = applyDrag(
        startBox.current,
        { dx: ev.clientX - startPt.current.x, dy: ev.clientY - startPt.current.y },
        scale,
      );
      onMove(next.x, next.y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function beginResize(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    startBox.current = box;
    startPt.current = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const next = applyResize(
        startBox.current,
        { dx: ev.clientX - startPt.current.x, dy: ev.clientY - startPt.current.y },
        scale,
      );
      onResize(next.w, next.h);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      data-testid={rest["data-testid"]}
      onPointerDown={beginDrag}
      className={`absolute cursor-move ${selected ? "ring-2 ring-blue-500" : "ring-1 ring-blue-300/40 hover:ring-blue-400"}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: z }}
    >
      {selected && (
        <div
          onPointerDown={beginResize}
          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full bg-blue-600 border-2 border-white"
        />
      )}
    </div>
  );
}
