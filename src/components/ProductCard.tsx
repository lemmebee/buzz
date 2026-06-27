"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Product, ProductRevision } from "../../drizzle/schema";
import { InstagramLinkModal } from "./InstagramLinkModal";

interface ProductCardProps {
  product: Product;
  onDelete?: (id: number) => void;
  onUpdate?: (updated: Product) => void;
}

export function ProductCard({ product: initialProduct, onDelete, onUpdate }: ProductCardProps) {
  const [product, setProduct] = useState(initialProduct);
  const [showMenu, setShowMenu] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showPlanFile, setShowPlanFile] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showStrategy, setShowStrategy] = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Edit mode toggles
  const [editModePlan, setEditModePlan] = useState(false);
  const [editModeProfile, setEditModeProfile] = useState(false);
  const [editModeStrategy, setEditModeStrategy] = useState(false);

  // History panel toggles
  const [historyField, setHistoryField] = useState<"planFile" | "profile" | "marketingStrategy" | null>(null);

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
        if (showPlanFile) { setShowPlanFile(false); setEditModePlan(false); }
        if (showProfile) { setShowProfile(false); setEditModeProfile(false); }
        if (showStrategy) { setShowStrategy(false); setEditModeStrategy(false); }
      }
    }
    if (showPlanFile || showProfile || showStrategy) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [showPlanFile, showProfile, showStrategy]);

  // Poll for extraction completion (don't update parent to avoid re-render issues)
  useEffect(() => {
    if (product.extractionStatus === "pending" || product.extractionStatus === "extracting") {
      const interval = setInterval(async () => {
        const res = await fetch(`/api/products/${product.id}`);
        if (res.ok) {
          const updated = await res.json();
          setProduct(updated);
          if (updated.extractionStatus === "done" || updated.extractionStatus === "failed") {
            clearInterval(interval);
            onUpdate?.(updated); // Only notify parent when done
          }
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [product.extractionStatus, product.id, onUpdate]);

  // Sync product data from parent (but preserve local UI state like expanded)
  useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  async function reExtract() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/products/${product.id}/re-extract`, { method: "POST" });
      if (res.ok) {
        setProduct({ ...product, extractionStatus: "extracting" });
      } else {
        const data = await res.json();
        toast.error(data.error || "Re-extraction failed");
      }
    } finally {
      setRetrying(false);
    }
  }

  async function saveField(field: "planFile" | "profile" | "marketingStrategy", value: string) {
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
        setProduct(updated);
        onUpdate?.(updated);
        if (field === "planFile") { setShowPlanFile(false); setEditModePlan(false); }
        if (field === "profile") { setShowProfile(false); setEditModeProfile(false); }
        if (field === "marketingStrategy") { setShowStrategy(false); setEditModeStrategy(false); }
      } else {
        toast.error("Error saving");
      }
    } finally {
      setSaving(false);
    }
  }

  function openPlanModal() {
    setEditPlanFile(product.planFile || "");
    setEditModePlan(false);
    setShowPlanFile(true);
  }

  function openProfileModal() {
    setEditProfileData(product.profile ? JSON.parse(product.profile) : {});
    setEditModeProfile(false);
    setShowProfile(true);
  }

  function openStrategyModal() {
    setEditStrategyData(product.marketingStrategy ? JSON.parse(product.marketingStrategy) : {});
    setEditModeStrategy(false);
    setShowStrategy(true);
  }

  const isExtracting = product.extractionStatus === "pending" || product.extractionStatus === "extracting";

  const audience = product.profile ? JSON.parse(product.profile)?.audience : null;

  return (
    <>
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="flex justify-between items-start mb-2">
          <span className="font-medium text-text-primary">{product.name}</span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-text-muted hover:text-text-secondary rounded"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 mt-1 w-32 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                  <Link
                    href={`/products/${product.id}`}
                    className="block px-4 py-2 text-sm text-text-secondary hover:bg-background"
                    onClick={() => setShowMenu(false)}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => { setShowInstagram(true); setShowMenu(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-background"
                  >
                    Link Instagram
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(product.id); setShowMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-error hover:bg-background"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 mb-2">
          {isExtracting && (
            <span className="text-xs px-2 py-0.5 bg-warning-bg text-warning rounded animate-pulse">
              extracting...
            </span>
          )}
          {product.extractionStatus === "failed" && (
            <div className="relative group/failed inline-block">
              <button
                onClick={reExtract}
                disabled={retrying}
                className="text-xs px-2 py-0.5 bg-error-bg text-error rounded flex items-center gap-1 hover:bg-red-200 transition-colors"
              >
                {retrying ? "retrying..." : "failed ↻"}
              </button>
              <div className="absolute left-0 top-full mt-2 hidden group-hover/failed:block z-10 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                <div className="absolute left-4 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900" />
                <p className="mb-1 font-medium text-error/60">Extraction failed</p>
                <p className="leading-relaxed">
                  {product.extractionError || "We couldn't analyse this product. Click the badge to try again."}
                </p>
                <p className="mt-2 text-text-muted">Click the badge to retry.</p>
              </div>
            </div>
          )}
          {product.profile && (
            <button
              onClick={openProfileModal}
              className="text-xs px-2 py-0.5 bg-success-bg text-success rounded hover:bg-success-bg transition-colors"
            >
              profile
            </button>
          )}
          {product.marketingStrategy && (
            <button
              onClick={openStrategyModal}
              className="text-xs px-2 py-0.5 bg-warning-bg text-warning rounded hover:bg-warning-bg transition-colors"
            >
              strategy
            </button>
          )}
          {product.planFileName && (
            <button
              onClick={openPlanModal}
              className="text-xs px-2 py-0.5 bg-info-bg text-info rounded hover:bg-purple-200 transition-colors"
            >
              plan
            </button>
          )}
          {product.textProvider && (
            <span className="text-xs px-2 py-0.5 bg-primary/15 text-primary rounded">{product.textProvider}</span>
          )}
          {audience && (
            <div className="relative group/audience inline-block">
              <span className="text-xs px-2 py-0.5 bg-info-bg text-info rounded cursor-help">
                audience
              </span>
              <div className="absolute left-0 top-full mt-2 hidden group-hover/audience:block z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                <div className="absolute left-4 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900" />
                {audience.primary && (
                  <p className="mb-1"><span className="text-text-muted">Primary:</span> {audience.primary}</p>
                )}
                {audience.demographics && (
                  <p className="mb-1"><span className="text-text-muted">Demographics:</span> {audience.demographics}</p>
                )}
                {audience.psychographics && (
                  <p><span className="text-text-muted">Psychographics:</span> {audience.psychographics}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <p className={`text-sm text-text-secondary ${showFullDesc ? "" : "line-clamp-2"}`}>{product.description}</p>
        {product.description.length > 100 && (
          <button
            onClick={() => setShowFullDesc(!showFullDesc)}
            className="text-xs text-primary hover:text-primary-hover mt-1"
          >
            {showFullDesc ? "less" : "more"}
          </button>
        )}
      </div>

      {/* Plan File Modal */}
      {showPlanFile && (
        <Modal onClose={() => { setShowPlanFile(false); setEditModePlan(false); setHistoryField(null); }}>
          <div className="flex justify-between items-center p-4 border-b border-border">
            <h3 className="font-medium text-text-primary">Plan File</h3>
            <div className="flex items-center gap-2">
              {historyField === "planFile" ? (
                <button
                  onClick={() => setHistoryField(null)}
                  className="text-xs px-2 py-1 rounded bg-warning-bg text-warning hover:bg-warning-bg"
                >
                  &larr; Current
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setEditModePlan(false); setHistoryField("planFile"); }}
                    className="text-xs px-2 py-1 rounded bg-border text-text-secondary"
                  >
                    History
                  </button>
                  <button
                    onClick={() => { reExtract(); setShowPlanFile(false); }}
                    disabled={retrying || isExtracting}
                    className="text-xs px-2 py-1 rounded bg-success-bg text-success hover:bg-success-bg disabled:opacity-50"
                  >
                    {isExtracting ? "Extracting..." : "Re-extract"}
                  </button>
                  <button
                    onClick={() => setEditModePlan(!editModePlan)}
                    className={`text-xs px-2 py-1 rounded ${editModePlan ? "bg-primary/15 text-primary" : "bg-border text-text-secondary"}`}
                  >
                    {editModePlan ? "Preview" : "Edit"}
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowPlanFile(false); setEditModePlan(false); setHistoryField(null); }}
                className="text-text-tertiary hover:text-text-secondary text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {historyField === "planFile" ? (
              <RevisionPanel
                productId={product.id}
                field="planFile"
                renderContent={(content) => (
                  <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1 prose-p:text-text-secondary prose-p:my-1 prose-li:text-text-secondary prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-border prose-code:px-1 prose-code:rounded prose-pre:bg-border prose-pre:text-text-primary prose-pre:my-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                )}
                onRevert={(updated) => {
                  setProduct(updated);
                  onUpdate?.(updated);
                  setHistoryField(null);
                }}
              />
            ) : editModePlan ? (
              <textarea
                value={editPlanFile}
                onChange={(e) => setEditPlanFile(e.target.value)}
                className="w-full h-full min-h-[400px] p-3 font-mono text-sm border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
              />
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1 prose-p:text-text-secondary prose-p:my-1 prose-li:text-text-secondary prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-border prose-code:px-1 prose-code:rounded prose-pre:bg-border prose-pre:text-text-primary prose-pre:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{product.planFile || ""}</ReactMarkdown>
              </div>
            )}
          </div>
          {editModePlan && !historyField && (
            <div className="flex justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={() => { setShowPlanFile(false); setEditModePlan(false); }}
                className="px-4 py-2 text-text-secondary font-medium rounded-lg border border-border-strong hover:bg-background"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("planFile", editPlanFile)}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Product Profile Modal */}
      {showProfile && (
        <Modal onClose={() => { setShowProfile(false); setEditModeProfile(false); setHistoryField(null); }}>
          <div className="flex justify-between items-center p-4 border-b border-border">
            <h3 className="font-medium text-text-primary">Product Profile</h3>
            <div className="flex items-center gap-2">
              {historyField === "profile" ? (
                <button
                  onClick={() => setHistoryField(null)}
                  className="text-xs px-2 py-1 rounded bg-warning-bg text-warning hover:bg-warning-bg"
                >
                  &larr; Current
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setEditModeProfile(false); setHistoryField("profile"); }}
                    className="text-xs px-2 py-1 rounded bg-border text-text-secondary"
                  >
                    History
                  </button>
                  <button
                    onClick={() => setEditModeProfile(!editModeProfile)}
                    className={`text-xs px-2 py-1 rounded ${editModeProfile ? "bg-primary/15 text-primary" : "bg-border text-text-secondary"}`}
                  >
                    {editModeProfile ? "Preview" : "Edit"}
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowProfile(false); setEditModeProfile(false); setHistoryField(null); }}
                className="text-text-tertiary hover:text-text-secondary text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {historyField === "profile" ? (
              <RevisionPanel
                productId={product.id}
                field="profile"
                renderContent={(content) => (
                  <div className="space-y-3">
                    <JsonToMarkdown data={JSON.parse(content)} />
                  </div>
                )}
                onRevert={(updated) => {
                  setProduct(updated);
                  onUpdate?.(updated);
                  setHistoryField(null);
                }}
              />
            ) : editModeProfile ? (
              <JsonEditor data={editProfileData} onChange={setEditProfileData} />
            ) : (
              <div className="space-y-3">
                <JsonToMarkdown data={product.profile ? JSON.parse(product.profile) : {}} />
              </div>
            )}
          </div>
          {editModeProfile && !historyField && (
            <div className="flex justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={() => { setShowProfile(false); setEditModeProfile(false); }}
                className="px-4 py-2 text-text-secondary font-medium rounded-lg border border-border-strong hover:bg-background"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("profile", JSON.stringify(editProfileData))}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Marketing Strategy Modal */}
      {showStrategy && (
        <Modal onClose={() => { setShowStrategy(false); setEditModeStrategy(false); setHistoryField(null); }}>
          <div className="flex justify-between items-center p-4 border-b border-border">
            <h3 className="font-medium text-text-primary">Marketing Strategy</h3>
            <div className="flex items-center gap-2">
              {historyField === "marketingStrategy" ? (
                <button
                  onClick={() => setHistoryField(null)}
                  className="text-xs px-2 py-1 rounded bg-warning-bg text-warning hover:bg-warning-bg"
                >
                  &larr; Current
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setEditModeStrategy(false); setHistoryField("marketingStrategy"); }}
                    className="text-xs px-2 py-1 rounded bg-border text-text-secondary"
                  >
                    History
                  </button>
                  <button
                    onClick={() => setEditModeStrategy(!editModeStrategy)}
                    className={`text-xs px-2 py-1 rounded ${editModeStrategy ? "bg-primary/15 text-primary" : "bg-border text-text-secondary"}`}
                  >
                    {editModeStrategy ? "Preview" : "Edit"}
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowStrategy(false); setEditModeStrategy(false); setHistoryField(null); }}
                className="text-text-tertiary hover:text-text-secondary text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {historyField === "marketingStrategy" ? (
              <RevisionPanel
                productId={product.id}
                field="marketingStrategy"
                renderContent={(content) => (
                  <div className="space-y-3">
                    <JsonToMarkdown data={JSON.parse(content)} />
                  </div>
                )}
                onRevert={(updated) => {
                  setProduct(updated);
                  onUpdate?.(updated);
                  setHistoryField(null);
                }}
              />
            ) : editModeStrategy ? (
              <JsonEditor data={editStrategyData} onChange={setEditStrategyData} />
            ) : (
              <div className="space-y-3">
                <JsonToMarkdown data={product.marketingStrategy ? JSON.parse(product.marketingStrategy) : {}} />
              </div>
            )}
          </div>
          {editModeStrategy && !historyField && (
            <div className="flex justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={() => { setShowStrategy(false); setEditModeStrategy(false); }}
                className="px-4 py-2 text-text-secondary font-medium rounded-lg border border-border-strong hover:bg-background"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("marketingStrategy", JSON.stringify(editStrategyData))}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Instagram Link Modal */}
      {showInstagram && (
        <InstagramLinkModal
          productId={product.id}
          linkedAccountId={product.instagramAccountId ?? null}
          onClose={() => setShowInstagram(false)}
          onLinked={(accountId) => {
            const updated = { ...product, instagramAccountId: accountId };
            setProduct(updated);
            onUpdate?.(updated);
          }}
        />
      )}
    </>
  );
}

// Modal wrapper with backdrop click to close
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {children}
      </div>
    </div>
  );
}

// Render JSON as compact styled content
function JsonToMarkdown({ data, level = 0 }: { data: Record<string, unknown>; level?: number }) {
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

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}


// Form-like JSON editor
function JsonEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void }) {
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

// Revision history panel
function RevisionPanel({
  productId,
  field,
  renderContent,
  onRevert,
}: {
  productId: number;
  field: "planFile" | "profile" | "marketingStrategy";
  renderContent: (content: string) => React.ReactNode;
  onRevert: (updated: Product) => void;
}) {
  const [revisions, setRevisions] = useState<ProductRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    fetch(`/api/products/${productId}/revisions?field=${field}`)
      .then((r) => r.json())
      .then((data) => { setRevisions(data); setLoading(false); })
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
