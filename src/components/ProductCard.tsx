"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
  const [showInstagram, setShowInstagram] = useState(false);

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

  useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  const isExtracting = product.extractionStatus === "pending" || product.extractionStatus === "extracting";

  return (
    <>
      <div className="bg-surface rounded-lg border border-border p-4 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <Link
            href={`/products/${product.id}`}
            className="flex items-center gap-2 font-medium text-text-primary hover:text-primary transition-colors min-w-0"
          >
            {product.logo && (
              <Image
                src={product.logo}
                alt=""
                width={0}
                height={0}
                sizes="24px"
                unoptimized
                className="w-6 h-6 rounded object-contain shrink-0"
              />
            )}
            <span className="truncate">{product.name}</span>
          </Link>
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
                <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                  <Link
                    href={`/products/${product.id}`}
                    className="block px-4 py-2 text-sm text-text-secondary hover:bg-background"
                    onClick={() => setShowMenu(false)}
                  >
                    View details
                  </Link>
                  <Link
                    href={`/products/${product.id}?edit=true`}
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

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {isExtracting && (
            <span className="text-xs px-2 py-0.5 bg-warning-bg text-warning rounded animate-pulse">
              extracting...
            </span>
          )}
          {product.extractionStatus === "failed" && (
            <span className="text-xs px-2 py-0.5 bg-error-bg text-error rounded">
              extraction failed
            </span>
          )}
          {product.extractionStatus === "done" && product.profile && (
            <span className="text-xs px-2 py-0.5 bg-success-bg text-success rounded">
              extracted
            </span>
          )}
          {product.textProvider && (
            <span className="text-xs px-2 py-0.5 bg-primary/15 text-primary rounded">
              {product.textProvider}
            </span>
          )}
        </div>

        <p className={`text-sm text-text-secondary flex-1 ${showFullDesc ? "" : "line-clamp-2"}`}>
          {product.description}
        </p>
        {product.description.length > 100 && (
          <button
            onClick={() => setShowFullDesc(!showFullDesc)}
            className="text-xs text-primary hover:text-primary-hover mt-1 self-start"
          >
            {showFullDesc ? "less" : "more"}
          </button>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          <Link
            href={`/products/${product.id}`}
            className="text-sm text-primary hover:text-primary-hover font-medium"
          >
            View details &rarr;
          </Link>
        </div>
      </div>

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
