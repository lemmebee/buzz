"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Schedule {
  id: number;
  productId: number;
  productName: string | null;
  platform: string;
  contentType: string;
  count: number;
  frequencyHours: number;
  preferredTime: string;
  enabled: boolean;
  lastRunAt: string | null;
}

interface Product {
  id: number;
  name: string;
}

const FREQUENCY_OPTIONS = [
  { label: "Daily", value: 24 },
  { label: "Every 2 days", value: 48 },
  { label: "Every 3 days", value: 72 },
  { label: "Weekly", value: 168 },
];

const PLATFORMS = ["instagram", "twitter"];
const CONTENT_TYPES = ["post", "reel", "story", "carousel"];

function frequencyLabel(hours: number) {
  return FREQUENCY_OPTIONS.find((f) => f.value === hours)?.label || `Every ${hours}h`;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formProductId, setFormProductId] = useState<number>(0);
  const [formPlatform, setFormPlatform] = useState("instagram");
  const [formContentType, setFormContentType] = useState("post");
  const [formCount, setFormCount] = useState(1);
  const [formFrequency, setFormFrequency] = useState(24);
  const [formTime, setFormTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  // Discord setup
  const [dsToken, setDsToken] = useState("");
  const [dsPublicKey, setDsPublicKey] = useState("");
  const [dsChannelId, setDsChannelId] = useState("");
  const [dsStatus, setDsStatus] = useState<string | null>(null);
  const [dsSaving, setDsSaving] = useState(false);
  const [dsShowToken, setDsShowToken] = useState(false);
  const [dsShowKey, setDsShowKey] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [schedulesRes, productsRes, settingsRes] = await Promise.all([
      fetch("/api/schedules"),
      fetch("/api/products"),
      fetch("/api/settings"),
    ]);
    const schedulesData = await schedulesRes.json();
    const productsData = await productsRes.json();
    const settingsData = await settingsRes.json();

    setSchedules(schedulesData);
    setProducts(productsData);
    if (productsData.length > 0 && !formProductId) {
      setFormProductId(productsData[0].id);
    }
    if (settingsData.DISCORD_BOT_TOKEN) setDsToken(settingsData.DISCORD_BOT_TOKEN);
    if (settingsData.DISCORD_PUBLIC_KEY) setDsPublicKey(settingsData.DISCORD_PUBLIC_KEY);
    if (settingsData.DISCORD_CHANNEL_ID) setDsChannelId(settingsData.DISCORD_CHANNEL_ID);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: formProductId,
        platform: formPlatform,
        contentType: formContentType,
        count: formCount,
        frequencyHours: formFrequency,
        preferredTime: formTime,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      fetchData();
    }
    setSaving(false);
  }

  async function handleToggle(id: number, enabled: boolean) {
    await fetch(`/api/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setSchedules(schedules.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s)));
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this schedule?")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setSchedules(schedules.filter((s) => s.id !== id));
  }

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
    } else {
      setDsStatus(`Error: ${data.error}`);
    }
    setDsSaving(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Schedules</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "New Schedule"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="font-medium text-gray-900">New Generation Schedule</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Product</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Platform</label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Content Type</label>
                <select
                  value={formContentType}
                  onChange={(e) => setFormContentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  {CONTENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Posts per run</label>
                <select
                  value={formCount}
                  onChange={(e) => setFormCount(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Preferred Time</label>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !formProductId}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Schedule"}
            </button>
          </form>
        )}

        {/* Schedule list */}
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : schedules.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No generation schedules yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              Create your first schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between ${
                  !schedule.enabled ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{schedule.productName || "Unknown"}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">{schedule.platform}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">{schedule.contentType}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {frequencyLabel(schedule.frequencyHours)} at {schedule.preferredTime} - {schedule.count} post{schedule.count > 1 ? "s" : ""}/run
                    {schedule.lastRunAt && (
                      <span className="ml-2 text-gray-400">
                        Last run: {new Date(schedule.lastRunAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(schedule.id, schedule.enabled)}
                    className={`px-3 py-1 text-xs rounded-lg ${
                      schedule.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {schedule.enabled ? "Active" : "Paused"}
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="px-3 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discord setup */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-medium text-gray-900 mb-4">Discord Notifications</h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect a Discord bot to receive drafts for approval. Create an app at{" "}
            <a href="https://discord.com/developers/applications" className="text-blue-600" target="_blank" rel="noreferrer">
              discord.com/developers
            </a>
            , add a Bot, copy the bot token and the application&apos;s Public Key. Invite the bot to your
            server with the {" "}<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">bot</code> scope and{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">Send Messages</code> permission, then
            paste a channel ID below (enable Developer Mode in Discord, right-click channel, Copy ID). Set the
            app&apos;s Interactions Endpoint URL to{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">https://your-domain.com/api/discord/interactions</code>.
          </p>
          <form onSubmit={handleDiscordSetup} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bot Token</label>
                <div className="relative">
                  <input
                    type={dsShowToken ? "text" : "password"}
                    autoComplete="off"
                    value={dsToken}
                    onChange={(e) => setDsToken(e.target.value)}
                    placeholder="MTIzNDU2..."
                    className="w-full px-3 py-2 pr-16 border border-gray-200 rounded-lg text-sm text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={() => setDsShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    {dsShowToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Channel ID</label>
                <input
                  type="text"
                  value={dsChannelId}
                  onChange={(e) => setDsChannelId(e.target.value)}
                  placeholder="123456789012345678"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Public Key (from app General Information)</label>
              <div className="relative">
                <input
                  type={dsShowKey ? "text" : "password"}
                  autoComplete="off"
                  value={dsPublicKey}
                  onChange={(e) => setDsPublicKey(e.target.value)}
                  placeholder="hex string, 64 chars"
                  className="w-full px-3 py-2 pr-16 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setDsShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  {dsShowKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={dsSaving || !dsToken || !dsChannelId || !dsPublicKey}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {dsSaving ? "Connecting..." : "Connect Discord"}
              </button>
              {dsStatus && (
                <span className={`text-sm ${dsStatus.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                  {dsStatus}
                </span>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
