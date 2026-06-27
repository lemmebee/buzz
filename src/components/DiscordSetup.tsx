"use client";

import { useState } from "react";

export function DiscordSetup() {
  const [dsToken, setDsToken] = useState("");
  const [dsPublicKey, setDsPublicKey] = useState("");
  const [dsChannelId, setDsChannelId] = useState("");
  const [dsStatus, setDsStatus] = useState<string | null>(null);
  const [dsSaving, setDsSaving] = useState(false);
  const [dsShowToken, setDsShowToken] = useState(false);
  const [dsShowKey, setDsShowKey] = useState(false);

  async function handleDiscordSetup(e: React.FormEvent) {
    e.preventDefault();
    setDsSaving(true);
    setDsStatus(null);
    const res = await fetch("/api/discord/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botToken: dsToken,
        publicKey: dsPublicKey,
        channelId: dsChannelId,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setDsStatus(`Connected as ${data.botName}`);
      setDsShowToken(false);
      setDsShowKey(false);
    } else {
      setDsStatus(`Error: ${data.error || "Failed to connect"}`);
    }
    setDsSaving(false);
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-6">
      <h2 className="font-medium text-text-primary mb-4">Discord Notifications</h2>
      <p className="text-sm text-text-tertiary mb-4">
        Connect a Discord bot to receive drafts for approval. Create an app at{" "}
        <a href="https://discord.com/developers/applications" className="text-primary" target="_blank" rel="noreferrer">
          discord.com/developers
        </a>
        , add a Bot, copy the bot token and the application&apos;s Public Key. Invite the bot to your
        server with the {" "}<code className="text-xs bg-border px-1 py-0.5 rounded">bot</code> scope and{" "}
        <code className="text-xs bg-border px-1 py-0.5 rounded">Send Messages</code> permission, then
        paste a channel ID below (enable Developer Mode in Discord, right-click channel, Copy ID). Set the
        app&apos;s Interactions Endpoint URL to{" "}
        <code className="text-xs bg-border px-1 py-0.5 rounded">https://your-domain.com/api/discord/interactions</code>.
      </p>
      <form onSubmit={handleDiscordSetup} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Bot Token</label>
            <div className="relative">
              <input
                type={dsShowToken ? "text" : "password"}
                autoComplete="off"
                value={dsToken}
                onChange={(e) => setDsToken(e.target.value)}
                placeholder="MTIzNDU2..."
                className="w-full px-3 py-2 pr-16 border border-border rounded-lg text-sm text-text-primary bg-surface"
              />
              <button
                type="button"
                onClick={() => setDsShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary hover:text-text-secondary px-2 py-1"
              >
                {dsShowToken ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Channel ID</label>
            <input
              type="text"
              value={dsChannelId}
              onChange={(e) => setDsChannelId(e.target.value)}
              placeholder="123456789012345678"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Public Key (from app General Information)</label>
          <div className="relative">
            <input
              type={dsShowKey ? "text" : "password"}
              autoComplete="off"
              value={dsPublicKey}
              onChange={(e) => setDsPublicKey(e.target.value)}
              placeholder="hex string, 64 chars"
              className="w-full px-3 py-2 pr-16 border border-border rounded-lg text-sm text-text-primary font-mono bg-surface"
            />
            <button
              type="button"
              onClick={() => setDsShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary hover:text-text-secondary px-2 py-1"
            >
              {dsShowKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={dsSaving || !dsToken || !dsChannelId || !dsPublicKey}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {dsSaving ? "Connecting..." : "Connect Discord"}
          </button>
          {dsStatus && (
            <span className={`text-sm ${dsStatus.startsWith("Error") ? "text-error" : "text-success"}`}>
              {dsStatus}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
