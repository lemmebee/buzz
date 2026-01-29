"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ContentCard } from "@/components/ContentCard";
import { Post, Product } from "../../../drizzle/schema";

const statuses = ["all", "draft", "approved", "scheduled", "posted"] as const;

export default function ContentPage() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<number | "all">(() => {
    const productParam = searchParams.get("product");
    return productParam ? parseInt(productParam) : "all";
  });

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function fetchData() {
    setLoading(true);
    const url = filter === "all" ? "/api/posts" : `/api/posts?status=${filter}`;
    const [postsRes, productsRes] = await Promise.all([
      fetch(url),
      fetch("/api/products"),
    ]);

    const postsData = await postsRes.json();
    const productsData: Product[] = await productsRes.json();

    setPosts(postsData);
    setProducts(
      productsData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
    );
    setLoading(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setPosts(posts.filter((p) => p.id !== id));
  }

  async function handleStatusChange(id: number, status: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setPosts(
      posts.map((p) => (p.id === id ? { ...p, status } : p))
    );
  }

  async function handlePostNow(id: number) {
    if (!confirm("Post to Instagram now?")) return;

    const res = await fetch("/api/instagram/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: id }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to post");
      return;
    }

    setPosts(
      posts.map((p) =>
        p.id === id ? { ...p, status: "posted", instagramId: data.instagramId } : p
      )
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Content Queue</h1>
          </div>
          <Link
            href="/generate"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Generate Content
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex gap-4 mb-6 items-center">
          <div className="flex gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 text-sm rounded-lg capitalize ${
                  filter === status
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 bg-white"
          >
            <option value="all">All Products</option>
            {Object.values(products).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No content yet</p>
            <Link href="/generate" className="text-blue-600 hover:text-blue-800">
              Generate your first content
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts
              .filter((p) => productFilter === "all" || p.productId === productFilter)
              .map((post) => (
                <ContentCard
                  key={post.id}
                  post={post}
                  productName={post.productId ? products[post.productId]?.name : undefined}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onPostNow={handlePostNow}
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
