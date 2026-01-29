"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product } from "../../../drizzle/schema";
import type { TargetType, ContentTargeting } from "@/lib/brain/types";

type ContentType = "reel" | "post" | "carousel";

interface GeneratedPost {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  metadata?: {
    hookUsed?: string;
    pillarUsed?: string;
    targetType?: string;
    targetValue?: string;
    toneConstraints?: string[];
    visualDirection?: string;
  };
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

const contentTypes: { value: ContentType; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
];

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

  // Form
  const [productId, setProductId] = useState<number | null>(null);
  const [contentType, setContentType] = useState<ContentType>("post");
  const [count, setCount] = useState(5);

  // Targeting
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [hookMode, setHookMode] = useState<"auto" | "specific">("auto");
  const [selectedHook, setSelectedHook] = useState<string>("");
  const [selectedPillar, setSelectedPillar] = useState<string>("");
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const [targetValue, setTargetValue] = useState<string>("");

  // Results
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

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
    setGeneratedPosts([]);
    setSelected(new Set());

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
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          contentType,
          count,
          platform: "instagram",
          targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");

      const data = await res.json();
      const posts = data.posts || [];
      setGeneratedPosts(posts);
      // Select all by default
      setSelected(new Set(posts.map((_: unknown, i: number) => i)));
      // Refresh suggestions after generation
      fetchSuggestions(productId);
    } catch (e) {
      alert("Failed to generate content");
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    {contentTypes.map((ct) => (
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

              <button
                onClick={handleGenerate}
                disabled={generating || !productId}
                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate"}
              </button>
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
                  </div>
                </div>

                <div className="space-y-4">
                  {generatedPosts.map((post, i) => (
                    <div
                      key={i}
                      onClick={() => toggleSelect(i)}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selected.has(i)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="mt-1"
                        />
                        <div className="flex-1">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
