"use client";

import { useState } from "react";

interface InstagramPhonePreviewProps {
  content: string;
  mediaUrl?: string;
  type?: string;
}

export function InstagramPhonePreview({ content, mediaUrl, type = "post" }: InstagramPhonePreviewProps) {
  const [imageError, setImageError] = useState(false);
  const charCount = content.length;
  const isOverLimit = charCount > 2200;

  const isVideo = mediaUrl && /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-sm font-medium text-text-secondary mb-3">Instagram Preview</h3>

      {/* Phone frame */}
      <div className="relative w-[320px] h-[640px] bg-black rounded-[40px] p-3 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[25px] bg-black rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="w-full h-full bg-white rounded-[32px] overflow-hidden flex flex-col">
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-white">
            <span className="text-xs font-semibold text-black">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border border-black rounded-sm" />
              <div className="w-4 h-2 border border-black rounded-sm" />
              <div className="w-6 h-3 border border-black rounded-sm" />
            </div>
          </div>

          {/* Instagram header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500" />
              <span className="text-sm font-semibold text-black">your_account</span>
            </div>
            <button className="text-black">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>

          {/* Media */}
          <div className="relative aspect-square bg-gray-100 flex-shrink-0">
            {mediaUrl && !imageError ? (
              isVideo ? (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Post preview"
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}

            {/* Type badge */}
            {type && type !== "post" && (
              <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                {type === "reel" ? "▶ Reel" : type === "story" ? "Story" : type}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-100">
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <svg className="w-6 h-6 text-black ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>

          {/* Caption */}
          <div className="flex-1 overflow-auto px-3 py-2">
            <p className="text-xs text-black leading-relaxed break-words">
              <span className="font-semibold">your_account</span>{" "}
              {content || <span className="text-gray-400">Your caption will appear here...</span>}
            </p>
          </div>

          {/* Character count */}
          <div className={`px-3 py-1.5 border-t text-xs ${isOverLimit ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>
            {charCount} / 2,200 {isOverLimit && "• Over limit!"}
          </div>
        </div>
      </div>

      {/* Caption preview below phone */}
      <div className="mt-4 w-[320px]">
        <div className={`text-xs px-3 py-2 rounded-lg ${isOverLimit ? "bg-red-50 text-red-600 border border-red-200" : "bg-surface text-text-tertiary border border-border"}`}>
          {isOverLimit
            ? `Caption is ${charCount - 2200} characters over Instagram's limit.`
            : `${2200 - charCount} characters remaining`}
        </div>
      </div>
    </div>
  );
}
