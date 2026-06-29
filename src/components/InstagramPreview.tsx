"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface InstagramPreviewProps {
  content: string;
  hashtags?: string[];
  mediaUrl?: string | null;
  productName?: string;
  onClose: () => void;
}

export function InstagramPreview({ content, hashtags = [], mediaUrl, productName, onClose }: InstagramPreviewProps) {
  const handle = productName ? productName.toLowerCase().replace(/\s+/g, ".") : "your.brand";
  const [liked, setLiked] = useState(false);

  const fullCaption = hashtags.length > 0
    ? `${content}\n\n${hashtags.map((t) => `#${t.replace(/^#+/, "")}`).join(" ")}`
    : content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
            <span className="text-sm font-medium text-text-primary">{handle}</span>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Media */}
        {mediaUrl && (
          <div className="relative aspect-square bg-background">
            {/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl) ? (
              <video src={mediaUrl} controls muted loop playsInline className="h-full w-full object-cover" />
            ) : (
              <Image src={mediaUrl} alt="Preview" fill unoptimized className="h-full w-full object-cover" />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 px-4 py-3">
          <button onClick={() => setLiked(!liked)} className="transition-colors">
            <Heart className={`h-6 w-6 ${liked ? "fill-red-500 text-red-500" : "text-text-primary"}`} />
          </button>
          <MessageCircle className="h-6 w-6 text-text-primary" />
          <Send className="h-6 w-6 text-text-primary" />
          <Bookmark className="ml-auto h-6 w-6 text-text-primary" />
        </div>

        {/* Caption */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex gap-2">
            <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
            <div className="flex-1">
              <span className="text-sm font-medium text-text-primary">{handle}</span>
              <p className="mt-0.5 text-sm text-text-secondary whitespace-pre-wrap break-words">
                {fullCaption}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-text-tertiary">JUST NOW</p>
        </div>
      </div>
    </div>
  );
}
