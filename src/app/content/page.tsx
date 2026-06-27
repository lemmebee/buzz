"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ContentCard } from "@/components/ContentCard";
import { ContentCalendar } from "@/components/ContentCalendar";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";
import { ContentItem, Product } from "../../../drizzle/schema";
import { Check, Trash2, Calendar, X, Search, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 12;

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
  const router = useRouter();
  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<number | "all">(() => {
    const productParam = searchParams.get("product");
    return productParam ? parseInt(productParam) : "all";
  });

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false);
  const [bulkScheduleDate, setBulkScheduleDate] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "calendar">("grid");

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
    toast.success("Post scheduled");
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

  // Bulk actions
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    const postsOnPage = paginatedPosts;
    if (selectedIds.size === postsOnPage.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(postsOnPage.map((p) => p.id)));
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
    }
    setPosts(
      posts.map((p) => (selectedIds.has(p.id) ? { ...p, status: "approved" } : p))
    );
    setSelectedIds(new Set());
    toast.success(`${ids.length} post${ids.length > 1 ? "s" : ""} approved`);
  }

  async function handleBulkDelete() {
    confirm("Delete Posts", `Are you sure you want to delete ${selectedIds.size} posts?`, async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await fetch(`/api/posts/${id}`, { method: "DELETE" });
      }
      setPosts(posts.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      toast.success(`${ids.length} post${ids.length > 1 ? "s" : ""} deleted`);
    }, "destructive");
  }

  async function handleBulkSchedule() {
    if (!bulkScheduleDate) return;
    const ids = Array.from(selectedIds);
    const baseDate = new Date(bulkScheduleDate);
    
    for (let i = 0; i < ids.length; i++) {
      const scheduledAt = new Date(baseDate.getTime() + i * 60 * 60 * 1000); // Space by 1 hour
      await fetch(`/api/posts/${ids[i]}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
    }
    
    setPosts(
      posts.map((p) => {
        if (!selectedIds.has(p.id)) return p;
        const index = ids.indexOf(p.id);
        const scheduledAt = new Date(baseDate.getTime() + index * 60 * 60 * 1000);
        return { ...p, status: "scheduled", scheduledAt };
      })
    );
    setSelectedIds(new Set());
    setBulkScheduleOpen(false);
    setBulkScheduleDate("");
    toast.success(`${ids.length} post${ids.length > 1 ? "s" : ""} scheduled`);
  }

  const filteredPosts = posts.filter((p) => {
    // Product filter
    if (productFilter !== "all" && p.productId !== productFilter) return false;
    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase();
      const content = p.content?.toLowerCase() || "";
      const hashtags = p.hashtags?.toLowerCase() || "";
      if (!content.includes(query) && !hashtags.includes(query)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, productFilter, filter]);

  const selectedCount = selectedIds.size;

  // Status counts
  const statusCounts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    approved: posts.filter((p) => p.status === "approved").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    posted: posts.filter((p) => p.status === "posted").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters */}
        <div className="flex gap-4 mb-6 items-center flex-wrap">
          <div className="flex gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 text-sm rounded-lg capitalize flex items-center gap-1.5 ${
                  filter === status
                    ? "bg-primary text-white"
                    : "bg-surface text-text-secondary border border-border hover:border-border-strong"
                }`}
              >
                {status}
                <span className={`text-xs ${filter === status ? "text-white/70" : "text-text-tertiary"}`}>
                  {statusCounts[status]}
                </span>
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
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                viewMode === "grid"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-background"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                viewMode === "calendar"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-background"
              }`}
            >
              Calendar
            </button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedCount > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <span className="text-sm font-medium text-text-primary">
              {selectedCount} selected
            </span>
            <div className="flex gap-2 ml-auto">
              {selectedCount > 0 && filter === "draft" && (
                <button
                  onClick={handleBulkApprove}
                  className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/90"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
              )}
              <button
                onClick={() => setBulkScheduleOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-border"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Bulk Schedule Modal */}
        {bulkScheduleOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setBulkScheduleOpen(false)} />
            <div className="relative rounded-lg border border-border bg-surface p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Schedule Posts</h3>
              <p className="text-sm text-text-secondary mb-4">
                {selectedCount} posts will be scheduled starting from the selected time, spaced 1 hour apart.
              </p>
              <input
                type="datetime-local"
                value={bulkScheduleDate}
                onChange={(e) => setBulkScheduleDate(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setBulkScheduleOpen(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-border"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSchedule}
                  disabled={!bulkScheduleDate}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-text-tertiary">Loading...</p>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            {posts.length === 0 ? (
              <>
                <p className="text-text-tertiary mb-4">No content yet</p>
                <Link href="/generate" className="text-primary hover:text-primary-hover">
                  Generate your first content
                </Link>
              </>
            ) : (
              <p className="text-text-tertiary">
                {search ? `No content matches "${search}"` : "No content matches the current filters"}
              </p>
            )}
          </div>
        ) : viewMode === "calendar" ? (
          <ContentCalendar
            posts={filteredPosts}
            products={products}
            onPostClick={(post) => router.push(`/content/${post.id}`)}
          />
        ) : (
          <>
            {/* Select All */}
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {selectedCount === filteredPosts.length ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedPosts.map((post) => (
                <div key={post.id} className="relative">
                  {/* Selection Checkbox */}
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(post.id)}
                      onChange={() => toggleSelect(post.id)}
                      className="h-4 w-4 rounded border-border-strong"
                    />
                  </div>
                  <ContentCard
                    post={post}
                    productName={post.productId ? products[post.productId]?.name : undefined}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onPostNow={handlePostNow}
                    onSchedule={handleSchedule}
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`rounded-md px-3 py-2 text-sm ${
                        currentPage === page
                          ? "bg-primary text-white"
                          : "border border-border bg-surface text-text-secondary hover:bg-background"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}
