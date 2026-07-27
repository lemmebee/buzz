"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";

interface TraceRow {
  id: number;
  jobId: string | null;
  productId: number | null;
  contentId: number | null;
  phase: string;
  step: string | null;
  variationIndex: number | null;
  engine: string | null;
  provider: string | null;
  model: string | null;
  credits: number | null;
  durationMs: number | null;
  status: string | null;
  error: string | null;
  createdAt: string;
}

interface Facets {
  phases: string[];
  engines: string[];
  statuses: string[];
}

const PAGE_SIZE = 50;

function duration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function TracesPage() {
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [facets, setFacets] = useState<Facets>({ phases: [], engines: [], statuses: [] });
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState("");
  const [status, setStatus] = useState("");
  const [engine, setEngine] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ list: "1", limit: String(PAGE_SIZE), offset: String(offset) });
      if (phase) qs.set("phase", phase);
      if (status) qs.set("status", status);
      if (engine) qs.set("engine", engine);

      const res = await fetch(`/api/traces?${qs}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? { phases: [], engines: [], statuses: [] });
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, phase, status, engine]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change invalidates the current page.
  useEffect(() => {
    setOffset(0);
  }, [phase, status, engine]);

  const select = "bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Activity className="w-6 h-6" /> Traces
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Every step of every pipeline run — the prompt sent, the model used, what came back.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={phase} onChange={(e) => setPhase(e.target.value)} className={select}>
          <option value="">All phases</option>
          {facets.phases.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} className={select}>
          <option value="">All engines</option>
          {facets.engines.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
          <option value="">All statuses</option>
          {facets.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="text-sm text-primary hover:text-primary-hover px-2">
          Refresh
        </button>
        <span className="ml-auto text-sm text-text-tertiary self-center">
          {total} trace{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="bg-surface rounded-lg border border-border p-8 text-center">
          <p className="text-text-secondary">No traces recorded yet.</p>
          <p className="text-sm text-text-tertiary mt-1">
            Run an extraction or generate content and every step will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-border divide-y divide-border">
          {rows.map((t) => (
            <Link
              key={t.id}
              href={`/traces/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors"
            >
              {t.status === "error" ? (
                <AlertCircle className="w-4 h-4 text-error shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary">{t.phase}</span>
                  {t.step && <span className="text-sm text-text-secondary truncate">{t.step}</span>}
                  {t.variationIndex != null && (
                    <span className="text-xs px-1.5 py-0.5 bg-background rounded text-text-tertiary">
                      var {t.variationIndex}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5 text-xs text-text-tertiary">
                  {t.model && <span className="text-primary">{t.model}</span>}
                  {t.engine && <span>{t.engine}</span>}
                  <span>{when(t.createdAt)}</span>
                  {t.error && <span className="text-error truncate">{t.error}</span>}
                </div>
              </div>

              {t.credits != null && (
                <span className="text-xs text-warning shrink-0">{t.credits} cr</span>
              )}
              <span className="text-xs text-text-tertiary shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {duration(t.durationMs)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="text-sm text-primary disabled:text-text-muted disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-sm text-text-tertiary">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="text-sm text-primary disabled:text-text-muted disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
