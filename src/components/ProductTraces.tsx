"use client";

import { useCallback, useEffect, useState } from "react";
import { TraceViewer } from "./TraceViewer";

interface Trace {
  id: number;
  phase: string;
  step?: string;
  engine?: string;
  provider?: string;
  model?: string;
  credits?: number;
  durationMs?: number;
  status?: string;
  error?: string;
  input?: string;
  output?: string;
  truncated?: boolean;
  createdAt: string;
}

/**
 * Pipeline traces for a product: what was sent to which model at each step.
 * Extraction is the one that matters most — a profile built from zero
 * screenshots looks identical to one built from six until you can see the
 * counts.
 */
export function ProductTraces({ productId }: { productId: number }) {
  const [traces, setTraces] = useState<Record<string, Trace[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/traces?productId=${productId}`);
      setTraces(res.ok ? await res.json() : {});
    } catch {
      setTraces({});
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const phaseCount = Object.keys(traces).length;

  return (
    <div className="bg-surface rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-text-primary">Pipeline traces</h2>
          <p className="text-sm text-text-secondary mt-1">
            Exactly what each step sent to which model — prompts, inputs, timings.
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-primary hover:text-primary-hover shrink-0 ml-4"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading...</p>
      ) : phaseCount === 0 ? (
        <p className="text-sm text-text-tertiary">
          No traces yet. Re-run extraction or generate content to record one.
        </p>
      ) : (
        <TraceViewer traces={traces} />
      )}
    </div>
  );
}
