"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product } from "../../../drizzle/schema";
import type { TargetType, ContentTargeting } from "@/lib/brain/types";

type PlatformType = "instagram" | "twitter";
type ContentType = "reel" | "post" | "carousel" | "story" | "ad";

interface GeneratedPost {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  publicMediaUrl?: string | null;
  metadata?: {
    hookUsed?: string;
    pillarUsed?: string;
    targetType?: string;
    targetValue?: string;
    toneConstraints?: string[];
    visualDirection?: string;
  };
}

interface ComposedPost {
  textSourceIndex: number;
  imageSourceIndex: number | null;
  content: string;
  hashtags: string[];
  mediaUrl: string | null;
  publicMediaUrl: string | null;
  metadata: GeneratedPost["metadata"];
}

interface Suggestions {
  suggestedHook: string | null;
  suggestedPillar: string | null;
  suggestedPain: string | null;
  suggestedDesire: string | null;
  suggestedObjection: string | null;
  usageStats: {
    hooks: Record<string, number>;
    pillars: Record<string, number>;
    pains: Record<string, number>;
    desires: Record<string, number>;
    objections: Record<string, number>;
  };
  available: {
    hooks: string[];
    pillars: string[];
    pains: string[];
    desires: string[];
    objections: { objection: string; counter: string }[];
  };
}

const platformTypes: { value: PlatformType; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter/X" },
];

const contentTypesByPlatform: Record<PlatformType, { value: ContentType; label: string }[]> = {
  instagram: [
    { value: "post", label: "Post" },
    { value: "reel", label: "Reel" },
    { value: "story", label: "Story" },
    { value: "ad", label: "Ad" },
  ],
  twitter: [
    { value: "post", label: "Tweet" },
    { value: "ad", label: "Ad" },
  ],
};

const targetTypes: { value: TargetType | ""; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "pain", label: "Pain Point" },
  { value: "desire", label: "Desire" },
  { value: "objection", label: "Objection" },
];

