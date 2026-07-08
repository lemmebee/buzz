"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  const [imageProviderSaving, setImageProviderSaving] = useState(false);
  const [videoProvider, setVideoProvider] = useState("ffmpeg");
  const [videoProviderSaving, setVideoProviderSaving] = useState(false);
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

  async function updateTextProvider(value: string) {
    setTextProvider(value);
    setProviderSaving(true);
    if (value === "antigravity") {
      await fetchAntigravityModels();
      const modelValue = antigravityModel
        ? `antigravity:${antigravityModel}`
        : "antigravity";
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "TEXT_PROVIDER", value: modelValue }),
      });
    } else if (value === "claude-code") {
      await fetchClaudeCodeModels();
      const modelValue = claudeCodeModel
        ? `claude-code:${claudeCodeModel}`
        : "claude-code";
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "TEXT_PROVIDER", value: modelValue }),
      });
    } else {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "TEXT_PROVIDER", value }),
      });
    }
    setProviderSaving(false);
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
    setImageProviderSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "IMAGE_PROVIDER", value }),
    });
    setImageProviderSaving(false);
  }

  async function updateImageModel(model: string) {
    setImageModel(model);
    setImageProviderSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "IMAGE_MODEL_HUGGINGFACE", value: model }),
    });
    setImageProviderSaving(false);
  }

  async function updateImageStyle(value: string) {
    setImageStyle(value);
    setImageProviderSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "IMAGE_STYLE", value }),
    });
    setImageProviderSaving(false);
  }

  async function updateVideoProvider(value: string) {
    setVideoProvider(value);
    setVideoProviderSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "VIDEO_PROVIDER", value }),
    });
    setVideoProviderSaving(false);
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

      {/* Appearance */}
      <div className="bg-surface rounded-lg border border-border p-6 mb-6">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Appearance
        </h2>
        <ThemeToggle />
      </div>

      {/* Default Text Provider */}
      <div className="bg-surface rounded-lg border border-border p-6 mb-6">
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

      {/* API Keys */}
      <div className="bg-surface rounded-lg border border-border p-6 mb-6">
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

      {/* Default Image Provider */}
      <div className="bg-surface rounded-lg border border-border p-6 mb-6">
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
        {imageProviderSaving && (
          <p className="mt-2 text-xs text-text-tertiary">Saving...</p>
        )}
        <p className="mt-2 text-xs text-text-tertiary">
          Default image generation provider. Can be overridden per product.
        </p>
      </div>

      {/* Default Video Engine */}
      <div className="bg-surface rounded-lg border border-border p-6 mb-6">
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
        {videoProviderSaving && (
          <p className="mt-2 text-xs text-text-tertiary">Saving...</p>
        )}
        <p className="mt-2 text-xs text-text-tertiary">
          How reels/videos are rendered. Remotion renders via headless Chrome (slower, richer visuals) and
          automatically falls back to FFmpeg if a render fails. Can be overridden per product.
        </p>
      </div>

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

      {/* Discord Setup */}
      <div className="mt-6">
        <DiscordSetup />
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Suspense fallback={<p className="text-text-tertiary">Loading...</p>}>
          <SettingsContent />
        </Suspense>
      </main>
    </div>
  );
}
