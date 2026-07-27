"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

/** Fields that hold prose worth reading as markdown rather than as data. */
const PROSE_FIELDS = new Set([
  "systemPrompt",
  "userPrompt",
  "prompt",
  "imagePrompt",
  "motionPrompt",
  "caption",
  "script",
  "message",
  "error",
  "description",
]);

const MEDIA_RE = /(\/api\/media\/[^\s"']+|https?:\/\/[^\s"']+\.(?:png|jpe?g|webp|gif|mp4|webm))/gi;
const VIDEO_RE = /\.(mp4|webm)(\?|$)/i;
const MAX_DEPTH = 4;

/** A string that is really a JSON document — very common for model responses. */
function parseJsonString(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!(t.startsWith("{") && t.endsWith("}")) && !(t.startsWith("[") && t.endsWith("]"))) return null;
  try {
    const parsed = JSON.parse(t);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-text-muted hover:text-text-secondary shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function MediaPreview({ urls }: { urls: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url) =>
        VIDEO_RE.test(url) ? (
          <video key={url} src={url} controls className="max-h-48 rounded border border-border bg-background" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt="trace asset"
            className="max-h-48 rounded border border-border bg-background object-contain"
          />
        )
      )}
    </div>
  );
}

/** Long values scroll inside their own box rather than stretching the page. */
function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="max-h-96 overflow-y-auto overflow-x-hidden">{children}</div>;
}

function Prose({ value }: { value: string }) {
  return (
    <Scroller>
      <div
        className="text-sm text-text-secondary leading-relaxed break-words
          [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
          [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm
          [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_h1]:text-text-primary [&_h2]:text-text-primary
          [&_strong]:text-text-primary [&_a]:text-primary
          [&_code]:text-text-primary [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
          [&_pre]:bg-background [&_pre]:border [&_pre]:border-border [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto
          [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-tertiary"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    </Scroller>
  );
}

function Plain({ value }: { value: string }) {
  return (
    <Scroller>
      <pre className="text-xs text-text-secondary bg-background rounded border border-border p-2 whitespace-pre-wrap break-words">
        {value}
      </pre>
    </Scroller>
  );
}

/** Primitive rendered inline — keeps small values on one tidy line. */
function Scalar({ value }: { value: unknown }) {
  const text = String(value);
  const tone =
    typeof value === "number" ? "text-primary"
    : typeof value === "boolean" ? (value ? "text-success" : "text-error")
    : "text-text-secondary";
  return <span className={`text-sm font-mono ${tone} break-all`}>{text}</span>;
}

function Node({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const nested = parseJsonString(value);
  const effective = nested ?? value;

  const isObject = typeof effective === "object" && effective !== null;
  const isArray = Array.isArray(effective);
  const isPrimitiveArray = isArray && (effective as unknown[]).every((v) => typeof v !== "object");

  // Objects start open near the top and collapsed deeper down, so a big
  // response is scannable instead of a wall.
  const [open, setOpen] = useState(depth < 2);

  const raw = typeof effective === "string" ? effective : JSON.stringify(effective, null, 2);
  const media = Array.from(new Set(raw.match(MEDIA_RE) ?? []));

  const expandable = isObject && depth < MAX_DEPTH && !isPrimitiveArray;

  return (
    <div className="border-t border-border first:border-t-0 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => expandable && setOpen(!open)}
          className={`flex items-center gap-1 text-xs font-medium text-text-primary ${
            expandable ? "hover:text-primary" : "cursor-default"
          }`}
        >
          {expandable ? (
            open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : (
            <span className="w-3" />
          )}
          {name}
        </button>

        <span className="text-[11px] text-text-muted">
          {isArray
            ? `${(effective as unknown[]).length} items`
            : isObject
              ? `${Object.keys(effective as object).length} fields`
              : typeof effective === "string"
                ? `${(effective as string).length} chars`
                : typeof effective}
          {nested ? " · json" : ""}
        </span>

        <div className="ml-auto">
          <CopyButton value={raw} />
        </div>
      </div>

      {open && (
        <div className={depth > 0 ? "pl-4 mt-1" : "mt-1"}>
          {isPrimitiveArray ? (
            <ul className="text-sm text-text-secondary list-disc pl-5 space-y-0.5">
              {(effective as unknown[]).map((v, i) => (
                <li key={i} className="break-words">{String(v)}</li>
              ))}
            </ul>
          ) : isObject && depth < MAX_DEPTH ? (
            Object.entries(effective as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} />)
          ) : typeof effective === "string" ? (
            PROSE_FIELDS.has(name) || effective.length > 200 ? (
              <Prose value={effective} />
            ) : (
              <Scalar value={effective} />
            )
          ) : isObject ? (
            <Plain value={raw} />
          ) : (
            <Scalar value={effective} />
          )}

          {media.length > 0 && <MediaPreview urls={media} />}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a trace's `input`/`output` payload. Model responses are usually JSON
 * documents rather than prose, so they are walked as a structure; prompts and
 * other long text render as markdown. Raw is always one click away.
 */
export function TracePayload({ label, raw }: { label: string; raw: string | null }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const entries =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.entries(parsed as Record<string, unknown>).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        )
      : null;

  return (
    <section className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-medium text-text-primary">{label}</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-text-tertiary hover:text-primary"
          >
            {showRaw ? "Formatted" : "Raw"}
          </button>
          <CopyButton value={raw} />
        </div>
      </div>

      {showRaw || !entries ? (
        <Plain value={entries ? JSON.stringify(parsed, null, 2) : raw} />
      ) : (
        entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={0} />)
      )}
    </section>
  );
}
