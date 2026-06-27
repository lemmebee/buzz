"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Product } from "../../../drizzle/schema";
import type { TargetType, ContentTargeting } from "@/lib/brain/types";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Sparkles, Settings2, Image as ImageIcon, Video, ChevronDown, ChevronUp, Zap } from "lucide-react";

type PlatformType = "instagram" | "twitter";
type ContentType = "reel" | "post" | "story" | "ad";
type MediaTypeUi = "image" | "video";

interface FormConfig {
  durationSec?: number;
  aspectRatio: string;
  captions?: boolean;
}

const CONFIG_DEFAULTS: Record<ContentType, Record<MediaTypeUi, FormConfig>> = {
  reel: {
    video: { durationSec: 15, aspectRatio: "9:16", captions: true },
    image: { aspectRatio: "9:16" },
  },
  post: {
    image: { aspectRatio: "1:1" },
    video: { durationSec: 30, aspectRatio: "1:1", captions: false },
  },
  story: {
    image: { aspectRatio: "9:16" },
    video: { durationSec: 15, aspectRatio: "9:16", captions: false },
  },
  ad: {
    image: { aspectRatio: "1:1" },
    video: { durationSec: 15, aspectRatio: "1:1", captions: true },
  },
};

const ASPECT_OPTIONS = ["1:1", "9:16", "4:5", "16:9"];

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

