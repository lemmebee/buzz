"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product } from "../../../drizzle/schema";

type ContentType = "reel" | "post" | "carousel";

interface GeneratedPost {
  content: string;
  hashtags: string[];
}

const contentTypes: { value: ContentType; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
];

export default function GeneratePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [productId, setProductId] = useState<number | null>(null);
  const [contentType, setContentType] = useState<ContentType>("post");
  const [count, setCount] = useState(5);

  // Results
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setProducts(data);
        if (data.length > 0) setProductId(data[0].id);
        setLoading(false);
      });
  }, []);

  async function handleGenerate() {
    if (!productId) return;

    setGenerating(true);
    setGeneratedPosts([]);
    setSelected(new Set());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, contentType, count }),
      });

      if (!res.ok) throw new Error("Generation failed");

      const data = await res.json();
      setGeneratedPosts(data.posts || []);
      // Select all by default
      setSelected(new Set(data.posts?.map((_: unknown, i: number) => i) || []));
    } catch (e) {
      alert("Failed to generate content");
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (selected.size === 0) return;

    setSaving(true);

    try {
      const postsToSave = generatedPosts.filter((_, i) => selected.has(i));

      for (const post of postsToSave) {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            type: contentType,
            content: post.content,
            hashtags: post.hashtags,
            status: "draft",
          }),
        });
      }

      router.push("/content");
    } catch (e) {
      alert("Failed to save posts");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(index: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  }

  function toggleAll() {
    if (selected.size === generatedPosts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(generatedPosts.map((_, i) => i)));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Generate Content</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Add a product first</p>
            <Link href="/products/new" className="text-blue-600 hover:text-blue-800">
              Add product
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Generation form */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Product selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product
                  </label>
                  <select
                    value={productId || ""}
                    onChange={(e) => setProductId(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Content Type
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as ContentType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    {contentTypes.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Count */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !productId}
                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>

            {/* Generated content */}
            {generatedPosts.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">
                    Generated Content ({generatedPosts.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={toggleAll}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      {selected.size === generatedPosts.length ? "Deselect All" : "Select All"}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || selected.size === 0}
                      className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : `Save ${selected.size} to Queue`}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {generatedPosts.map((post, i) => (
                    <div
                      key={i}
                      onClick={() => toggleSelect(i)}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selected.has(i)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-gray-900 whitespace-pre-wrap">
                            {post.content}
                          </p>
                          {post.hashtags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {post.hashtags.map((tag, j) => (
                                <span key={j} className="text-xs text-blue-600">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
