"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
  images?: string[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function ImageLightbox({ src, onClose, images, currentIndex = 0, onIndexChange }: ImageLightboxProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasMultiple = images && images.length > 1;
  const isVideo = isVideoUrl(src);

  const goNext = useCallback(() => {
    if (hasMultiple && onIndexChange) {
      onIndexChange((currentIndex + 1) % images!.length);
    }
  }, [hasMultiple, currentIndex, images, onIndexChange]);

  const goPrev = useCallback(() => {
    if (hasMultiple && onIndexChange) {
      onIndexChange((currentIndex - 1 + images!.length) % images!.length);
    }
  }, [hasMultiple, currentIndex, images, onIndexChange]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    if (isVideo && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [src, isVideo]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  const btnBase = "absolute rounded-full p-2 z-10 transition-colors";
  const btnDark = "bg-white/10 hover:bg-white/20 text-white";
  const btnLight = "bg-black/10 hover:bg-black/20 text-black";
  const btnTheme = isDark ? btnDark : btnLight;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? "bg-black/90" : "bg-white/90"}`}
      onClick={handleBackdropClick}
    >
      <button
        onClick={onClose}
        className={`absolute top-4 right-4 ${btnBase} ${btnTheme}`}
      >
        <X className="h-5 w-5" />
      </button>

      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className={`absolute left-4 top-1/2 -translate-y-1/2 ${btnBase} ${btnTheme}`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <div
        ref={containerRef}
        className="relative w-[95vw] h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={src}
            controls
            autoPlay
            className="w-full h-full object-contain"
          />
        ) : (
          <Image
            src={src}
            alt=""
            fill
            unoptimized
            className="object-contain"
          />
        )}
      </div>

      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className={`absolute right-4 top-1/2 -translate-y-1/2 ${btnBase} ${btnTheme}`}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {hasMultiple && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm ${isDark ? "bg-white/10 text-white/80" : "bg-black/10 text-black/70"}`}>
          {currentIndex + 1} / {images!.length}
        </div>
      )}
    </div>
  );
}
