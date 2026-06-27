"use client";

import { useState, useEffect } from "react";
import { Product, ProductRevision } from "../../drizzle/schema";

interface RevisionHistoryProps {
  productId: number;
  field: "planFile" | "profile" | "marketingStrategy";
  renderContent: (content: string) => React.ReactNode;
  onRevert: (updated: Product) => void;
}

function timeAgo(date: Date | null): string {
  if (!date) return "unknown";
  const d = typeof date === "number" ? new Date(date) : date instanceof Date ? date : new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function RevisionHistory({ productId, field, renderContent, onRevert }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<ProductRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    fetch(`/api/products/${productId}/revisions?field=${field}`)
      .then((r) => r.json())
      .then((data) => {
        setRevisions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId, field]);

  async function handleRevert(revisionId: number) {
    setReverting(true);
    try {
      const res = await fetch(`/api/products/${productId}/revisions/${revisionId}/revert`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        onRevert(updated);
      }
    } finally {
      setReverting(false);
    }
  }

  if (loading) return <p className="text-sm text-text-tertiary">Loading history...</p>;
  if (revisions.length === 0) return <p className="text-sm text-text-tertiary">No revision history yet.</p>;

  const previewed = revisions.find((r) => r.id === previewId);

  if (previewed) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setPreviewId(null)} className="text-xs text-primary hover:text-primary-hover">
            &larr; Back to list
          </button>
          <span className="text-xs text-text-tertiary">{timeAgo(previewed.createdAt)}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${previewed.source === "extraction" ? "bg-info-bg text-info" : "bg-border text-text-secondary"}`}>
            {previewed.source}
          </span>
          {previewed.textProvider && (
            <span className="text-xs px-1.5 py-0.5 bg-primary/15 text-primary rounded">{previewed.textProvider}</span>
          )}
          <button
            onClick={() => handleRevert(previewed.id)}
            disabled={reverting}
            className="ml-auto text-xs px-2 py-1 bg-warning-bg text-warning rounded hover:bg-warning-bg disabled:opacity-50"
          >
            {reverting ? "Reverting..." : "Revert to this"}
          </button>
        </div>
        {renderContent(previewed.content)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {revisions.map((rev) => (
        <button
          key={rev.id}
          onClick={() => setPreviewId(rev.id)}
          className="w-full text-left p-3 border border-border rounded-lg hover:bg-background flex items-center gap-2"
        >
          <span className="text-sm text-text-secondary flex-1">{timeAgo(rev.createdAt)}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${rev.source === "extraction" ? "bg-info-bg text-info" : "bg-border text-text-secondary"}`}>
            {rev.source}
          </span>
          {rev.textProvider && (
            <span className="text-xs px-1.5 py-0.5 bg-primary/15 text-primary rounded">{rev.textProvider}</span>
          )}
        </button>
      ))}
    </div>
  );
}
