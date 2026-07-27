"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { DiscordSetup } from "@/components/DiscordSetup";
import { ThemeToggle } from "@/components/ThemeToggle";

interface InstagramAccountWithProducts {
  id: number;
  username: string;
  tokenExpiresAt: string;
  linkedProducts: { id: number; name: string }[];
}

const TEXT_PROVIDERS = [
  { value: "gemini", label: "Gemini — gemini-2.5-flash" },
  { value: "gemini-flash-lite", label: "Gemini — gemini-2.5-flash-lite" },
  { value: "huggingface", label: "HuggingFace — GLM-4.5V" },
  { value: "antigravity", label: "Antigravity (local CLI)" },
  { value: "claude-code", label: "Claude Code (local CLI)" },
];

// A single API-key field. When a key is already saved it shows an unmistakable
// "✓ Configured" badge (the value never leaves the server) with a Replace
// action; otherwise it shows the input + Save.
function ApiKeyField({
  label,
  configured,
  value,
  onChange,
  onSave,
  saving,
  placeholder,
}: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const showInput = !configured || editing;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        {configured && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            ✓ Configured
          </span>
        )}
      </div>
      {showInput ? (
        <>
          <input
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={configured ? "Enter a new key to replace" : placeholder}
            className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onSave();
                setEditing(false);
              }}
              disabled={!value.trim() || saving}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {configured && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setEditing(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border-strong text-text-secondary hover:bg-primary/10"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border-strong text-text-secondary hover:bg-primary/10"
        >
          Replace key
        </button>
      )}
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<InstagramAccountWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [textProvider, setTextProvider] = useState("gemini");
  const [antigravityModel, setAntigravityModel] = useState("");
  const [antigravityModels, setAntigravityModels] = useState<string[]>([]);
  const [claudeCodeModel, setClaudeCodeModel] = useState("");
  const [claudeCodeModels, setClaudeCodeModels] = useState<string[]>([]);
  const [providerSaving, setProviderSaving] = useState(false);
  const [imageProvider, setImageProvider] = useState("pollinations");
  const [imageModel, setImageModel] = useState("black-forest-labs/FLUX.1-schnell");
  const [imageStyle, setImageStyle] = useState("product");
  const [videoProvider, setVideoProvider] = useState("ffmpeg");
  const [contentEngine, setContentEngine] = useState("buzz");
  const [higgsfieldImageModel, setHiggsfieldImageModel] = useState("");
  const [higgsfieldVideoModel, setHiggsfieldVideoModel] = useState("");
  const [higgsfieldImageModels, setHiggsfieldImageModels] = useState<Array<{id: string; name?: string; baseCredits?: number; aspect_ratios?: string[]; medias?: Array<{roles: string[]; max?: number; required?: boolean}>}>>([]);
  const [higgsfieldVideoModels, setHiggsfieldVideoModels] = useState<Array<{id: string; name?: string; baseCredits?: number; aspect_ratios?: string[]; durations?: number[]; medias?: Array<{roles: string[]; max?: number; required?: boolean}>}>>([]);
  const [higgsfieldModelsFetchedAt, setHiggsfieldModelsFetchedAt] = useState<string | null>(null);
  const [higgsfieldModelsRefreshing, setHiggsfieldModelsRefreshing] = useState(false);
  const [checkingCostFor, setCheckingCostFor] = useState<string | null>(null);
  const [antigravityBin, setAntigravityBin] = useState("");
  const [antigravityModelSetting, setAntigravityModelSetting] = useState("");
  const [claudeCodeBin, setClaudeCodeBin] = useState("");
  const [claudeCodeModelSetting, setClaudeCodeModelSetting] = useState("");
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const sectionParam = searchParams.get("section") as SettingsTab | null;
  const [tab, setTabState] = useState<SettingsTab>(
    SETTINGS_TABS.some((t) => t.id === sectionParam) ? (sectionParam as SettingsTab) : "general"
  );

  // Reflect the section in the URL: a refresh, a bookmark, or a shared link
  // all land back on the same group instead of resetting to General.
  function setTab(next: SettingsTab) {
    setTabState(next);
    const params = new URLSearchParams(window.location.search);
    params.set("section", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [googleAiKey, setGoogleAiKey] = useState("");
  const [huggingfaceKey, setHuggingfaceKey] = useState("");
  const [pollinationsKey, setPollinationsKey] = useState("");
  const [googleAiKeySet, setGoogleAiKeySet] = useState(false);
  const [huggingfaceKeySet, setHuggingfaceKeySet] = useState(false);
  const [pollinationsKeySet, setPollinationsKeySet] = useState(false);
  const [keysSaving, setKeysSaving] = useState(false);

  const error = searchParams.get("error");
  const success = searchParams.get("success");

  useEffect(() => {
    fetchAccounts();
    fetchSettings();
    fetchHiggsfieldModels();
  }, []);

  async function fetchAccounts() {
    const res = await fetch("/api/instagram/accounts");
    const data = await res.json();
    setAccounts(data);
    setLoading(false);
  }

  async function fetchSettings() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.TEXT_PROVIDER) {
      const val = data.TEXT_PROVIDER;
      if (val === "antigravity" || val.startsWith("antigravity:")) {
        setTextProvider("antigravity");
        if (val.startsWith("antigravity:")) {
          setAntigravityModel(val.split(":").slice(1).join(":"));
        }
        fetchAntigravityModels();
      } else if (val === "claude-code" || val.startsWith("claude-code:")) {
        setTextProvider("claude-code");
        if (val.startsWith("claude-code:")) {
          setClaudeCodeModel(val.split(":").slice(1).join(":"));
        }
        fetchClaudeCodeModels();
      } else {
        setTextProvider(val);
      }
    }
    if (data.IMAGE_PROVIDER) {
      setImageProvider(data.IMAGE_PROVIDER);
    }
    if (data.IMAGE_MODEL_HUGGINGFACE) {
      setImageModel(data.IMAGE_MODEL_HUGGINGFACE);
    }
    if (data.IMAGE_STYLE) {
      setImageStyle(data.IMAGE_STYLE);
    }
    if (data.VIDEO_PROVIDER) {
      setVideoProvider(data.VIDEO_PROVIDER);
    }
    if (data.CONTENT_ENGINE) {
      setContentEngine(data.CONTENT_ENGINE);
    }
    if (data.HIGGSFIELD_IMAGE_MODEL) {
      setHiggsfieldImageModel(data.HIGGSFIELD_IMAGE_MODEL);
    }
    if (data.HIGGSFIELD_VIDEO_MODEL) {
      setHiggsfieldVideoModel(data.HIGGSFIELD_VIDEO_MODEL);
    }
    if (data.ANTIGRAVITY_BIN) {
      setAntigravityBin(data.ANTIGRAVITY_BIN);
    }
    if (data.ANTIGRAVITY_MODEL) {
      setAntigravityModelSetting(data.ANTIGRAVITY_MODEL);
    }
    if (data.CLAUDE_CODE_BIN) {
      setClaudeCodeBin(data.CLAUDE_CODE_BIN);
    }
    if (data.CLAUDE_CODE_MODEL) {
      setClaudeCodeModelSetting(data.CLAUDE_CODE_MODEL);
    }
    if (data.GOOGLE_AI_API_KEY) {
      setGoogleAiKeySet(true);
    }
    if (data.HUGGINGFACE_API_KEY) {
      setHuggingfaceKeySet(true);
    }
    if (data.POLLINATIONS_API_KEY) {
      setPollinationsKeySet(true);
    }
  }

  async function fetchAntigravityModels() {
    try {
      const res = await fetch("/api/settings/antigravity-models");
      if (res.ok) {
        const models = await res.json();
        setAntigravityModels(models);
      }
    } catch {
      // silently fail
    }
  }

  async function fetchClaudeCodeModels() {
    try {
      const res = await fetch("/api/settings/claude-code-models");
      if (res.ok) {
        const models = await res.json();
        setClaudeCodeModels(models);
      }
    } catch {
      // silently fail
    }
  }

  async function fetchHiggsfieldModels() {
    try {
      const res = await fetch("/api/settings/higgsfield-models");
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        setHiggsfieldModelsFetchedAt(data.fetchedAt);
        setHiggsfieldImageModels(
          models.filter((m: {output_type: string}) => m.output_type === "image")
            .sort((a: {baseCredits?: number}, b: {baseCredits?: number}) => (a.baseCredits ?? 999) - (b.baseCredits ?? 999))
        );
        setHiggsfieldVideoModels(
          models.filter((m: {output_type: string}) => m.output_type === "video")
            .sort((a: {baseCredits?: number}, b: {baseCredits?: number}) => (a.baseCredits ?? 999) - (b.baseCredits ?? 999))
        );
      }
    } catch {
      // silently fail
    }
  }

  async function refreshHiggsfieldModels() {
    setHiggsfieldModelsRefreshing(true);
    try {
      await fetch("/api/settings/higgsfield-models", { method: "POST" });
      // Poll until refresh is done (check fetchedAt changes)
      const startFetchedAt = higgsfieldModelsFetchedAt;
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch("/api/settings/higgsfield-models");
        if (res.ok) {
          const data = await res.json();
          if (data.fetchedAt && data.fetchedAt !== startFetchedAt) {
            await fetchHiggsfieldModels();
            break;
          }
        }
        attempts++;
      }
    } finally {
      setHiggsfieldModelsRefreshing(false);
    }
  }

  async function checkModelCost(modelId: string) {
    setCheckingCostFor(modelId);
    try {
      const res = await fetch(`/api/settings/higgsfield-models?costFor=${encodeURIComponent(modelId)}`);
      if (res.ok) {
        await fetchHiggsfieldModels();
      }
    } finally {
      setCheckingCostFor(null);
    }
  }

  async function updateTextProvider(value: string) {
    setTextProvider(value);
    if (value === "antigravity") {
      await fetchAntigravityModels();
      stage("TEXT_PROVIDER", antigravityModel ? `antigravity:${antigravityModel}` : "antigravity");
    } else if (value === "claude-code") {
      await fetchClaudeCodeModels();
      stage("TEXT_PROVIDER", claudeCodeModel ? `claude-code:${claudeCodeModel}` : "claude-code");
    } else {
      stage("TEXT_PROVIDER", value);
    }
  }

  async function updateAntigravityModel(model: string) {
    setAntigravityModel(model);
    setProviderSaving(true);
    const value = model ? `antigravity:${model}` : "antigravity";
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "TEXT_PROVIDER", value }),
    });
    setProviderSaving(false);
  }

  async function updateClaudeCodeModel(model: string) {
    setClaudeCodeModel(model);
    setProviderSaving(true);
    const value = model ? `claude-code:${model}` : "claude-code";
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "TEXT_PROVIDER", value }),
    });
    setProviderSaving(false);
  }

  async function updateImageProvider(value: string) {
    setImageProvider(value);
    stage("IMAGE_PROVIDER", value);
  }

  async function updateImageModel(model: string) {
    setImageModel(model);
    stage("IMAGE_MODEL_HUGGINGFACE", model);
  }

  async function updateImageStyle(value: string) {
    setImageStyle(value);
    stage("IMAGE_STYLE", value);
  }

  async function updateVideoProvider(value: string) {
    setVideoProvider(value);
    stage("VIDEO_PROVIDER", value);
  }

  async function updateContentEngine(value: string) {
    setContentEngine(value);
    stage("CONTENT_ENGINE", value);
  }

  async function updateHiggsfieldImageModel(value: string) {
    setHiggsfieldImageModel(value);
    stage("HIGGSFIELD_IMAGE_MODEL", value);
  }

  async function updateHiggsfieldVideoModel(value: string) {
    setHiggsfieldVideoModel(value);
    stage("HIGGSFIELD_VIDEO_MODEL", value);
  }

  async function updateAntigravityBin(value: string) {
    setAntigravityBin(value);
    stage("ANTIGRAVITY_BIN", value);
  }

  async function updateAntigravityModelSetting(value: string) {
    setAntigravityModelSetting(value);
    stage("ANTIGRAVITY_MODEL", value);
  }

  async function updateClaudeCodeBin(value: string) {
    setClaudeCodeBin(value);
    stage("CLAUDE_CODE_BIN", value);
  }

  async function updateClaudeCodeModelSetting(value: string) {
    setClaudeCodeModelSetting(value);
    stage("CLAUDE_CODE_MODEL", value);
  }

  function savePipelineSetting(key: string, value: number) {
    setPipeline((prev) => ({ ...prev, [key]: value }));
    stage(key, String(value));
  }

  function stage(key: string, value: string) {
    setPending((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAll() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      for (const [key, value] of entries) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      }
      setPending({});
      await fetchSettings();
      toast.success(`Saved ${entries.length} setting${entries.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setPending({});
    fetchSettings();
  }

  async function saveApiKey(keyName: string, value: string, setKeySet: (v: boolean) => void) {
    if (!value.trim()) return;
    setKeysSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keyName, value }),
    });
    setKeySet(true);
    setKeysSaving(false);
  }

  const errorMessages: Record<string, string> = {
    oauth_denied: "Authorization was denied",
    token_exchange: "Failed to exchange token",
    no_pages: "No Facebook Pages found. Create a Page first.",
    no_instagram: "No Instagram Business Account linked to your Page",
    unknown: "An unknown error occurred",
  };

  const pendingCount = Object.keys(pending).length;

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="mb-6 p-4 bg-error-bg border border-error-bg rounded-lg">
          <p className="text-sm text-error">
            {errorMessages[error] || error}
          </p>
        </div>
      )}

      {success === "connected" && (
        <div className="mb-6 p-4 bg-success-bg border border-success-bg rounded-lg">
          <p className="text-sm text-success">
            Instagram account connected successfully!
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
        {/* Section rail. Ten settings groups on one scroll is unreadable;
            grouping them turns a wall into five decisions. Horizontal on
            small screens, a sticky column once there is room for it. */}
        <nav aria-label="Settings sections" className="lg:w-52 shrink-0">
          <div className="lg:sticky lg:top-6 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-1 px-1 pb-1 lg:pb-0">
            {SETTINGS_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 text-left rounded-lg px-3 py-2 text-sm transition-colors min-h-[44px] lg:min-h-0 ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0 space-y-6">
          {tab === "general" && (
            <>
      {/* Appearance */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Appearance
        </h2>
        <ThemeToggle />
      </div>
            </>
          )}
          {tab === "providers" && (
            <>
      {/* Default Text Provider */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Default Text Provider
        </h2>
        <select
          value={textProvider}
          onChange={(e) => updateTextProvider(e.target.value)}
          className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {TEXT_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {textProvider === "antigravity" && (
          <select
            value={antigravityModel}
            onChange={(e) => updateAntigravityModel(e.target.value)}
            className="w-full mt-2 bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Default model</option>
            {antigravityModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {textProvider === "claude-code" && (
          <select
            value={claudeCodeModel}
            onChange={(e) => updateClaudeCodeModel(e.target.value)}
            className="w-full mt-2 bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Default model</option>
            {claudeCodeModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {providerSaving && (
          <p className="mt-2 text-xs text-text-tertiary">Saving...</p>
        )}
      </div>
      {/* Default Image Provider */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Default Image Provider
        </h2>
        <select
          value={imageProvider}
          onChange={(e) => updateImageProvider(e.target.value)}
          className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="pollinations">Pollinations</option>
          <option value="gemini">Google AI Studio (Gemini)</option>
          <option value="huggingface">HuggingFace</option>
        </select>
        {imageProvider === "huggingface" && (
          <>
            <select
              value={imageModel}
              onChange={(e) => updateImageModel(e.target.value)}
              className="w-full mt-2 bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="black-forest-labs/FLUX.1-schnell">FLUX.1-schnell (fast)</option>
              <option value="stabilityai/stable-diffusion-3-medium-diffusers">Stable Diffusion 3 Medium</option>
            </select>
            <p className="mt-1 text-xs text-text-tertiary">
              These are the only text-to-image models on HuggingFace&apos;s free tier. Higher-end models (Qwen-Image, FLUX.1-dev, SD 3.5) require enabling a paid Inference provider on your HuggingFace account.
            </p>
          </>
        )}
        <div className="mt-4">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Image Style
          </label>
          <select
            value={imageStyle}
            onChange={(e) => updateImageStyle(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="product">Product-relevant — show the product/device in context</option>
            <option value="abstract">Abstract / brand mood — still-life in brand colors (original)</option>
          </select>
          <p className="mt-1 text-xs text-text-tertiary">
            Product-relevant ties each image to the post topic and may show the app/device with an abstract, textless screen. Abstract is the original brand-colored still-life with no product.
          </p>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          Default image generation provider. Can be overridden per product.
        </p>
      </div>
      {/* Default Video Engine */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Default Video Engine
        </h2>
        <select
          value={videoProvider}
          onChange={(e) => updateVideoProvider(e.target.value)}
          className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ffmpeg">FFmpeg — fast, lightweight (Ken Burns + burned captions)</option>
          <option value="remotion">Remotion — animated kinetic captions, cross-fades, branded overlay</option>
        </select>
        <p className="mt-2 text-xs text-text-tertiary">
          How reels/videos are rendered. Remotion renders via headless Chrome (slower, richer visuals) and
          automatically falls back to FFmpeg if a render fails. Can be overridden per product.
        </p>
      </div>
      {/* API Keys */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          API Keys
        </h2>
        <div className="space-y-4">
          <ApiKeyField
            label="Google AI API Key"
            configured={googleAiKeySet}
            value={googleAiKey}
            onChange={setGoogleAiKey}
            onSave={() => {
              saveApiKey("GOOGLE_AI_API_KEY", googleAiKey, setGoogleAiKeySet);
              setGoogleAiKey("");
            }}
            saving={keysSaving}
            placeholder="Enter key"
          />
          <ApiKeyField
            label="HuggingFace API Key"
            configured={huggingfaceKeySet}
            value={huggingfaceKey}
            onChange={setHuggingfaceKey}
            onSave={() => {
              saveApiKey("HUGGINGFACE_API_KEY", huggingfaceKey, setHuggingfaceKeySet);
              setHuggingfaceKey("");
            }}
            saving={keysSaving}
            placeholder="Enter key"
          />
          <ApiKeyField
            label="Pollinations API Key"
            configured={pollinationsKeySet}
            value={pollinationsKey}
            onChange={setPollinationsKey}
            onSave={() => {
              saveApiKey("POLLINATIONS_API_KEY", pollinationsKey, setPollinationsKeySet);
              setPollinationsKey("");
            }}
            saving={keysSaving}
            placeholder="Enter key (optional)"
          />
        </div>
        <p className="mt-4 text-xs text-text-tertiary">
          API keys are stored securely in the database and used for AI generation. Leave Pollinations blank if using the free tier.
        </p>
      </div>
      {/* Advanced Settings */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Advanced
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Machine-specific paths and binary locations. These are typically set once and rarely changed.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Antigravity Binary Path
            </label>
            <input
              type="text"
              value={antigravityBin}
              onChange={(e) => setAntigravityBin(e.target.value)}
              onBlur={() => updateAntigravityBin(antigravityBin)}
              placeholder="/home/mrg/.local/bin/agy"
              className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary text-sm focus:ring-2 focus:ring-primary focus:border-primary font-mono"
            />
            <p className="text-xs text-text-tertiary mt-1">Path to the Antigravity CLI binary</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Antigravity Default Model
            </label>
            <input
              type="text"
              value={antigravityModelSetting}
              onChange={(e) => setAntigravityModelSetting(e.target.value)}
              onBlur={() => updateAntigravityModelSetting(antigravityModelSetting)}
              placeholder="GPT-OSS 120B (Medium)"
              className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary text-sm focus:ring-2 focus:ring-primary focus:border-primary font-mono"
            />
            <p className="text-xs text-text-tertiary mt-1">Default model for Antigravity text generation</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Claude Code Binary Path
            </label>
            <input
              type="text"
              value={claudeCodeBin}
              onChange={(e) => setClaudeCodeBin(e.target.value)}
              onBlur={() => updateClaudeCodeBin(claudeCodeBin)}
              placeholder="/home/mrg/.local/bin/claude"
              className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary text-sm focus:ring-2 focus:ring-primary focus:border-primary font-mono"
            />
            <p className="text-xs text-text-tertiary mt-1">Path to the Claude Code CLI binary (used by Higgsfield)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Claude Code Default Model
            </label>
            <input
              type="text"
              value={claudeCodeModelSetting}
              onChange={(e) => setClaudeCodeModelSetting(e.target.value)}
              onBlur={() => updateClaudeCodeModelSetting(claudeCodeModelSetting)}
              placeholder="haiku"
              className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary text-sm focus:ring-2 focus:ring-primary focus:border-primary font-mono"
            />
            <p className="text-xs text-text-tertiary mt-1">Default model for Claude Code text generation</p>
          </div>
          </div>
      </div>
            </>
          )}
          {tab === "engine" && (
            <>
      {/* Higgsfield Content Engine */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Higgsfield Content Engine
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          When enabled, Buzz assembles context and writes prompts; Higgsfield generates all media (composition, art direction, motion).
          The default &quot;buzz&quot; engine uses the Remotion/spec pipeline.
        </p>
        <select
          value={contentEngine}
          onChange={(e) => updateContentEngine(e.target.value)}
          className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="buzz">Buzz (default — Remotion/spec pipeline)</option>
          <option value="higgsfield">Higgsfield (AI-native generation)</option>
        </select>
        {contentEngine === "higgsfield" && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Image Model
              </label>
              <select
                value={higgsfieldImageModel}
                onChange={(e) => updateHiggsfieldImageModel(e.target.value)}
                className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Default (marketing_studio_image — 2 credits)</option>
                {higgsfieldImageModels.map((m) => {
                  const supportsRef = m.medias && m.medias.length > 0 && m.medias[0].roles && m.medias[0].roles.length > 0;
                  const refIcon = supportsRef ? "✅" : "⚠️";
                  return (
                    <option key={m.id} value={m.id}>
                      {refIcon} {m.name || m.id}{m.baseCredits ? ` — ${m.baseCredits.toFixed(1)} cr` : " — cost unknown"}{m.aspect_ratios?.length ? ` — ${m.aspect_ratios.slice(0, 3).join(", ")}` : ""}
                    </option>
                  );
                })}
              </select>
              {higgsfieldImageModel && (
                <div className="mt-1 text-xs text-text-tertiary">
                  {(() => {
                    const model = higgsfieldImageModels.find(m => m.id === higgsfieldImageModel);
                    if (!model) return null;
                    const supportsRef = model.medias && model.medias.length > 0 && model.medias[0].roles && model.medias[0].roles.length > 0;
                    if (!supportsRef) {
                      return <span className="text-warning">⚠️ Cannot use product images — will generate generic content</span>;
                    }
                    return <span>✅ Uses your product images</span>;
                  })()}
                </div>
              )}
              {higgsfieldImageModel && !higgsfieldImageModels.find(m => m.id === higgsfieldImageModel)?.baseCredits && (
                <button
                  type="button"
                  onClick={() => checkModelCost(higgsfieldImageModel)}
                  disabled={checkingCostFor === higgsfieldImageModel}
                  className="mt-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {checkingCostFor === higgsfieldImageModel ? "Checking cost..." : "Check cost for this model"}
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Video Model
              </label>
              <select
                value={higgsfieldVideoModel}
                onChange={(e) => updateHiggsfieldVideoModel(e.target.value)}
                className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Default (veo3_1_lite — 4 credits)</option>
                {higgsfieldVideoModels.map((m) => {
                  const supportsRef = m.medias && m.medias.length > 0 && m.medias[0].roles && m.medias[0].roles.length > 0;
                  const refIcon = supportsRef ? "✅" : "⚠️";
                  return (
                    <option key={m.id} value={m.id}>
                      {refIcon} {m.name || m.id}{m.baseCredits ? ` — ${m.baseCredits.toFixed(1)} cr` : " — cost unknown"}{m.durations?.length ? ` — ${m.durations.join(", ")}s` : ""}
                    </option>
                  );
                })}
              </select>
              {higgsfieldVideoModel && (
                <div className="mt-1 text-xs text-text-tertiary">
                  {(() => {
                    const model = higgsfieldVideoModels.find(m => m.id === higgsfieldVideoModel);
                    if (!model) return null;
                    const supportsRef = model.medias && model.medias.length > 0 && model.medias[0].roles && model.medias[0].roles.length > 0;
                    if (!supportsRef) {
                      return <span className="text-warning">⚠️ Cannot use product images — will generate generic content</span>;
                    }
                    return <span>✅ Uses your product images</span>;
                  })()}
                </div>
              )}
              {higgsfieldVideoModel && !higgsfieldVideoModels.find(m => m.id === higgsfieldVideoModel)?.baseCredits && (
                <button
                  type="button"
                  onClick={() => checkModelCost(higgsfieldVideoModel)}
                  disabled={checkingCostFor === higgsfieldVideoModel}
                  className="mt-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {checkingCostFor === higgsfieldVideoModel ? "Checking cost..." : "Check cost for this model"}
                </button>
              )}
              {(higgsfieldVideoModels.find(m => m.id === higgsfieldVideoModel)?.baseCredits ?? 0) > 20 && (
                <p className="mt-1 text-xs text-warning">
                  High cost per generation — not recommended for scheduled runs.
                </p>
              )}
            </div>
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary">
                    {higgsfieldModelsFetchedAt
                      ? `Last updated: ${new Date(higgsfieldModelsFetchedAt).toLocaleString()}`
                      : "No models cached yet"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshHiggsfieldModels}
                  disabled={higgsfieldModelsRefreshing}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {higgsfieldModelsRefreshing ? "Refreshing (1-3 min)..." : "Refresh models"}
                </button>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                Fetches available models and their costs from Higgsfield. Takes 1-3 minutes.
              </p>
            </div>
          </div>
        )}
      </div>
      {/* Pipeline tuning */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">Pipeline</h2>
        <p className="text-sm text-text-secondary mb-4">
          How much of a product the models actually see, and how hard they work.
          Each of these trades output quality against tokens, cost and latency.
          </p>
        <div className="space-y-4">
          {PIPELINE_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                {f.label}
              </label>
              <input
                type="number"
                min={f.min}
                max={f.max}
                defaultValue={pipeline[f.key] ?? f.fallback}
                key={`${f.key}-${pipeline[f.key] ?? f.fallback}`}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= f.min && n <= f.max && n !== (pipeline[f.key] ?? f.fallback)) {
                    savePipelineSetting(f.key, n);
                  }
                }}
                className="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {f.help} Default {f.fallback}.
              </p>
            </div>
          ))}
        </div>
      </div>
            </>
          )}
          {tab === "publishing" && (
            <>
      {/* Instagram Accounts */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-text-primary">
            Instagram Accounts
          </h2>
          <a
            href="/api/instagram/auth"
            className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-purple-600 hover:to-pink-600"
          >
            + Add Account
          </a>
        </div>

        {loading ? (
          <p className="text-text-tertiary">Loading...</p>
        ) : accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                    {account.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">@{account.username}</p>
                    <p className="text-xs text-text-tertiary">
                      Expires: {account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleDateString() : "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {account.linkedProducts.length > 0 ? (
                    <div className="text-xs text-text-secondary">
                      Linked to: {account.linkedProducts.map((p) => (
                        <Link key={p.id} href={`/products/${p.id}`} className="text-primary hover:underline ml-1">
                          {p.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-warning bg-warning-bg px-2 py-1 rounded">Not linked to any product</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              No Instagram accounts connected yet. Add an account to start posting.
            </p>
            <p className="text-xs text-text-tertiary">
              Requirements: Facebook Page with linked Instagram Business Account
            </p>
          </div>
        )}
      </div>
      {/* Discord Setup */}
      <div className="mt-6">
        <DiscordSetup />
      </div>
            </>
          )}
          {tab === "diagnostics" && (
            <>
      {/* Environment Variables Info */}
      <div className="mt-6 bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Required Environment Variables
        </h2>
        <ul className="text-sm text-text-secondary space-y-2 font-mono">
          <li>FACEBOOK_APP_ID</li>
          <li>FACEBOOK_APP_SECRET</li>
          <li>INSTAGRAM_REDIRECT_URI</li>
        </ul>
        <p className="mt-4 text-xs text-text-tertiary">
          Get these from{" "}
          <a
            href="https://developers.facebook.com"
            target="_blank"
            className="text-primary hover:underline"
          >
            developers.facebook.com
          </a>
        </p>
      </div>
            </>
          )}
        </div>
      </div>

      {/* Unsaved changes float above the fold. Anchored to the end of a long
          column it was simply below the viewport, so a changed setting looked
          like a setting that had silently failed to save. */}
      {pendingCount > 0 && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-3rem)] max-w-xl -translate-x-1/2
            rounded-xl border border-border-strong bg-surface px-4 py-3 shadow-lg
            flex items-center gap-3
            motion-safe:animate-[settings-save-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        >
          <span className="text-sm text-text-primary">
            {pendingCount} unsaved change{pendingCount === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={discardChanges}
              disabled={saving}
              className="min-h-[44px] px-3 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Discard
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground
                hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}

    </>
  );
}


// Pipeline knobs that were previously hardcoded constants. Each one changes
// how much the models see or how hard they work, so it belongs in the UI
// rather than buried in source.
type SettingsTab = "general" | "providers" | "engine" | "publishing" | "diagnostics";

// Grouped by the decision being made, not by which subsystem owns the value.
// "Which model writes my copy" and "which key authenticates it" belong together
// even though they live in different parts of the codebase.
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "AI Providers" },
  { id: "engine", label: "Content Engine" },
  { id: "publishing", label: "Publishing" },
  { id: "diagnostics", label: "Diagnostics" },
];

const PIPELINE_FIELDS = [
  {
    key: "EXTRACTION_MAX_IMAGES",
    label: "Screenshots read during extraction",
    fallback: 10,
    min: 1,
    max: 40,
    help: "Sampled evenly across the product's screenshots when building its profile. The profile drives every later prompt, so this is the highest-leverage setting here. More images cost more vision tokens and time.",
  },
  {
    key: "CONTENT_MAX_IMAGES",
    label: "Images attached when generating content",
    fallback: 4,
    min: 1,
    max: 20,
    help: "Uploads passed to the model when writing captions and image prompts.",
  },
  {
    key: "IMAGE_MAX_DIMENSION",
    label: "Image downscale size (px)",
    fallback: 1024,
    min: 256,
    max: 2048,
    help: "Longest edge images are resized to before being sent. Higher means the model can read finer UI detail, at more tokens.",
  },
  {
    key: "IMAGE_JPEG_QUALITY",
    label: "Image JPEG quality",
    fallback: 70,
    min: 30,
    max: 95,
    help: "Compression applied to those images. Low values can blur small on-screen text.",
  },
  {
    key: "HIGGSFIELD_MAX_ASSETS",
    label: "Assets uploaded to Higgsfield",
    fallback: 4,
    min: 1,
    max: 20,
    help: "Product assets uploaded for use as generation references. Most models accept only one per generation, but a larger pool gives the selector more to choose from.",
  },
  {
    key: "PLAN_FILE_CHAR_CAP",
    label: "Brief characters included in prompts",
    fallback: 4000,
    min: 500,
    max: 20000,
    help: "How much of the marketing brief reaches a generation prompt before truncation.",
  },
  {
    key: "GENERATION_CANDIDATES",
    label: "Candidates per generation (best-of-N)",
    fallback: 3,
    min: 1,
    max: 6,
    help: "Variants rendered and judged before one is chosen. Directly multiplies render time and provider cost.",
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-6 py-8 pb-28">
        <Suspense fallback={<p className="text-text-tertiary">Loading...</p>}>
          <SettingsContent />
        </Suspense>
      </main>
    </div>
  );
}
