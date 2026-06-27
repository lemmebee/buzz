"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Product } from "../../drizzle/schema";
import { RevisionHistory } from "./RevisionHistory";
import { JsonEditor } from "./JsonEditor";
import { JsonToMarkdown } from "./JsonToMarkdown";

interface ProductFieldModalProps {
  product: Product;
  field: "planFile" | "profile" | "marketingStrategy";
  title: string;
  onClose: () => void;
  onUpdate: (updated: Product) => void;
  onReExtract?: () => void;
  isExtracting?: boolean;
}

export function ProductFieldModal({
  product,
  field,
  title,
  onClose,
  onUpdate,
  onReExtract,
  isExtracting,
}: ProductFieldModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Editable content
  const [editPlanFile, setEditPlanFile] = useState(product.planFile || "");
  const [editProfileData, setEditProfileData] = useState<Record<string, unknown>>(
    product.profile ? JSON.parse(product.profile) : {}
  );
  const [editStrategyData, setEditStrategyData] = useState<Record<string, unknown>>(
    product.marketingStrategy ? JSON.parse(product.marketingStrategy) : {}
  );

  // Close modal on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function reExtract() {
    if (!onReExtract) return;
    setRetrying(true);
    try {
      await onReExtract();
    } finally {
      setRetrying(false);
    }
  }

  async function saveField(value: string) {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: product.name,
        description: product.description,
        planFile: product.planFile,
        planFileName: product.planFileName,
        textProvider: product.textProvider,
      };

      if (field === "planFile") {
        payload.planFile = value;
      } else if (field === "profile") {
        payload.profile = value;
      } else if (field === "marketingStrategy") {
        payload.marketingStrategy = value;
      }

      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        toast.success("Saved successfully");
        onClose();
      } else {
        toast.error("Error saving");
      }
    } finally {
      setSaving(false);
    }
  }

  function getEditValue(): string {
    if (field === "planFile") return editPlanFile;
    if (field === "profile") return JSON.stringify(editProfileData);
    if (field === "marketingStrategy") return JSON.stringify(editStrategyData);
    return "";
  }

  function renderContent(content: string) {
    if (field === "planFile") {
      return (
        <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1 prose-p:text-text-secondary prose-p:my-1 prose-li:text-text-secondary prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-border prose-code:px-1 prose-code:rounded prose-pre:bg-border prose-pre:text-text-primary prose-pre:my-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      );
    }
    try {
      const data = JSON.parse(content);
      return (
        <div className="space-y-3">
          <JsonToMarkdown data={data} />
        </div>
      );
    } catch {
      return <p className="text-sm text-text-tertiary">Invalid JSON</p>;
    }
  }

  function renderEditView() {
    if (field === "planFile") {
      return (
        <textarea
          value={editPlanFile}
          onChange={(e) => setEditPlanFile(e.target.value)}
          className="w-full h-full min-h-[400px] p-3 font-mono text-sm border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
        />
      );
    }
    if (field === "profile") {
      return <JsonEditor data={editProfileData} onChange={setEditProfileData} />;
    }
    if (field === "marketingStrategy") {
      return <JsonEditor data={editStrategyData} onChange={setEditStrategyData} />;
    }
    return null;
  }

  function renderView() {
    if (field === "planFile") {
      return renderContent(product.planFile || "");
    }
    if (field === "profile") {
      try {
        const data = product.profile ? JSON.parse(product.profile) : {};
        return (
          <div className="space-y-3">
            <JsonToMarkdown data={data} />
          </div>
        );
      } catch {
        return <p className="text-sm text-text-tertiary">Invalid JSON</p>;
      }
    }
    if (field === "marketingStrategy") {
      try {
        const data = product.marketingStrategy ? JSON.parse(product.marketingStrategy) : {};
        return (
          <div className="space-y-3">
            <JsonToMarkdown data={data} />
          </div>
        );
      } catch {
        return <p className="text-sm text-text-tertiary">Invalid JSON</p>;
      }
    }
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h3 className="font-medium text-text-primary">{title}</h3>
          <div className="flex items-center gap-2">
            {historyMode ? (
              <button
                onClick={() => setHistoryMode(false)}
                className="text-xs px-2 py-1 rounded bg-warning-bg text-warning hover:bg-warning-bg"
              >
                &larr; Current
              </button>
            ) : (
              <>
                <button
                  onClick={() => setHistoryMode(true)}
                  className="text-xs px-2 py-1 rounded bg-border text-text-secondary"
                >
                  History
                </button>
                {onReExtract && (
                  <button
                    onClick={reExtract}
                    disabled={retrying || isExtracting}
                    className="text-xs px-2 py-1 rounded bg-success-bg text-success hover:bg-success-bg disabled:opacity-50"
                  >
                    {isExtracting ? "Extracting..." : "Re-extract"}
                  </button>
                )}
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`text-xs px-2 py-1 rounded ${editMode ? "bg-primary/15 text-primary" : "bg-border text-text-secondary"}`}
                >
                  {editMode ? "Preview" : "Edit"}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-secondary text-xl"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {historyMode ? (
            <RevisionHistory
              productId={product.id}
              field={field}
              renderContent={renderContent}
              onRevert={onUpdate}
            />
          ) : editMode ? (
            renderEditView()
          ) : (
            renderView()
          )}
        </div>
        {editMode && !historyMode && (
          <div className="flex justify-end gap-3 p-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-text-secondary font-medium rounded-lg border border-border-strong hover:bg-background"
            >
              Cancel
            </button>
            <button
              onClick={() => saveField(getEditValue())}
              disabled={saving}
              className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
