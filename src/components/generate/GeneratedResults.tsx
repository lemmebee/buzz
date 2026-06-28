"use client";

import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import type { GeneratedPost, ContentType } from "./types";
import { ImageLightbox } from "@/components/ImageLightbox";

interface GeneratedResultsProps {
  posts: GeneratedPost[];
  productId: number | null;
  contentType: ContentType;
}

export function GeneratedResults({ posts, productId, contentType }: GeneratedResultsProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(posts.map((_, i) => i)));
  const [mixMode, setMixMode] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleSelect(index: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  }

  function toggleAll() {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((_, i) => i)));
    }
  }

  function handleMixClick(index: number, type: "image" | "text") {
    if (type === "image") {
      setSelectedImageIndex((prev) => (prev === index ? null : index));
    } else {
      setSelectedTextIndex((prev) => (prev === index ? null : index));
    }
  }

  function handleSaveComposition() {
    if (selectedTextIndex === null) return;
    const textPost = posts[selectedTextIndex];
    const imagePost = selectedImageIndex !== null ? posts[selectedImageIndex] : null;

    fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        type: contentType,
        content: textPost.content,
        hashtags: textPost.hashtags,
        mediaUrl: imagePost?.mediaUrl ?? null,
        publicMediaUrl: imagePost?.publicMediaUrl ?? null,
        status: "draft",
        hookUsed: textPost.metadata?.hookUsed,
        pillarUsed: textPost.metadata?.pillarUsed,
        targetType: textPost.metadata?.targetType,
        targetValue: textPost.metadata?.targetValue,
        toneConstraints: textPost.metadata?.toneConstraints,
        visualDirection: imagePost?.metadata?.visualDirection ?? textPost.metadata?.visualDirection,
      }),
    }).then(() => {
      toast.success("Composition saved to queue");
      setSelectedImageIndex(null);
      setSelectedTextIndex(null);
    });
  }

  async function handleSaveToQueue() {
    const chosen = posts.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        chosen.map(async (post) => {
          const res = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId,
              type: contentType,
              content: post.content,
              hashtags: post.hashtags,
              mediaUrl: post.mediaUrl ?? null,
              publicMediaUrl: post.publicMediaUrl ?? null,
              status: "draft",
              hookUsed: post.metadata?.hookUsed,
              pillarUsed: post.metadata?.pillarUsed,
              targetType: post.metadata?.targetType,
              targetValue: post.metadata?.targetValue,
              toneConstraints: post.metadata?.toneConstraints,
              visualDirection: post.metadata?.visualDirection,
            }),
          });
          if (!res.ok) throw new Error(`save failed: ${res.status}`);
        })
      );
      toast.success(`Saved ${chosen.length} to queue`);
    } catch {
      toast.error("Failed to save to queue");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-medium text-text-primary">
          Generated Content ({posts.length})
        </h2>
        <div className="flex gap-2 items-center">
          <div className="relative group">
            <button
              onClick={() => setMixMode(!mixMode)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                mixMode
                  ? "bg-primary text-white"
                  : "bg-background text-text-secondary hover:bg-border"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Mix & Match
            </button>
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-3 bg-elevated border border-border rounded-lg shadow-lg text-xs text-text-secondary z-10">
              Combine images and text from different generated posts. Click an image to select it, then click text to pair them.
            </div>
          </div>
          {!mixMode && (
            <>
              <button
                onClick={toggleAll}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {selected.size === posts.length ? "Deselect All" : "Select All"}
              </button>
              <button
                onClick={handleSaveToQueue}
                disabled={isSaving || selected.size === 0}
                className="px-4 py-1.5 bg-success text-white text-sm font-medium rounded-lg hover:bg-success/90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : `Save ${selected.size} to Queue`}
              </button>
            </>
          )}
        </div>
      </div>

      {mixMode && (
        <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Mix & Match Mode:</span>{" "}
            Click an image from any post, then click text from another post to combine them. Your composition preview will appear below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {posts.map((post, i) => (
          <div
            key={i}
            onClick={() => !mixMode && toggleSelect(i)}
            className={`border rounded-lg cursor-pointer transition-colors overflow-hidden ${
              mixMode
                ? "border-border"
                : selected.has(i)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border-strong"
            }`}
          >
            {post.mediaUrl && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (mixMode) {
                    handleMixClick(i, "image");
                  }
                }}
                className={`aspect-square bg-background relative group ${
                  mixMode && selectedImageIndex === i ? "ring-2 ring-primary ring-inset" : ""
                }`}
              >
                {/\.(mp4|webm|mov)(\?|$)/i.test(post.mediaUrl!) ? (
                  <video
                    src={post.mediaUrl!}
                    controls
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Image
                    src={post.mediaUrl!}
                    alt="Generated"
                    fill
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                )}
                {!mixMode && (
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggleSelect(i)}
                      className="w-5 h-5"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxSrc(post.mediaUrl!);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" />
                    <path d="M9 6.75a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 019 6.75z" />
                  </svg>
                </button>
              </div>
            )}
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (mixMode) {
                  handleMixClick(i, "text");
                }
              }}
              className={`p-3 ${
                mixMode && selectedTextIndex === i ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""
              }`}
            >
              <p className="text-sm text-text-primary whitespace-pre-wrap line-clamp-4">
                {post.content}
              </p>
              {post.hashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {post.hashtags.slice(0, 5).map((tag, j) => (
                    <span key={j} className="text-xs text-primary">
                      #{tag.replace(/^#+/, "")}
                    </span>
                  ))}
                  {post.hashtags.length > 5 && (
                    <span className="text-xs text-text-tertiary">+{post.hashtags.length - 5}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {mixMode && (selectedTextIndex !== null || selectedImageIndex !== null) && (
        <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-lg">
          <h3 className="text-sm font-medium text-text-primary mb-3">Composition Preview</h3>
          <div className="flex gap-4 items-start">
            <div className="relative w-32 h-32 flex-shrink-0 bg-background rounded-lg overflow-hidden">
              {selectedImageIndex !== null && posts[selectedImageIndex]?.mediaUrl ? (
                <Image
                  src={posts[selectedImageIndex].mediaUrl!}
                  alt="Selected"
                  fill
                  unoptimized
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightboxSrc(posts[selectedImageIndex].mediaUrl!)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-text-tertiary">
                  No image
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {selectedTextIndex !== null ? (
                <>
                  <p className="text-sm text-text-primary whitespace-pre-wrap line-clamp-4">
                    {posts[selectedTextIndex].content}
                  </p>
                  {posts[selectedTextIndex].hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {posts[selectedTextIndex].hashtags.map((tag, j) => (
                        <span key={j} className="text-xs text-primary">
                          #{tag.replace(/^#+/, "")}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-text-tertiary italic">Select a text source</p>
              )}
            </div>
          </div>
          <button
            onClick={handleSaveComposition}
            disabled={selectedTextIndex === null}
            className="mt-3 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            Save Composition
          </button>
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
