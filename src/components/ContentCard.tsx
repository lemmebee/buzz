"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ContentItem as Post } from "../../drizzle/schema";
import { ImageLightbox } from "./ImageLightbox";
import { InstagramPreview } from "./InstagramPreview";
import { Eye } from "lucide-react";

interface ContentCardProps {
  post: Post;
  productName?: string;
  onDelete?: (id: number) => void;
  onStatusChange?: (id: number, status: string) => void;
  onPostNow?: (id: number) => void;
  onSchedule?: (id: number, scheduledAt: string) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-border text-text-secondary",
  approved: "bg-success-bg text-success",
  scheduled: "bg-primary/15 text-primary",
  posted: "bg-info-bg text-info",
};

const typeLabels: Record<string, string> = {
  reel: "Reel",
  post: "Post",
  story: "Story",
  ad: "Ad",
};

export function ContentCard({
  post,
  productName,
  onDelete,
  onStatusChange,
  onPostNow,
  onSchedule,
}: ContentCardProps) {
  const hashtags = post.hashtags ? JSON.parse(post.hashtags) : [];
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  // Older rows were saved with mediaType "image" regardless of what was
  // produced, so the file extension is the more reliable signal.
  const isVideo =
    post.mediaType === "video" ||
    /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(post.mediaUrl ?? "");

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showInstagramPreview, setShowInstagramPreview] = useState(false);

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden hover:border-border-strong transition-colors">
      {/* Media preview */}
      {post.mediaUrl && (
        isVideo ? (
          <div
            className="aspect-square bg-border cursor-pointer relative group"
            onClick={() => setLightboxSrc(post.mediaUrl!)}
          >
            <video
              // #t=0.1 makes the browser seek and paint that frame as a poster.
              // preload="metadata" alone fetches duration and dimensions but
              // decodes nothing, which is why these rendered as empty boxes.
              src={`${post.mediaUrl}#t=0.1`}
              controls
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="relative aspect-square bg-border cursor-pointer"
            onClick={() => setLightboxSrc(post.mediaUrl!)}
          >
            <Image
              src={post.mediaUrl}
              alt=""
              fill
              unoptimized
              className="w-full h-full object-cover"
            />
          </div>
        )
      )}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-border text-text-secondary rounded">
              {typeLabels[post.targetSurface] || post.targetSurface}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${statusColors[post.status]}`}>
              {post.status}
            </span>
          </div>
          {post.status === "scheduled" && post.scheduledAt && (
            <span className="text-xs text-primary">
              {new Date(post.scheduledAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          {productName && (
            <span className="text-xs text-text-tertiary">{productName}</span>
          )}
        </div>

        <Link href={`/content/${post.id}`}>
          <p className="text-sm text-text-primary mb-3 hover:text-primary">
            {post.content}
          </p>
        </Link>

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {hashtags.slice(0, 5).map((tag: string, i: number) => (
            <span key={i} className="text-xs text-primary">
              #{tag.replace(/^#+/, "")}
            </span>
          ))}
          {hashtags.length > 5 && (
            <span className="text-xs text-text-muted">+{hashtags.length - 5}</span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border flex-wrap">
        <Link
          href={`/content/${post.id}`}
          className="text-xs text-primary hover:text-primary-hover"
        >
          Edit
        </Link>

        <button
          onClick={() => setShowInstagramPreview(true)}
          className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>

        {post.status === "draft" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "approved")}
            className="text-xs text-success hover:text-success"
          >
            Approve
          </button>
        )}

        {post.status === "approved" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "draft")}
            className="text-xs text-text-secondary hover:text-gray-800"
          >
            Unapprove
          </button>
        )}

        {post.status === "approved" && onSchedule && (
          <button
            onClick={() => setShowSchedulePicker(!showSchedulePicker)}
            className="text-xs text-primary hover:text-primary-hover font-medium"
          >
            Schedule
          </button>
        )}

        {post.status === "approved" && post.mediaUrl && onPostNow && (
          <button
            onClick={() => onPostNow(post.id)}
            className="text-xs text-info hover:text-info font-medium"
          >
            Post Now
          </button>
        )}

        {post.status === "scheduled" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "approved")}
            className="text-xs text-text-secondary hover:text-gray-800"
          >
            Unschedule
          </button>
        )}

        {onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-error hover:text-error"
          >
            Delete
          </button>
        )}
        </div>

        {showSchedulePicker && (
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="flex-1 px-2 py-1 border border-border-strong rounded text-xs text-text-primary"
            />
            <button
              onClick={() => {
                if (scheduleDate && onSchedule) {
                  onSchedule(post.id, scheduleDate);
                  setShowSchedulePicker(false);
                  setScheduleDate("");
                }
              }}
              disabled={!scheduleDate}
              className="px-2 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        )}
      </div>

      {showInstagramPreview && (
        <InstagramPreview
          content={post.content}
          hashtags={hashtags}
          mediaUrl={post.mediaUrl}
          productName={productName}
          onClose={() => setShowInstagramPreview(false)}
        />
      )}
    </div>
  );
}
