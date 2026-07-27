"use client";

import { useState } from "react";

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

interface TraceViewerProps {
  traces: Record<string, Trace[]>;
}

export function TraceViewer({ traces }: TraceViewerProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedTraces, setExpandedTraces] = useState<Set<number>>(new Set());

  const togglePhase = (phase: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phase)) {
      newExpanded.delete(phase);
    } else {
      newExpanded.add(phase);
    }
    setExpandedPhases(newExpanded);
  };

  const toggleTrace = (traceId: number) => {
    const newExpanded = new Set(expandedTraces);
    if (newExpanded.has(traceId)) {
      newExpanded.delete(traceId);
    } else {
      newExpanded.add(traceId);
    }
    setExpandedTraces(newExpanded);
  };

  const phaseOrder = ["extraction", "context", "prompt", "assets", "generate", "download"];
  const sortedPhases = Object.keys(traces).sort((a, b) => {
    const aIdx = phaseOrder.indexOf(a);
    const bIdx = phaseOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  if (sortedPhases.length === 0) {
    return <p className="text-sm text-text-tertiary">No traces available</p>;
  }

  return (
    <div className="space-y-2">
      {sortedPhases.map((phase) => {
        const phaseTraces = traces[phase];
        const isExpanded = expandedPhases.has(phase);

        return (
          <div key={phase} className="border border-border rounded-lg">
            <button
              onClick={() => togglePhase(phase)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{phase}</span>
                <span className="text-xs text-text-tertiary">
                  {phaseTraces.length} trace{phaseTraces.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-text-tertiary">{isExpanded ? "▼" : "▶"}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-border p-4 space-y-3">
                {phaseTraces.map((trace) => {
                  const isTraceExpanded = expandedTraces.has(trace.id);
                  const summary = buildSummary(trace);

                  return (
                    <div key={trace.id} className="bg-background rounded p-3">
                      <button
                        onClick={() => toggleTrace(trace.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-mono text-text-secondary">
                            {summary}
                          </span>
                          <span className="text-xs text-text-tertiary">
                            {isTraceExpanded ? "▼" : "▶"}
                          </span>
                        </div>
                        {trace.credits != null && (
                          <div className="text-xs text-primary font-medium mb-1">
                            {trace.credits} credits
                          </div>
                        )}
                        {trace.status === "error" && trace.error && (
                          <div className="text-xs text-error mb-1">
                            Error: {trace.error}
                          </div>
                        )}
                      </button>

                      {isTraceExpanded && (
                        <div className="mt-3 space-y-2">
                          {trace.input && (
                            <div>
                              <div className="text-xs font-medium text-text-secondary mb-1">
                                Input:
                              </div>
                              <pre className="text-xs font-mono bg-surface p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                                {formatJson(trace.input)}
                              </pre>
                              {trace.truncated && (
                                <div className="text-xs text-warning mt-1">
                                  [Truncated - full content available in API]
                                </div>
                              )}
                            </div>
                          )}
                          {trace.output && (
                            <div>
                              <div className="text-xs font-medium text-text-secondary mb-1">
                                Output:
                              </div>
                              <pre className="text-xs font-mono bg-surface p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                                {formatJson(trace.output)}
                              </pre>
                            </div>
                          )}
                          <div className="text-xs text-text-tertiary">
                            Duration: {trace.durationMs}ms · {new Date(trace.createdAt).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildSummary(trace: Trace): string {
  const parts: string[] = [];

  if (trace.provider) parts.push(trace.provider);
  if (trace.model) parts.push(trace.model);
  if (trace.step) parts.push(trace.step);
  if (trace.durationMs != null) parts.push(`${(trace.durationMs / 1000).toFixed(1)}s`);

  return parts.join(" · ") || trace.phase;
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}
