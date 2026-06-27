"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Product } from "../../drizzle/schema";
import { InstagramLinkModal } from "./InstagramLinkModal";
import { ProductFieldModal } from "./ProductFieldModal";

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

  // Poll for extraction completion
  useEffect(() => {
    if (product.extractionStatus === "pending" || product.extractionStatus === "extracting") {
      const interval = setInterval(async () => {
        const res = await fetch(`/api/products/${product.id}`);
        if (res.ok) {
          const updated = await res.json();
          setProduct(updated);
          if (updated.extractionStatus === "done" || updated.extractionStatus === "failed") {
            clearInterval(interval);
            onUpdate?.(updated);
          }
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [product.extractionStatus, product.id, onUpdate]);

  // Sync product data from parent
  useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  async function reExtract() {
    try {
      const res = await fetch(`/api/products/${product.id}/re-extract`, { method: "POST" });
      if (res.ok) {
        setProduct({ ...product, extractionStatus: "extracting" });
        toast.info("Re-extraction started");
      } else {
        const data = await res.json();
        toast.error(data.error || "Re-extraction failed");
      }
    } catch {
      toast.error("Re-extraction failed");
    }
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
            <button
              onClick={reExtract}
              className="text-xs px-2 py-0.5 bg-error-bg text-error rounded flex items-center gap-1 hover:bg-error/20 transition-colors"
            >
              failed ↻
            </button>
          )}
          {product.profile && (
            <button
              onClick={() => setShowProfile(true)}
              className="text-xs px-2 py-0.5 bg-success-bg text-success rounded hover:bg-success/20 transition-colors"
            >
              profile
            </button>
          )}
          {product.marketingStrategy && (
            <button
              onClick={() => setShowStrategy(true)}
              className="text-xs px-2 py-0.5 bg-warning-bg text-warning rounded hover:bg-warning/20 transition-colors"
            >
              strategy
            </button>
          )}
          {product.planFileName && (
            <button
              onClick={() => setShowPlanFile(true)}
              className="text-xs px-2 py-0.5 bg-info-bg text-info rounded hover:bg-info/20 transition-colors"
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
        <ProductFieldModal
          product={product}
          field="planFile"
          title="Plan File"
          onClose={() => setShowPlanFile(false)}
          onUpdate={(updated) => {
            setProduct(updated);
            onUpdate?.(updated);
          }}
          onReExtract={reExtract}
          isExtracting={isExtracting}
        />
      )}

      {/* Product Profile Modal */}
      {showProfile && (
        <ProductFieldModal
          product={product}
          field="profile"
          title="Product Profile"
          onClose={() => setShowProfile(false)}
          onUpdate={(updated) => {
            setProduct(updated);
            onUpdate?.(updated);
          }}
          onReExtract={reExtract}
          isExtracting={isExtracting}
        />
      )}

      {/* Marketing Strategy Modal */}
      {showStrategy && (
        <ProductFieldModal
          product={product}
          field="marketingStrategy"
          title="Marketing Strategy"
          onClose={() => setShowStrategy(false)}
          onUpdate={(updated) => {
            setProduct(updated);
            onUpdate?.(updated);
          }}
          onReExtract={reExtract}
          isExtracting={isExtracting}
        />
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
