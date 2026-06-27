"use client";

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function renderMarkdownValue(value: unknown, level: number): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <p className="text-sm text-text-muted italic">Not specified</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-text-muted italic">None</p>;
    // Check if array contains objects
    const hasObjects = value.some(item => typeof item === "object" && item !== null);
    if (hasObjects) {
      // Check if it's objection/counter pattern
      const isObjectionPattern = value.some(item =>
        typeof item === "object" && item !== null &&
        ("objection" in item || "counter" in item)
      );

      if (isObjectionPattern) {
        return (
          <div className="space-y-3 mt-1">
            {value.map((item, i) => {
              const obj = item as Record<string, unknown>;
              const objection = obj.objection ? String(obj.objection) : null;
              const counter = obj.counter ? String(obj.counter) : null;
              return (
                <div key={i} className="space-y-1">
                  {objection && (
                    <div className="bg-error-bg border-l border-red-400 rounded p-2 text-sm">
                      <span className="font-medium text-error">Objection: </span>
                      <span className="text-error">{objection}</span>
                    </div>
                  )}
                  {counter && (
                    <div className="bg-success-bg border-l border-green-400 rounded p-2 text-sm">
                      <span className="font-medium text-success">Counter: </span>
                      <span className="text-success">{counter}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      return (
        <div className="space-y-2 mt-1">
          {value.map((item, i) => (
            <div key={i} className="bg-background rounded p-2 text-sm">
              {typeof item === "object" && item !== null ? (
                Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-medium text-text-secondary min-w-[80px]">{formatLabel(k)}:</span>
                    <span className="text-text-secondary">{String(v)}</span>
                  </div>
                ))
              ) : (
                String(item)
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="list-disc list-inside text-sm text-text-secondary space-y-0.5">
        {value.map((item, i) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return <JsonToMarkdown data={value as Record<string, unknown>} level={level + 1} />;
  }
  return <p className="text-sm text-text-secondary">{String(value)}</p>;
}

interface JsonToMarkdownProps {
  data: Record<string, unknown>;
  level?: number;
}

export function JsonToMarkdown({ data, level = 0 }: JsonToMarkdownProps) {
  return (
    <>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className={level > 0 ? "ml-3 mt-2" : ""}>
          <h4 className={`font-semibold text-text-primary ${level === 0 ? "text-sm border-b border-border pb-1 mb-1" : "text-xs text-text-secondary"}`}>
            {formatLabel(key)}
          </h4>
          {renderMarkdownValue(value, level)}
        </div>
      ))}
    </>
  );
}