const presets = [
  {
    id: "quick-post",
    name: "Quick Post",
    description: "Single image post, auto-targeting",
    icon: Zap,
    config: {
      platform: "instagram" as PlatformType,
      mediaType: "image" as MediaTypeUi,
      contentType: "post" as ContentType,
      count: 3,
      aspectRatio: "1:1",
    },
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    description: "Highlight product features",
    icon: Sparkles,
    config: {
      platform: "instagram" as PlatformType,
      mediaType: "image" as MediaTypeUi,
      contentType: "post" as ContentType,
      count: 5,
      aspectRatio: "1:1",
    },
  },
  {
    id: "story-batch",
    name: "Story Batch",
    description: "Vertical stories for engagement",
    icon: ImageIcon,
    config: {
      platform: "instagram" as PlatformType,
      mediaType: "image" as MediaTypeUi,
      contentType: "story" as ContentType,
      count: 5,
      aspectRatio: "9:16",
    },
  },
  {
    id: "reel-set",
    name: "Reel Set",
    description: "Video reels with captions",
    icon: Video,
    config: {
      platform: "instagram" as PlatformType,
      mediaType: "video" as MediaTypeUi,
      contentType: "reel" as ContentType,
      count: 3,
      aspectRatio: "9:16",
      durationSec: 15,
      captions: true,
    },
  },
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
  const [mediaType, setMediaType] = useState<MediaTypeUi>("image");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [config, setConfig] = useState<FormConfig>(CONFIG_DEFAULTS.post.image);
  const [count, setCount] = useState(5);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Mix & Match
  const [mixMode, setMixMode] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);

  useEffect(() => {
    const surfaceMap = CONFIG_DEFAULTS[contentType];
    const next = surfaceMap?.[mediaType];
    if (next) setConfig({ ...next });
  }, [mediaType, contentType]);

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
      setSelectedHook("");
      setSelectedPillar("");
      setTargetType("");
      setTargetValue("");
    }
  }, [productId, fetchSuggestions]);

  function applyPreset(preset: typeof presets[0]) {
    setPlatform(preset.config.platform);
    setMediaType(preset.config.mediaType);
    setContentType(preset.config.contentType);
    setCount(preset.config.count);
    setConfig({
      aspectRatio: preset.config.aspectRatio,
      durationSec: preset.config.durationSec,
      captions: preset.config.captions,
    });
  }

  async function handleGenerate() {
    if (!productId) return;

    setGenerating(true);
    setError(null);
    setGeneratedPosts([]);
    setSelected(new Set());
    setSelectedImageIndex(null);
    setSelectedTextIndex(null);

    const targeting: ContentTargeting = {};

    if (hookMode === "specific" && selectedHook) {
      targeting.hook = selectedHook;
    } else if (suggestions?.suggestedHook) {
      targeting.hook = suggestions.suggestedHook;
    }

    if (selectedPillar) {
      targeting.pillar = selectedPillar;
    } else if (suggestions?.suggestedPillar) {
      targeting.pillar = suggestions.suggestedPillar;
    }

    if (targetType && targetValue) {
      targeting.targetType = targetType;
      targeting.targetValue = targetValue;
    } else if (!targetType && suggestions) {
      const painCount = Object.values(suggestions.usageStats.pains).reduce((a, b) => a + b, 0);
      const desireCount = Object.values(suggestions.usageStats.desires).reduce((a, b) => a + b, 0);
      const objectionCount = Object.values(suggestions.usageStats.objections).reduce((a, b) => a + b, 0);

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
          mediaType,
          targetSurface: contentType,
          config,
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
      setSelected(new Set(posts.map((_: unknown, i: number) => i)));
      fetchSuggestions(productId);
      toast.success(`Generated ${posts.length} posts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate content");
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

      toast.success(`${selected.size} post${selected.size > 1 ? "s" : ""} saved to queue`);
      router.push(`/content?product=${productId}`);
    } catch (e) {
      toast.error("Failed to save posts");
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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-border rounded" />
          <div className="h-32 bg-border rounded-lg" />
          <div className="h-64 bg-border rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Generate Content</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Create AI-powered content for your products
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-text-secondary mb-4">Add a product first to start generating content</p>
          <button
            onClick={() => router.push("/products/new")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Add Product
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Presets */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-text-primary mb-3">Quick Presets</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {presets.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-background"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-text-primary">{preset.name}</div>
                      <div className="text-xs text-text-tertiary">{preset.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Form */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Product
                </label>
                <select
                  value={productId || ""}
                  onChange={(e) => setProductId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
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
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => {
                    const p = e.target.value as PlatformType;
                    setPlatform(p);
                    setContentType(contentTypesByPlatform[p][0].value);
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                >
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter/X</option>
                </select>
              </div>

              {/* Media Type */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Media Type
                </label>
                <select
                  value={mediaType}
                  onChange={(e) => {
                    const next = e.target.value as MediaTypeUi;
                    setMediaType(next);
                    if (next === "image" && contentType === "reel") {
                      setContentType("post");
                    }
                  }}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>

              {/* Content Type */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Content Type
                </label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                >
                  {contentTypesByPlatform[platform]
                    .filter((ct) => !(ct.value === "reel" && mediaType === "image"))
                    .map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                </select>
              </div>

              {/* Count */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                />
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              <Settings2 className="h-4 w-4" />
              Advanced Settings
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="mt-4 pt-4 border-t border-border space-y-4">
                {/* Config */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-text-tertiary mb-1">Aspect Ratio</label>
                    <select
                      value={config.aspectRatio}
                      onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                    >
                      {ASPECT_OPTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  {mediaType === "video" && (
                    <>
                      <div>
                        <label className="block text-sm text-text-tertiary mb-1">Duration (sec)</label>
                        <input
                          type="number"
                          min={5}
                          max={90}
                          value={config.durationSec ?? 15}
                          onChange={(e) =>
                            setConfig({ ...config, durationSec: parseInt(e.target.value) || 15 })
                          }
                          className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-text-secondary">
                          <input
                            type="checkbox"
                            checked={config.captions ?? false}
                            onChange={(e) => setConfig({ ...config, captions: e.target.checked })}
                            className="rounded"
                          />
                          Burn-in captions
                        </label>
                      </div>
                    </>
                  )}
                </div>

                {/* Targeting */}
                {suggestions && (
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-sm font-medium text-text-primary mb-3">Targeting</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Hook */}
                      <div>
                        <label className="block text-sm text-text-tertiary mb-1">Hook</label>
                        {suggestions.suggestedHook && hookMode === "auto" && (
                          <div className="mb-2 text-xs text-success bg-success-bg border border-success-bg px-2 py-1.5 rounded">
                            <span className="font-medium">Suggested:</span> {suggestions.suggestedHook}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <select
                            value={hookMode}
                            onChange={(e) => setHookMode(e.target.value as "auto" | "specific")}
                            className="px-2 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                          >
                            <option value="auto">Auto</option>
                            <option value="specific">Pick</option>
                          </select>
                          {hookMode === "specific" && (
                            <select
                              value={selectedHook}
                              onChange={(e) => setSelectedHook(e.target.value)}
                              className="flex-1 px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
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

                      {/* Pillar */}
                      <div>
                        <label className="block text-sm text-text-tertiary mb-1">Content Pillar</label>
                        {suggestions.suggestedPillar && !selectedPillar && (
                          <div className="mb-2 text-xs text-success bg-success-bg border border-success-bg px-2 py-1.5 rounded">
                            <span className="font-medium">Suggested:</span> {suggestions.suggestedPillar}
                          </div>
                        )}
                        <select
                          value={selectedPillar}
                          onChange={(e) => setSelectedPillar(e.target.value)}
                          className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                        >
                          <option value="">Auto</option>
                          {suggestions.available.pillars.map((p) => (
                            <option key={p} value={p}>
                              {p} ({suggestions.usageStats.pillars[p] || 0}x)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Target Type */}
                      <div>
                        <label className="block text-sm text-text-tertiary mb-1">Focus On</label>
                        <select
                          value={targetType}
                          onChange={(e) => {
                            setTargetType(e.target.value as TargetType | "");
                            setTargetValue("");
                          }}
                          className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                        >
                          <option value="">Auto</option>
                          <option value="pain">Pain Point</option>
                          <option value="desire">Desire</option>
                          <option value="objection">Objection</option>
                        </select>
                      </div>

                      {/* Target Value */}
                      {targetType && (
                        <div>
                          <label className="block text-sm text-text-tertiary mb-1">
                            {targetType === "pain" ? "Pain Point" : targetType === "desire" ? "Desire" : "Objection"}
                          </label>
                          {!targetValue && (
                            (targetType === "pain" && suggestions.suggestedPain) ||
                            (targetType === "desire" && suggestions.suggestedDesire) ||
                            (targetType === "objection" && suggestions.suggestedObjection)
                          ) && (
                            <div className="mb-2 text-xs text-success bg-success-bg border border-success-bg px-2 py-1.5 rounded">
                              <span className="font-medium">Suggested:</span>{" "}
                              {targetType === "pain" && suggestions.suggestedPain}
                              {targetType === "desire" && suggestions.suggestedDesire}
                              {targetType === "objection" && suggestions.suggestedObjection}
                            </div>
                          )}
                          <select
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                            className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
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

                {/* Screenshots */}
                <div className="pt-4 border-t border-border">
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Reference Screenshots (optional)
                  </label>
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      setScreenshots((prev) => [...prev, ...files]);
                      const newPreviews = files.map((f) => URL.createObjectURL(f));
                      setScreenshotPreviews((prev) => [...prev, ...newPreviews]);
                      if (screenshotInputRef.current) screenshotInputRef.current.value = "";
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {screenshotPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={src}
                            alt={`Screenshot ${i + 1}`}
                            className="w-full aspect-square object-cover rounded-lg border border-border cursor-pointer"
                            onClick={() => setLightboxSrc(src)}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(screenshotPreviews[i]);
                              setScreenshots((prev) => prev.filter((_, idx) => idx !== i));
                              setScreenshotPreviews((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="absolute top-1 right-1 w-5 h-5 bg-error text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={generating || !productId}
              className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                "Generate"
              )}
            </button>

            {error && (
              <div className="mt-3 rounded-md bg-error-bg border border-error-bg p-3">
                <p className="text-sm text-error">{error}</p>
              </div>
            )}
          </div>

          {/* Results */}
          {generatedPosts.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-text-primary">
                  Generated Content ({generatedPosts.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMixMode(!mixMode)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      mixMode
                        ? "bg-primary text-white"
                        : "bg-background text-text-secondary hover:bg-border"
                    }`}
                  >
                    {mixMode ? "Mix Mode On" : "Mix & Match"}
                  </button>
                  {!mixMode && (
                    <>
                      <button
                        onClick={toggleAll}
                        className="text-sm text-text-secondary hover:text-text-primary"
                      >
                        {selected.size === generatedPosts.length ? "Deselect All" : "Select All"}
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || selected.size === 0}
                        className="px-4 py-1.5 bg-success text-white text-sm font-medium rounded-lg hover:bg-success/90 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : `Save ${selected.size} to Queue`}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {generatedPosts.map((post, i) => (
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
                          <img
                            src={post.mediaUrl!}
                            alt="Generated"
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
                    <div className="w-32 h-32 flex-shrink-0 bg-background rounded-lg overflow-hidden">
                      {selectedImageIndex !== null && generatedPosts[selectedImageIndex]?.mediaUrl ? (
                        <img
                          src={generatedPosts[selectedImageIndex].mediaUrl!}
                          alt="Selected"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setLightboxSrc(generatedPosts[selectedImageIndex].mediaUrl!)}
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
                            {generatedPosts[selectedTextIndex].content}
                          </p>
                          {generatedPosts[selectedTextIndex].hashtags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {generatedPosts[selectedTextIndex].hashtags.map((tag, j) => (
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
                    onClick={() => {
                      if (selectedTextIndex === null) return;
                      const textPost = generatedPosts[selectedTextIndex];
                      const imagePost = selectedImageIndex !== null ? generatedPosts[selectedImageIndex] : null;

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
                    }}
                    disabled={selectedTextIndex === null}
                    className="mt-3 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
                  >
                    Save Composition
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

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
