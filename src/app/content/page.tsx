"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ContentCard } from "@/components/ContentCard";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";
import { ContentItem, Product } from "../../../drizzle/schema";

const statuses = ["all", "draft", "approved", "scheduled", "posted"] as const;

export default function ContentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-text-tertiary">Loading...</p></div>}>
      <ContentPageInner />
    </Suspense>
  );
}

function ContentPageInner() {
  const searchParams = useSearchParams();
  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();
  const [posts, setPosts] = useState<ContentItem[]>([]);
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
    confirm("Delete Post", "Are you sure you want to delete this post?", async () => {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      setPosts(posts.filter((p) => p.id !== id));
      toast.success("Post deleted");
    }, "destructive");
  }

  async function handleStatusChange(id: number, status: string) {
    const body: Record<string, unknown> = { status };
    if (status !== "scheduled") body.scheduledAt = null;
    await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPosts(
      posts
        .map((p) =>
          p.id === id
            ? { ...p, status, scheduledAt: status !== "scheduled" ? null : p.scheduledAt }
            : p
        )
        .filter((p) => filter === "all" || p.status === filter)
    );
    const labels: Record<string, string> = { approved: "Post approved", draft: "Post moved to drafts", scheduled: "Post scheduled", posted: "Post published" };
    toast.success(labels[status] || "Status updated");
  }

  async function handleSchedule(id: number, scheduledAt: string) {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "scheduled",
        scheduledAt: new Date(scheduledAt).toISOString(),
      }),
    });
    const updated = await res.json();
    setPosts(
      posts
        .map((p) =>
          p.id === id ? { ...p, status: "scheduled", scheduledAt: updated.scheduledAt } : p
        )
        .filter((p) => filter === "all" || p.status === filter)
    );
  }

  async function handlePostNow(id: number) {
    confirm("Post Now", "Post to Instagram now?", async () => {
      const res = await fetch("/api/instagram/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to post");
        return;
      }

      setPosts(
        posts
          .map((p) =>
            p.id === id ? { ...p, status: "posted", instagramId: data.instagramId } : p
          )
          .filter((p) => filter === "all" || p.status === filter)
      );
      toast.success("Posted to Instagram");
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters */}
        <div className="flex gap-4 mb-6 items-center">
          <div className="flex gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 text-sm rounded-lg capitalize ${
                  filter === status
                    ? "bg-primary text-white"
                    : "bg-surface text-text-secondary border border-border hover:border-border-strong"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-text-secondary bg-surface"
          >
            <option value="all">All Products</option>
            {Object.values(products).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-text-tertiary">Loading...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary mb-4">No content yet</p>
            <Link href="/generate" className="text-primary hover:text-primary-hover">
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
                  onSchedule={handleSchedule}
                />
              ))}
          </div>
        )}
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}
