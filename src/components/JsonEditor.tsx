"use client";

interface JsonEditorProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function FieldEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={typeof item === "object" ? JSON.stringify(item) : String(item)}
              onChange={(e) => {
                const newArr = [...value];
                newArr[i] = e.target.value;
                onChange(newArr);
              }}
              className="flex-1 px-3 py-2 border border-border-strong rounded text-sm text-text-primary"
            />
            <button
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="px-2 py-1 text-error hover:text-error text-sm"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, ""])}
          className="text-xs text-primary hover:text-primary-hover"
        >
          + Add item
        </button>
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-3 pl-4 border-l-2 border-border">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <label className="block text-xs font-medium text-text-tertiary mb-1">{formatLabel(k)}</label>
            <FieldEditor
              value={v}
              onChange={(newV) => onChange({ ...(value as Record<string, unknown>), [k]: newV })}
            />
          </div>
        ))}
      </div>
    );
  }

  const strValue = value === null || value === undefined ? "" : String(value);
  const isLong = strValue.length > 100;

  if (isLong) {
    return (
      <textarea
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-border-strong rounded text-sm text-text-primary"
      />
    );
  }

  return (
    <input
      type="text"
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-border-strong rounded text-sm text-text-primary"
    />
  );
}

export function JsonEditor({ data, onChange }: JsonEditorProps) {
  function updateField(key: string, value: unknown) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="border border-border rounded-lg p-4 bg-background">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {formatLabel(key)}
          </label>
          <FieldEditor value={value} onChange={(v) => updateField(key, v)} />
        </div>
      ))}
    </div>
  );
}
