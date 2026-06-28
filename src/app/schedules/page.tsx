"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";

interface Schedule {
  id: number;
  productId: number;
  productName: string | null;
  platform: string;
  mediaType: string;
  targetSurface: string;
  config: string | null;
  count: number;
  frequencyHours: number;
  preferredTime: string;
  enabled: boolean;
  lastRunAt: string | null;
}

interface FormConfig {
  durationSec?: number;
  aspectRatio: string;
  captions?: boolean;
}

const CONFIG_DEFAULTS: Record<string, Record<string, FormConfig>> = {
  reel: {
    video: { durationSec: 15, aspectRatio: "9:16", captions: true },
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
const MEDIA_TYPES = ["image", "video"];

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
const CONTENT_TYPES = ["post", "reel", "story", "ad"];

function frequencyLabel(hours: number) {
  return FREQUENCY_OPTIONS.find((f) => f.value === hours)?.label || `Every ${hours}h`;
}

export default function SchedulesPage() {
  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formProductId, setFormProductId] = useState<number>(0);
  const [formPlatform, setFormPlatform] = useState("instagram");
  const [formMediaType, setFormMediaType] = useState("image");
  const [formTargetSurface, setFormTargetSurface] = useState("post");
  const [formConfig, setFormConfig] = useState<FormConfig>(CONFIG_DEFAULTS.post.image);
  const [formCount, setFormCount] = useState(1);
  const [formFrequency, setFormFrequency] = useState(24);
  const [formTime, setFormTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = CONFIG_DEFAULTS[formTargetSurface]?.[formMediaType];
    if (next) setFormConfig({ ...next });
  }, [formMediaType, formTargetSurface]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [schedulesRes, productsRes] = await Promise.all([
      fetch("/api/schedules"),
      fetch("/api/products"),
    ]);
    const schedulesData = await schedulesRes.json();
    const productsData = await productsRes.json();

    setSchedules(schedulesData);
    setProducts(productsData);
    if (productsData.length > 0 && !formProductId) {
      setFormProductId(productsData[0].id);
    }
    setLoading(false);
  }, [formProductId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: formProductId,
        platform: formPlatform,
        mediaType: formMediaType,
        targetSurface: formTargetSurface,
        config: formConfig,
        count: formCount,
        frequencyHours: formFrequency,
        preferredTime: formTime,
      }),
    });
    if (res.ok) {
      toast.success("Schedule created");
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
    toast.success(enabled ? "Schedule paused" : "Schedule activated");
  }

  async function handleDelete(id: number) {
    confirm("Delete Schedule", "Are you sure you want to delete this schedule?", async () => {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      setSchedules(schedules.filter((s) => s.id !== id));
      toast.success("Schedule deleted");
    }, "destructive");
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-surface rounded-lg border border-border p-6 space-y-4">
            <h2 className="font-medium text-text-primary">New Generation Schedule</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Product</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Platform</label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Media Type</label>
                <select
                  value={formMediaType}
                  onChange={(e) => {
                    setFormMediaType(e.target.value);
                    if (e.target.value === "image" && formTargetSurface === "reel") {
                      setFormTargetSurface("post");
                    }
                  }}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {MEDIA_TYPES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Content Type</label>
                <select
                  value={formTargetSurface}
                  onChange={(e) => setFormTargetSurface(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {CONTENT_TYPES
                    .filter((t) => !(t === "reel" && formMediaType === "image"))
                    .map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Aspect Ratio</label>
                <select
                  value={formConfig.aspectRatio}
                  onChange={(e) => setFormConfig({ ...formConfig, aspectRatio: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {ASPECT_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              {formMediaType === "video" && (
                <>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Duration (sec)</label>
                    <input
                      type="number"
                      min={5}
                      max={90}
                      value={formConfig.durationSec ?? 15}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, durationSec: parseInt(e.target.value) || 15 })
                      }
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={formConfig.captions ?? false}
                        onChange={(e) =>
                          setFormConfig({ ...formConfig, captions: e.target.checked })
                        }
                      />
                      Burn-in captions
                    </label>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Posts per run</label>
                <select
                  value={formCount}
                  onChange={(e) => setFormCount(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Preferred Time</label>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !formProductId}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Schedule"}
            </button>
          </form>
        )}

        {/* Schedule list */}
        {loading ? (
          <p className="text-text-tertiary">Loading...</p>
        ) : schedules.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary mb-4">No generation schedules yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-primary hover:text-primary-hover"
            >
              Create your first schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`bg-surface rounded-lg border border-border p-4 flex items-center justify-between ${
                  !schedule.enabled ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{schedule.productName || "Unknown"}</span>
                    <span className="text-xs px-2 py-0.5 bg-border rounded text-text-secondary">{schedule.platform}</span>
                    <span className="text-xs px-2 py-0.5 bg-border rounded text-text-secondary">{schedule.mediaType}/{schedule.targetSurface}</span>
                  </div>
                  <p className="text-sm text-text-tertiary mt-1">
                    {frequencyLabel(schedule.frequencyHours)} at {schedule.preferredTime} - {schedule.count} post{schedule.count > 1 ? "s" : ""}/run
                    {schedule.lastRunAt && (
                      <span className="ml-2 text-text-muted">
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
                        ? "bg-success-bg text-success"
                        : "bg-border text-text-tertiary"
                    }`}
                  >
                    {schedule.enabled ? "Active" : "Paused"}
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="px-3 py-1 text-xs rounded-lg bg-error-bg text-error hover:bg-error-bg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}