export default function GeneratePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [productId, setProductId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<PlatformType>("instagram");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [count, setCount] = useState(5);

  // Targeting
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [hookMode, setHookMode] = useState<"auto" | "specific">("auto");
  const [selectedHook, setSelectedHook] = useState<string>("");
  const [selectedPillar, setSelectedPillar] = useState<string>("");
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const [targetValue, setTargetValue] = useState<string>("");

  // Screenshots
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // Results
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Mix & Match
  const [mixMode, setMixMode] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  const [compositionQueue, setCompositionQueue] = useState<ComposedPost[]>([]);

  function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setScreenshots((prev) => [...prev, ...files]);
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setScreenshotPreviews((prev) => [...prev, ...newPreviews]);
    if (screenshotInputRef.current) screenshotInputRef.current.value = "";
  }

  function removeScreenshot(index: number) {
    URL.revokeObjectURL(screenshotPreviews[index]);
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const fetchSuggestions = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/products/${pid}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setProducts(data);
        if (data.length > 0) {
          setProductId(data[0].id);
          fetchSuggestions(data[0].id);
        }
        setLoading(false);
      });
  }, [fetchSuggestions]);

  useEffect(() => {
    if (productId) {
      fetchSuggestions(productId);
      // Reset targeting when product changes
      setSelectedHook("");
      setSelectedPillar("");
      setTargetType("");
      setTargetValue("");
    }
  }, [productId, fetchSuggestions]);

  async function handleGenerate() {
    if (!productId) return;

    setGenerating(true);
    setError(null);
    setGeneratedPosts([]);
    setSelected(new Set());
    setSelectedImageIndex(null);
    setSelectedTextIndex(null);

    // Build targeting object - use suggestions when in auto mode
    const targeting: ContentTargeting = {};

    // Hook: use selected if specific mode, otherwise use suggestion
    if (hookMode === "specific" && selectedHook) {
      targeting.hook = selectedHook;
    } else if (suggestions?.suggestedHook) {
      targeting.hook = suggestions.suggestedHook;
    }

    // Pillar: use selected or suggestion
    if (selectedPillar) {
      targeting.pillar = selectedPillar;
    } else if (suggestions?.suggestedPillar) {
      targeting.pillar = suggestions.suggestedPillar;
    }

    // Target type/value: use selected or auto-pick from suggestions
    if (targetType && targetValue) {
      targeting.targetType = targetType;
      targeting.targetValue = targetValue;
    } else if (!targetType && suggestions) {
      // Auto-rotate through pain/desire/objection based on least used
      const painCount = Object.values(suggestions.usageStats.pains).reduce((a, b) => a + b, 0);
      const desireCount = Object.values(suggestions.usageStats.desires).reduce((a, b) => a + b, 0);
      const objectionCount = Object.values(suggestions.usageStats.objections).reduce((a, b) => a + b, 0);

      // Pick the category with least total usage
      const minCount = Math.min(painCount, desireCount, objectionCount);
      if (minCount === painCount && suggestions.suggestedPain) {
        targeting.targetType = "pain";
        targeting.targetValue = suggestions.suggestedPain;
      } else if (minCount === desireCount && suggestions.suggestedDesire) {
        targeting.targetType = "desire";
        targeting.targetValue = suggestions.suggestedDesire;
      } else if (suggestions.suggestedObjection) {
        targeting.targetType = "objection";
        targeting.targetValue = suggestions.suggestedObjection;
      }
    }

    try {
      const formData = new FormData();
      formData.append(
        "data",
        JSON.stringify({
          productId,
          contentType,
          count,
          platform,
          targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
        })
      );
      for (const file of screenshots) {
        formData.append("screenshots", file);
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Generation failed");
      }

      const data = await res.json();
      const posts = data.posts || [];
      setGeneratedPosts(posts);
      // Select all by default
      setSelected(new Set(posts.map((_: unknown, i: number) => i)));
      // Refresh suggestions after generation
      fetchSuggestions(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate content");
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (selected.size === 0) return;

    setSaving(true);

    try {
      const postsToSave = generatedPosts.filter((_, i) => selected.has(i));

      for (const post of postsToSave) {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            type: contentType,
            content: post.content,
            hashtags: post.hashtags,
            mediaUrl: post.mediaUrl,
            publicMediaUrl: post.publicMediaUrl,
            status: "draft",
            hookUsed: post.metadata?.hookUsed,
            pillarUsed: post.metadata?.pillarUsed,
            targetType: post.metadata?.targetType,
            targetValue: post.metadata?.targetValue,
            toneConstraints: post.metadata?.toneConstraints,
            visualDirection: post.metadata?.visualDirection,
          }),
        });
      }

      router.push(`/content?product=${productId}`);
    } catch (e) {
      alert("Failed to save posts");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

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
    if (selected.size === generatedPosts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(generatedPosts.map((_, i) => i)));
    }
  }

  function handleMixClick(index: number, type: "image" | "text") {
    if (type === "image") {
      setSelectedImageIndex((prev) => (prev === index ? null : index));
    } else {
      setSelectedTextIndex((prev) => (prev === index ? null : index));
    }
  }

  function buildComposedPost(): ComposedPost | null {
    if (selectedTextIndex === null) return null;
    const textPost = generatedPosts[selectedTextIndex];
    const imagePost = selectedImageIndex !== null ? generatedPosts[selectedImageIndex] : null;

    return {
      textSourceIndex: selectedTextIndex,
      imageSourceIndex: selectedImageIndex,
      content: textPost.content,
      hashtags: textPost.hashtags,
      mediaUrl: imagePost?.mediaUrl ?? null,
      publicMediaUrl: imagePost?.publicMediaUrl ?? null,
      metadata: {
        hookUsed: textPost.metadata?.hookUsed,
        pillarUsed: textPost.metadata?.pillarUsed,
        targetType: textPost.metadata?.targetType,
        targetValue: textPost.metadata?.targetValue,
        toneConstraints: textPost.metadata?.toneConstraints,
        visualDirection: imagePost?.metadata?.visualDirection ?? textPost.metadata?.visualDirection,
      },
    };
  }

  function addToQueue() {
    const composed = buildComposedPost();
    if (!composed) return;
    setCompositionQueue((prev) => [...prev, composed]);
    setSelectedImageIndex(null);
    setSelectedTextIndex(null);
  }

  function removeFromQueue(index: number) {
    setCompositionQueue((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveCompositions() {
    if (compositionQueue.length === 0) return;
    setSaving(true);
    try {
      for (const post of compositionQueue) {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            type: contentType,
            content: post.content,
            hashtags: post.hashtags,
            mediaUrl: post.mediaUrl,
            publicMediaUrl: post.publicMediaUrl,
            status: "draft",
            hookUsed: post.metadata?.hookUsed,
            pillarUsed: post.metadata?.pillarUsed,
            targetType: post.metadata?.targetType,
            targetValue: post.metadata?.targetValue,
            toneConstraints: post.metadata?.toneConstraints,
            visualDirection: post.metadata?.visualDirection,
          }),
        });
      }
      router.push(`/content?product=${productId}`);
    } catch (e) {
      alert("Failed to save compositions");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Generate Content</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Add a product first</p>
            <Link href="/products/new" className="text-blue-600 hover:text-blue-800">
              Add product
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Generation form */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Product selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product
                  </label>
                  <select
                    value={productId || ""}
                    onChange={(e) => setProductId(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Platform */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => {
                      const p = e.target.value as PlatformType;
                      setPlatform(p);
                      // Reset content type to first available for new platform
                      setContentType(contentTypesByPlatform[p][0].value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    {platformTypes.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Content Type
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as ContentType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    {contentTypesByPlatform[platform].map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Count */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>

              {/* Targeting Controls */}
              {suggestions && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Targeting</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Hook selector */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Hook
                      </label>
                      {suggestions.suggestedHook && hookMode === "auto" && (
                        <div
                          className="mb-2 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1.5 rounded leading-relaxed"
                          title={suggestions.suggestedHook}
                        >
                          <span className="font-medium">Suggested:</span> {suggestions.suggestedHook}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={hookMode}
                          onChange={(e) => setHookMode(e.target.value as "auto" | "specific")}
                          className="px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        >
                          <option value="auto">Auto</option>
                          <option value="specific">Pick</option>
                        </select>
                        {hookMode === "specific" && (
                          <select
                            value={selectedHook}
                            onChange={(e) => setSelectedHook(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                          >
                            <option value="">Select hook...</option>
                            {suggestions.available.hooks.map((h) => (
                              <option key={h} value={h} title={h}>
                                {h} ({suggestions.usageStats.hooks[h] || 0}x)
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Pillar selector */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Content Pillar
                      </label>
                      {suggestions.suggestedPillar && !selectedPillar && (
                        <div
                          className="mb-2 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1.5 rounded leading-relaxed"
                          title={suggestions.suggestedPillar}
                        >
                          <span className="font-medium">Suggested:</span> {suggestions.suggestedPillar}
                        </div>
                      )}
                      <select
                        value={selectedPillar}
                        onChange={(e) => setSelectedPillar(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      >
                        <option value="">Auto</option>
                        {suggestions.available.pillars.map((p) => (
                          <option key={p} value={p}>
                            {p} ({suggestions.usageStats.pillars[p] || 0}x)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Target type */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Focus On
                      </label>
                      <select
                        value={targetType}
                        onChange={(e) => {
                          setTargetType(e.target.value as TargetType | "");
                          setTargetValue("");
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      >
                        {targetTypes.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Target value */}
                    {targetType && (
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          {targetType === "pain" ? "Pain Point" : targetType === "desire" ? "Desire" : "Objection"}
                        </label>
                        {/* Show suggestion when no value selected */}
                        {!targetValue && (
                          (targetType === "pain" && suggestions.suggestedPain) ||
                          (targetType === "desire" && suggestions.suggestedDesire) ||
                          (targetType === "objection" && suggestions.suggestedObjection)
                        ) && (
                          <div
                            className="mb-2 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1.5 rounded leading-relaxed"
                            title={
                              targetType === "pain" ? suggestions.suggestedPain || "" :
                              targetType === "desire" ? suggestions.suggestedDesire || "" :
                              suggestions.suggestedObjection || ""
                            }
                          >
                            <span className="font-medium">Suggested:</span>{" "}
                            {targetType === "pain" && suggestions.suggestedPain}
                            {targetType === "desire" && suggestions.suggestedDesire}
                            {targetType === "objection" && suggestions.suggestedObjection}
                          </div>
                        )}
                        <select
                          value={targetValue}
                          onChange={(e) => setTargetValue(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        >
                          <option value="">Select...</option>
                          {targetType === "pain" &&
                            suggestions.available.pains.map((p) => (
                              <option key={p} value={p} title={p}>
                                {p} ({suggestions.usageStats.pains[p] || 0}x)
                              </option>
                            ))}
                          {targetType === "desire" &&
                            suggestions.available.desires.map((d) => (
                              <option key={d} value={d} title={d}>
                                {d} ({suggestions.usageStats.desires[d] || 0}x)
                              </option>
                            ))}
                          {targetType === "objection" &&
                            suggestions.available.objections.map((o) => (
                              <option key={o.objection} value={o.objection} title={o.objection}>
                                {o.objection} ({suggestions.usageStats.objections[o.objection] || 0}x)
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Screenshot Upload */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reference Screenshots (optional)
                </label>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleScreenshotUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {screenshotPreviews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {screenshotPreviews.map((src, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={src}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(i)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !productId}
                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate"}
              </button>

              {error && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-red-500 text-sm leading-5 flex-shrink-0">!</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-600 text-sm flex-shrink-0"
                  >
                    x
                  </button>
                </div>
              )}
            </div>

            {/* Generated content */}
            {generatedPosts.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">
                    Generated Content ({generatedPosts.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMixMode((v) => !v)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        mixMode
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Mix & Match
                    </button>
                    {!mixMode && (
                      <>
                        <button
                          onClick={toggleAll}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          {selected.size === generatedPosts.length ? "Deselect All" : "Select All"}
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving || selected.size === 0}
                          className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : `Save ${selected.size} to Queue`}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generatedPosts.map((post, i) =>
                    mixMode ? (
                      <div
                        key={i}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        {/* Image area */}
                        {post.mediaUrl ? (
                          <div
                            onClick={() => handleMixClick(i, "image")}
                            className={`aspect-square bg-gray-100 relative cursor-pointer transition-all ${
                              selectedImageIndex === i
                                ? "ring-2 ring-green-500 ring-inset"
                                : "hover:ring-1 hover:ring-green-300 hover:ring-inset"
                            }`}
                          >
                            <img
                              src={post.mediaUrl}
                              alt="Generated"
                              className="w-full h-full object-cover"
                            />
                            {selectedImageIndex === i && (
                              <span className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded">
                                Image
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="h-20 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                            No image
                          </div>
                        )}
                        {/* Text area */}
                        <div
                          onClick={() => handleMixClick(i, "text")}
                          className={`p-3 cursor-pointer transition-all ${
                            selectedTextIndex === i
                              ? "ring-2 ring-blue-500 ring-inset bg-blue-50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          {selectedTextIndex === i && (
                            <span className="inline-block mb-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded">
                              Text
                            </span>
                          )}
                          <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-4">
                            {post.content}
                          </p>
                          {post.hashtags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {post.hashtags.map((tag, j) => (
                                <span key={j} className="text-xs text-blue-600">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={i}
                        onClick={() => toggleSelect(i)}
                        className={`border rounded-lg cursor-pointer transition-colors overflow-hidden ${
                          selected.has(i)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {post.mediaUrl && (
                          <div className="aspect-square bg-gray-100 relative">
                            <img
                              src={post.mediaUrl}
                              alt="Generated"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2">
                              <input
                                type="checkbox"
                                checked={selected.has(i)}
                                onChange={() => toggleSelect(i)}
                                className="w-5 h-5"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        )}
                        <div className="p-3">
                          {!post.mediaUrl && (
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggleSelect(i)}
                              className="mr-2"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <p className="text-sm text-gray-900 whitespace-pre-wrap">
                            {post.content}
                          </p>
                          {post.hashtags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {post.hashtags.map((tag, j) => (
                                <span key={j} className="text-xs text-blue-600">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Composition preview */}
                {mixMode && (selectedTextIndex !== null || selectedImageIndex !== null) && (
                  <div className="mt-4 p-4 border border-purple-200 bg-purple-50 rounded-lg">
                    <h3 className="text-sm font-medium text-purple-900 mb-3">Composition Preview</h3>
                    <div className="flex gap-4 items-start">
                      {/* Image thumbnail */}
                      <div className="w-32 h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                        {selectedImageIndex !== null && generatedPosts[selectedImageIndex]?.mediaUrl ? (
                          <img
                            src={generatedPosts[selectedImageIndex].mediaUrl!}
                            alt="Selected"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                            No image
                          </div>
                        )}
                      </div>
                      {/* Text preview */}
                      <div className="flex-1 min-w-0">
                        {selectedTextIndex !== null ? (
                          <>
                            <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-4">
                              {generatedPosts[selectedTextIndex].content}
                            </p>
                            {generatedPosts[selectedTextIndex].hashtags?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {generatedPosts[selectedTextIndex].hashtags.map((tag, j) => (
                                  <span key={j} className="text-xs text-blue-600">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Select a text source</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={addToQueue}
                      disabled={selectedTextIndex === null}
                      className="mt-3 px-4 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      Add to Queue
                    </button>
                  </div>
                )}

                {/* Composition queue */}
                {compositionQueue.length > 0 && (
                  <div className="mt-4 p-4 border border-gray-200 bg-gray-50 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Composition Queue ({compositionQueue.length})
                    </h3>
                    <div className="space-y-2">
                      {compositionQueue.map((comp, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200"
                        >
                          <div className="w-10 h-10 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                            {comp.mediaUrl ? (
                              <img
                                src={comp.mediaUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                                --
                              </div>
                            )}
                          </div>
                          <p className="flex-1 text-sm text-gray-700 truncate">
                            {comp.content}
                          </p>
                          <button
                            onClick={() => removeFromQueue(i)}
                            className="text-red-500 hover:text-red-700 text-sm flex-shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleSaveCompositions}
                      disabled={saving}
                      className="mt-3 px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : `Save ${compositionQueue.length} to Queue`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
