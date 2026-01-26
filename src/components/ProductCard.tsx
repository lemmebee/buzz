"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Product } from "../../drizzle/schema";

interface ProductCardProps {
  product: Product;
  onDelete?: (id: number) => void;
}

export function ProductCard({ product, onDelete }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPlanFile, setShowPlanFile] = useState(false);
  const themes = product.themes ? JSON.parse(product.themes) : [];
  const features = product.features ? JSON.parse(product.features) : [];

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="font-medium text-gray-900">{product.name}</span>
            <div className="flex items-center gap-2">
              {product.planFileName && (
                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                  has plan
                </span>
              )}
              {product.tone && (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                  {product.tone}
                </span>
              )}
              <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
        </button>

        {expanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
            {product.planFileName && (
              <div>
                <span className="text-xs font-medium text-gray-500">Plan File</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-900">{product.planFileName}</span>
                  <button
                    onClick={() => setShowPlanFile(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    View
                  </button>
                </div>
              </div>
            )}

            {product.url && (
              <div>
                <span className="text-xs font-medium text-gray-500">URL</span>
                <p className="text-sm text-gray-900">{product.url}</p>
              </div>
            )}

            {product.audience && (
              <div>
                <span className="text-xs font-medium text-gray-500">Target Audience</span>
                <p className="text-sm text-gray-900">{product.audience}</p>
              </div>
            )}

            {features.length > 0 && (
              <div>
                <span className="text-xs font-medium text-gray-500">Features</span>
                <ul className="mt-1 space-y-1">
                  {features.map((feature: string, i: number) => (
                    <li key={i} className="text-sm text-gray-900">• {feature}</li>
                  ))}
                </ul>
              </div>
            )}

            {themes.length > 0 && (
              <div>
                <span className="text-xs font-medium text-gray-500">Themes</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {themes.map((theme: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <Link
                href={`/products/${product.id}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </Link>
              {onDelete && (
                <button
                  onClick={() => onDelete(product.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Plan File Modal */}
      {showPlanFile && product.planFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">{product.planFileName}</h3>
              <button
                onClick={() => setShowPlanFile(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            <div className="overflow-auto flex-1 p-6 prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-100 prose-pre:text-gray-900 prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-th:text-gray-900 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-2 prose-td:text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{product.planFile}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
