"use client";
import { useState } from "react";

interface Props { productId: number; palette: { accents: string[]; bg: string; ink: string }; logoSrc?: string; }

export function BrandKitOverride({ productId, palette, logoSrc }: Props) {
  const [accent, setAccent] = useState(palette.accents[0] || "#000000");
  const [logo, setLogo] = useState(logoSrc || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/products/${productId}/brandkit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ palette: { accents: [accent] }, logo: logo ? { src: logo } : undefined }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved" : "Failed - check hex/logo");
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <h4 className="text-sm font-semibold">Brand override</h4>
      <label className="flex items-center gap-2 text-sm">Accent
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
        <span className="font-mono">{accent}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">Logo URL
        <input className="flex-1 rounded border px-2 py-1" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="/api/media/logo.png" />
      </label>
      <button onClick={save} disabled={saving} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">
        {saving ? "Saving..." : "Save override"}
      </button>
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
