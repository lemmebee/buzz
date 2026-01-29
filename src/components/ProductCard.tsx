"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Product } from "../../drizzle/schema";
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

  async function retryExtraction() {
    setRetrying(true);
    try {
      // Trigger re-extraction by updating with same data
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          planFile: product.planFile,
          planFileName: product.planFileName,
          textProvider: product.textProvider,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProduct(updated);
        onUpdate?.(updated);
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
        alert("Error saving");
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
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex justify-between items-start mb-2">
          <span className="font-medium text-gray-900">{product.name}</span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <Link
                    href={`/products/${product.id}`}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowMenu(false)}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => { setShowInstagram(true); setShowMenu(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Link Instagram
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(product.id); setShowMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
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
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded animate-pulse">
              extracting...
            </span>
          )}
          {product.extractionStatus === "failed" && (
            <button
              onClick={retryExtraction}
              disabled={retrying}
              className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded flex items-center gap-1 hover:bg-red-200 transition-colors"
              title="Click to retry extraction"
            >
              {retrying ? "retrying..." : "failed ↻"}
            </button>
          )}
          {product.profile && (
            <button
              onClick={openProfileModal}
              className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
            >
              profile
            </button>
          )}
          {product.marketingStrategy && (
            <button
              onClick={openStrategyModal}
              className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
            >
              strategy
            </button>
          )}
          {product.planFileName && (
            <button
              onClick={openPlanModal}
              className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
            >
              plan
            </button>
          )}
          {product.textProvider && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{product.textProvider}</span>
          )}
          {audience && (
            <div className="relative group/audience inline-block">
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded cursor-help">
                audience
              </span>
              <div className="absolute left-0 top-full mt-2 hidden group-hover/audience:block z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                <div className="absolute left-4 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900" />
                {audience.primary && (
                  <p className="mb-1"><span className="text-gray-400">Primary:</span> {audience.primary}</p>
                )}
                {audience.demographics && (
                  <p className="mb-1"><span className="text-gray-400">Demographics:</span> {audience.demographics}</p>
                )}
                {audience.psychographics && (
                  <p><span className="text-gray-400">Psychographics:</span> {audience.psychographics}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <p className={`text-sm text-gray-600 ${showFullDesc ? "" : "line-clamp-2"}`}>{product.description}</p>
        {product.description.length > 100 && (
          <button
            onClick={() => setShowFullDesc(!showFullDesc)}
            className="text-xs text-blue-600 hover:text-blue-800 mt-1"
          >
            {showFullDesc ? "less" : "more"}
          </button>
        )}
      </div>

      {/* Plan File Modal */}
      {showPlanFile && (
        <Modal onClose={() => { setShowPlanFile(false); setEditModePlan(false); }}>
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">Plan File</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditModePlan(!editModePlan)}
                className={`text-xs px-2 py-1 rounded ${editModePlan ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
              >
                {editModePlan ? "Preview" : "Edit"}
              </button>
              <button
                onClick={() => { setShowPlanFile(false); setEditModePlan(false); }}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {editModePlan ? (
              <textarea
                value={editPlanFile}
                onChange={(e) => setEditPlanFile(e.target.value)}
                className="w-full h-full min-h-[400px] p-3 font-mono text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:mt-3 prose-headings:mb-1 prose-p:text-gray-700 prose-p:my-1 prose-li:text-gray-700 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-strong:text-gray-900 prose-code:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-100 prose-pre:text-gray-900 prose-pre:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{product.planFile || ""}</ReactMarkdown>
              </div>
            )}
          </div>
          {editModePlan && (
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => { setShowPlanFile(false); setEditModePlan(false); }}
                className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("planFile", editPlanFile)}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Product Profile Modal */}
      {showProfile && (
        <Modal onClose={() => { setShowProfile(false); setEditModeProfile(false); }}>
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">Product Profile</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditModeProfile(!editModeProfile)}
                className={`text-xs px-2 py-1 rounded ${editModeProfile ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
              >
                {editModeProfile ? "Preview" : "Edit"}
              </button>
              <button
                onClick={() => { setShowProfile(false); setEditModeProfile(false); }}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {editModeProfile ? (
              <JsonEditor data={editProfileData} onChange={setEditProfileData} />
            ) : (
              <div className="space-y-3">
                <JsonToMarkdown data={product.profile ? JSON.parse(product.profile) : {}} />
              </div>
            )}
          </div>
          {editModeProfile && (
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => { setShowProfile(false); setEditModeProfile(false); }}
                className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("profile", JSON.stringify(editProfileData))}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Marketing Strategy Modal */}
      {showStrategy && (
        <Modal onClose={() => { setShowStrategy(false); setEditModeStrategy(false); }}>
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">Marketing Strategy</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditModeStrategy(!editModeStrategy)}
                className={`text-xs px-2 py-1 rounded ${editModeStrategy ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
              >
                {editModeStrategy ? "Preview" : "Edit"}
              </button>
              <button
                onClick={() => { setShowStrategy(false); setEditModeStrategy(false); }}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {editModeStrategy ? (
              <JsonEditor data={editStrategyData} onChange={setEditStrategyData} />
            ) : (
              <div className="space-y-3">
                <JsonToMarkdown data={product.marketingStrategy ? JSON.parse(product.marketingStrategy) : {}} />
              </div>
            )}
          </div>
          {editModeStrategy && (
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => { setShowStrategy(false); setEditModeStrategy(false); }}
                className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => saveField("marketingStrategy", JSON.stringify(editStrategyData))}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
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
          <h4 className={`font-semibold text-gray-900 ${level === 0 ? "text-sm border-b border-gray-200 pb-1 mb-1" : "text-xs text-gray-600"}`}>
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
    return <p className="text-sm text-gray-400 italic">Not specified</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-gray-400 italic">None</p>;
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
                    <div className="bg-red-50 border-l-3 border-red-400 rounded p-2 text-sm">
                      <span className="font-medium text-red-700">Objection: </span>
                      <span className="text-red-900">{objection}</span>
                    </div>
                  )}
                  {counter && (
                    <div className="bg-green-50 border-l-3 border-green-400 rounded p-2 text-sm">
                      <span className="font-medium text-green-700">Counter: </span>
                      <span className="text-green-900">{counter}</span>
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
            <div key={i} className="bg-gray-50 rounded p-2 text-sm">
              {typeof item === "object" && item !== null ? (
                Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-medium text-gray-600 min-w-[80px]">{formatLabel(k)}:</span>
                    <span className="text-gray-700">{String(v)}</span>
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
      <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
        {value.map((item, i) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return <JsonToMarkdown data={value as Record<string, unknown>} level={level + 1} />;
  }
  return <p className="text-sm text-gray-700">{String(value)}</p>;
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
        <div key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {formatLabel(key)}
          </label>
          <FieldEditor value={value} onChange={(v) => updateField(key, v)} />
        </div>
      ))}
    </div>
  );
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
            />
            <button
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="px-2 py-1 text-red-600 hover:text-red-800 text-sm"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, ""])}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + Add item
        </button>
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-3 pl-4 border-l-2 border-gray-200">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{formatLabel(k)}</label>
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
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
      />
    );
  }

  return (
    <input
      type="text"
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
    />
  );
}
