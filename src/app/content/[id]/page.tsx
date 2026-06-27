"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentItem as Post, Product } from "../../../../drizzle/schema";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";

const statuses = ["draft", "approved", "scheduled", "posted"] as const;
const types = ["reel", "post", "story", "ad"] as const;

export default function ContentEditPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Form state
  const [content, setContent] = useState("");
  const [type, setType] = useState("post");
  const [status, setStatus] = useState("draft");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

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
    const existingHashtags: string[] = postData.hashtags
      ? JSON.parse(postData.hashtags)
      : [];
    const tagSuffix =
      existingHashtags.length > 0
        ? "\n\n" +
          existingHashtags
            .map((t: string) => `#${t.replace(/^#+/, "")}`)
            .join(" ")
        : "";
    setContent(`${postData.content}${tagSuffix}`);
    setType(postData.type);
    setStatus(postData.status);
    setMediaUrl(postData.mediaUrl || "");
    setScheduledAt(
      postData.scheduledAt
        ? new Date(postData.scheduledAt).toISOString().slice(0, 16)
        : ""
    );
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);

    // Extract hashtags from content (anything starting with #)
    const hashtagMatches = content.match(/#[\w\u0080-\uFFFF]+/g) || [];
    const hashtags = hashtagMatches.map(tag => tag.replace(/^#+/, ""));
    const cleanContent = content.replace(/\n*#[\w\u0080-\uFFFF]+(\s+#[\w\u0080-\uFFFF]+)*\s*$/, "").trim();

    const saveStatus = scheduledAt ? "scheduled" : status;
    const res = await fetch(`/api/posts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: cleanContent,
        hashtags,
        type,
        status: saveStatus,
        mediaUrl: mediaUrl || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });

    if (res.ok) {
      toast.success("Post saved");
    } else {
      toast.error("Failed to save post");
    }

    setSaving(false);
    router.push("/content");
  }

  async function handleDelete() {
    confirm("Delete Post", "Are you sure you want to delete this post?", async () => {
      const res = await fetch(`/api/posts/${params.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Post deleted");
      } else {
        toast.error("Failed to delete post");
      }
      router.push("/content");
    }, "destructive");
  }

  async function handlePostNow() {
    confirm("Post Now", "Post to Instagram now?", async () => {
      setPosting(true);
      const res = await fetch("/api/instagram/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: params.id }),
      });

      const data = await res.json();
      setPosting(false);

      if (!res.ok) {
        toast.error(data.error || "Failed to post");
        return;
      }

      setStatus("posted");
      setPost((p) => (p ? { ...p, status: "posted", instagramId: data.instagramId } : p));
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-tertiary">Loading...</p>
      </div>
    );
  }

  const product = products.find((p) => p.id === post?.productId);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Edit Content</h1>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="rounded-md px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error-bg"
            >
              Delete
            </button>
            {status === "approved" && mediaUrl && (
              <button
                onClick={handlePostNow}
                disabled={posting}
                className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-info/90 disabled:opacity-50"
              >
                {posting ? "Posting..." : "Post Now"}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-6 space-y-6">
          {/* Product info */}
          {product && (
            <div className="text-sm text-text-tertiary">
              Product: <span className="font-medium text-text-secondary">{product.name}</span>
            </div>
          )}

          {/* Type & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary"
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  if (e.target.value !== "scheduled" && e.target.value !== "approved") {
                    setScheduledAt("");
                  }
                }}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule */}
          {(status === "approved" || status === "scheduled") && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Schedule For
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary"
              />
              {scheduledAt && (
                <p className="text-xs text-primary mt-1">
                  Will auto-post at this time
                </p>
              )}
            </div>
          )}

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary"
              placeholder="Post content..."
            />
          </div>

          {/* Media URL */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Media URL
            </label>
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary"
              placeholder="https://..."
            />
            {/* Media preview */}
            {mediaUrl && (
              <div className="mt-3 max-w-sm">
                {/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl) ? (
                  <video
                    src={mediaUrl}
                    controls
                    muted
                    loop
                    playsInline
                    className="w-full rounded-lg border border-border"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="w-full rounded-lg border border-border cursor-pointer"
                    onClick={() => setLightboxSrc(mediaUrl)}
                  />
                )}
              </div>
            )}
            {lightboxSrc && (
              <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
            )}
          </div>
        </div>
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}
