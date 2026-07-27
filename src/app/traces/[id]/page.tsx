"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { TracePayload } from "@/components/TracePayload";

interface TraceDetail {
  id: number;
  jobId: string | null;
  productId: number | null;
  productName: string | null;
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
  input: string | null;
  output: string | null;
  createdAt: string;
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5 break-all">{value}</dd>
    </div>
  );
}

export default function TraceDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/traces/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      setTrace(await res.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-6 max-w-5xl mx-auto text-sm text-text-tertiary">Loading...</div>;
  }

  if (notFound || !trace) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/traces" className="text-sm text-primary flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Traces
        </Link>
        <p className="text-text-secondary">Trace not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/traces" className="text-sm text-primary flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Traces
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {trace.status === "error" ? (
            <AlertCircle className="w-5 h-5 text-error" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-success" />
          )}
          <h1 className="text-2xl font-semibold text-text-primary">{trace.phase}</h1>
          {trace.step && <span className="text-lg text-text-secondary">· {trace.step}</span>}
        </div>
        {trace.error && (
          <p className="mt-2 text-sm text-error bg-error-bg rounded px-3 py-2">{trace.error}</p>
        )}
      </header>

      <dl className="bg-surface rounded-lg border border-border p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Meta label="Model" value={trace.model} />
        <Meta label="Provider" value={trace.provider} />
        <Meta label="Engine" value={trace.engine} />
        <Meta
          label="Duration"
          value={trace.durationMs != null ? `${(trace.durationMs / 1000).toFixed(1)}s` : null}
        />
        <Meta label="Credits" value={trace.credits != null ? `${trace.credits}` : null} />
        <Meta label="Variation" value={trace.variationIndex} />
        <Meta
          label="Product"
          value={
            trace.productId ? (
              <Link href={`/products/${trace.productId}`} className="text-primary hover:underline">
                {trace.productName ?? `#${trace.productId}`}
              </Link>
            ) : null
          }
        />
        <Meta label="Job" value={trace.jobId} />
        <Meta label="Recorded" value={new Date(trace.createdAt).toLocaleString()} />
      </dl>

      <div className="space-y-4">
        <TracePayload label="Input — what was sent" raw={trace.input} />
        <TracePayload label="Output — what came back" raw={trace.output} />
      </div>
    </div>
  );
}
