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
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<InstagramAccountWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [textProvider, setTextProvider] = useState("gemini");
  const [antigravityModel, setAntigravityModel] = useState("");
  const [antigravityModels, setAntigravityModels] = useState<string[]>([]);
  const [providerSaving, setProviderSaving] = useState(false);

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
      if (val.startsWith("antigravity:")) {
        setTextProvider("antigravity");
        setAntigravityModel(val.split(":").slice(1).join(":"));
      } else {
        setTextProvider(val);
      }
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
        {providerSaving && (
          <p className="mt-2 text-xs text-text-tertiary">Saving...</p>
        )}
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
