"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Post, Product } from "../../../../drizzle/schema";

const statuses = ["draft", "approved", "scheduled", "posted"] as const;
const types = ["reel", "post", "story", "carousel"] as const;

export default function ContentEditPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  // Form state
  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [type, setType] = useState("post");
  const [status, setStatus] = useState("draft");
  const [mediaUrl, setMediaUrl] = useState("");

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchData() {
    const [postRes, productsRes] = await Promise.all([
      fetch(`/api/posts/${params.id}`),
      fetch("/api/products"),
    ]);

    if (!postRes.ok) {
      router.push("/content");
      return;
    }

    const postData = await postRes.json();
    const productsData = await productsRes.json();

    setPost(postData);
    setProducts(productsData);
    setContent(postData.content);
    setHashtags(
      postData.hashtags ? JSON.parse(postData.hashtags).join(", ") : ""
    );
    setType(postData.type);
    setStatus(postData.status);
    setMediaUrl(postData.mediaUrl || "");
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);

    const hashtagsArray = hashtags
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    await fetch(`/api/posts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        hashtags: hashtagsArray,
        type,
        status,
        mediaUrl: mediaUrl || null,
      }),
    });

    setSaving(false);
    router.push("/content");
  }

  async function handleDelete() {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${params.id}`, { method: "DELETE" });
    router.push("/content");
  }

  async function handlePostNow() {
    if (!confirm("Post to Instagram now?")) return;

    setPosting(true);
    const res = await fetch("/api/instagram/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: params.id }),
    });

    const data = await res.json();
    setPosting(false);

    if (!res.ok) {
      alert(data.error || "Failed to post");
      return;
    }

    setStatus("posted");
    setPost((p) => (p ? { ...p, status: "posted", instagramId: data.instagramId } : p));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const product = products.find((p) => p.id === post?.productId);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/content" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Edit Content</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 text-sm font-medium hover:text-red-800"
            >
              Delete
            </button>
            {status === "approved" && mediaUrl && (
              <button
                onClick={handlePostNow}
                disabled={posting}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {posting ? "Posting..." : "Post Now"}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Product info */}
          {product && (
            <div className="text-sm text-gray-500">
              Product: <span className="font-medium text-gray-700">{product.name}</span>
            </div>
          )}

          {/* Type & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Post content..."
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hashtags
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated, # optional</p>
          </div>

          {/* Media URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Media URL
            </label>
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="https://..."
            />
          </div>
        </div>
      </main>
    </div>
  );
}
