"use client";

import { useEffect, useRef } from "react";

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (imgRef.current && !imgRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
      >
        &times;
      </button>
      <img
        ref={imgRef}
        src={src}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain"
      />
    </div>
  );
}
