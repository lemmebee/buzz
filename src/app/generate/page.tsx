"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Product } from "../../../drizzle/schema";
import type { TargetType, ContentTargeting } from "@/lib/brain/types";
import { Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Presets, presets } from "@/components/generate/Presets";
import { TargetingSection } from "@/components/generate/TargetingSection";
import { GeneratedResults } from "@/components/generate/GeneratedResults";
import { GenerationProgress } from "@/components/generate/GenerationProgress";
import {
  type PlatformType,
  type ContentType,
  type MediaTypeUi,
  type FormConfig,
  type GeneratedPost,
  type Suggestions,
  CONFIG_DEFAULTS,
  ASPECT_OPTIONS,
  contentTypesByPlatform,
} from "@/components/generate/types";

export default function GeneratePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const jobIdRef = useRef<string | null>(null);

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
    setGeneratedPosts([]);

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

      const { jobId } = await res.json();
      jobIdRef.current = jobId;

      // Poll for job progress. Results are written incrementally, so we render
      // each variation as soon as it finishes rather than waiting for the batch.
      // Creative Remotion renders can run several minutes, so the window must
      // comfortably exceed render time — the job runs server-side regardless.
      const pollInterval = 2000; // 2 seconds
      const maxAttempts = 450; // 15 minutes max
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;

        const statusRes = await fetch(`/api/jobs/${jobId}`);
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();

        // Stream partial posts to the UI on every poll.
        if (Array.isArray(statusData.posts)) {
          setGeneratedPosts(statusData.posts);
        }

        if (statusData.status === "completed" || statusData.status === "cancelled") {
          const posts = statusData.posts || [];
          const genErrors = statusData.errors || [];
          setGeneratedPosts(posts);
          fetchSuggestions(productId);
          if (statusData.status === "cancelled") {
            toast.success(`Cancelled — kept ${posts.length} generated`);
          } else {
            toast.success(`Generated ${posts.length} posts`);
          }
          if (genErrors.length > 0) {
            toast.error(`${genErrors.length} variation(s) failed: ${genErrors[0].message}`, { duration: 8000 });
          }
          return;
        }

        if (statusData.status === "failed") {
          throw new Error(statusData.error || "Generation failed");
        }
      }

      throw new Error("Generation timed out");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate content");
      console.error(e);
    } finally {
      setGenerating(false);
      setCancelling(false);
      jobIdRef.current = null;
    }
  }

  async function handleCancel() {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      toast.info("Cancelling — finishing the current one, keeping what's done");
    } catch {
      setCancelling(false);
      toast.error("Failed to cancel");
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
          <Presets onApply={applyPreset} />

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
                      <div className="md:col-span-3">
                        <label className="block text-sm text-text-tertiary mb-1">Video Style</label>
                        <select
                          value={config.videoStyle ?? "scenes"}
                          onChange={(e) =>
                            setConfig({ ...config, videoStyle: e.target.value as "scenes" | "typography" | "creative" })
                          }
                          className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
                        >
                          <option value="scenes">Multi-scene — storyboard of AI scenes (default)</option>
                          <option value="typography">Typography — single background + animated narration text</option>
                          <option value="creative">Creative — AI designs the whole video (unique each time)</option>
                        </select>
                        {(config.videoStyle === "typography" || config.videoStyle === "creative") && (
                          <p className="mt-1 text-xs text-text-tertiary">
                            {config.videoStyle === "creative"
                              ? "Requires the Remotion engine (Settings → Default Video Engine). The AI composes a bespoke video — scenes, motion, text, color — per product. Falls back to multi-scene if it can't."
                              : "Best with the Remotion engine (Settings → Default Video Engine). Narration is shown as large animated text synced to the voiceover."}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Targeting */}
                {suggestions && (
                  <TargetingSection
                    suggestions={suggestions}
                    hookMode={hookMode}
                    setHookMode={setHookMode}
                    selectedHook={selectedHook}
                    setSelectedHook={setSelectedHook}
                    selectedPillar={selectedPillar}
                    setSelectedPillar={setSelectedPillar}
                    targetType={targetType}
                    setTargetType={setTargetType}
                    targetValue={targetValue}
                    setTargetValue={setTargetValue}
                  />
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
                    className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary-hover"
                  />
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {screenshotPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <Image
                            src={src}
                            alt={`Screenshot ${i + 1}`}
                            width={0}
                            height={0}
                            sizes="25vw"
                            unoptimized
                            className="w-full aspect-square object-cover rounded-lg border border-border"
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

            {/* Generate / Cancel Buttons */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating || !productId}
                className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {generating ? "Generating..." : "Generate"}
              </button>
              {generating && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-md border border-error px-4 py-3 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>

            {/* Progress */}
            <GenerationProgress isGenerating={generating} />
          </div>

          {/* Results */}
          {generatedPosts.length > 0 && (
            <GeneratedResults
              posts={generatedPosts}
              productId={productId}
              contentType={contentType}
            />
          )}
        </div>
      )}
    </div>
  );
}
