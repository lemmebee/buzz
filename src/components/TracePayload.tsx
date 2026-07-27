"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

/** Fields that hold prose worth reading as markdown rather than as JSON. */
const PROSE_FIELDS = new Set([
  "systemPrompt",
  "userPrompt",
  "prompt",
  "imagePrompt",
  "motionPrompt",
  "caption",
  "text",
  "message",
  "error",
  "description",
]);

const MEDIA_RE = /(\/api\/media\/[^\s"']+|https?:\/\/[^\s"']+\.(?:png|jpe?g|webp|gif|mp4|webm))/gi;
const VIDEO_RE = /\.(mp4|webm)(\?|$)/i;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
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
          <video
            key={url}
            src={url}
            controls
            className="max-h-48 rounded border border-border bg-background"
          />
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

function Prose({ value }: { value: string }) {
  return (
    <div
      className="text-sm text-text-secondary whitespace-pre-wrap font-mono leading-relaxed
        [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h1]:my-1 [&_h2]:my-1 [&_h3]:my-1
        [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-medium [&_h2]:font-medium
        [&_strong]:text-text-primary [&_code]:text-text-primary [&_a]:text-primary
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
    </div>
  );
}

function Field({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(true);

  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const media = Array.from(new Set(str.match(MEDIA_RE) ?? []));
  const isProse = typeof value === "string" && (PROSE_FIELDS.has(name) || value.length > 120);
  const isLong = str.length > 400;

  return (
    <div className="border-t border-border first:border-t-0 py-3">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs font-medium text-text-primary hover:text-primary"
        >
          {isLong ? (
            open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : null}
          {name}
        </button>
        <span className="text-xs text-text-muted">
          {typeof value === "string" ? `${value.length} chars` : typeof value}
        </span>
        <div className="ml-auto">
          <CopyButton value={str} />
        </div>
      </div>

      {open && (
        <>
          {isProse ? (
            <Prose value={value as string} />
          ) : (
            <pre className="text-xs text-text-secondary bg-background rounded border border-border p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {str}
            </pre>
          )}
          {media.length > 0 && <MediaPreview urls={media} />}
        </>
      )}
    </div>
  );
}

/**
 * Renders a trace's `input`/`output` JSON blob. Prompts come out as markdown,
 * media references render as previews, everything else stays inspectable JSON.
 */
export function TracePayload({ label, raw }: { label: string; raw: string | null }) {
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
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary">{label}</h3>
        <CopyButton value={raw} />
      </div>

      {entries ? (
        entries.map(([k, v]) => <Field key={k} name={k} value={v} />)
      ) : (
        <Field name="raw" value={raw} />
      )}
    </section>
  );
}
