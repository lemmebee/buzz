"use client";

import { useState } from "react";
import Link from "next/link";
import { Post } from "../../drizzle/schema";
import { ImageLightbox } from "./ImageLightbox";

interface ContentCardProps {
  post: Post;
  productName?: string;
  onDelete?: (id: number) => void;
  onStatusChange?: (id: number, status: string) => void;
  onPostNow?: (id: number) => void;
  onSchedule?: (id: number, scheduledAt: string) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-purple-100 text-purple-700",
};

const typeLabels: Record<string, string> = {
  reel: "Reel",
  post: "Post",
  story: "Story",
  carousel: "Carousel",
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors">
      {/* Image preview */}
      {post.mediaUrl && (
        <div
          className="aspect-square bg-gray-100 cursor-pointer"
          onClick={() => setLightboxSrc(post.mediaUrl!)}
        >
          <img
            src={post.mediaUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
              {typeLabels[post.type] || post.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${statusColors[post.status]}`}>
              {post.status}
            </span>
          </div>
          {post.status === "scheduled" && post.scheduledAt && (
            <span className="text-xs text-blue-600">
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
            <span className="text-xs text-gray-500">{productName}</span>
          )}
        </div>

        <Link href={`/content/${post.id}`}>
          <p className="text-sm text-gray-900 mb-3 hover:text-blue-600">
            {post.content}
          </p>
        </Link>

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {hashtags.slice(0, 5).map((tag: string, i: number) => (
            <span key={i} className="text-xs text-blue-600">
              #{tag}
            </span>
          ))}
          {hashtags.length > 5 && (
            <span className="text-xs text-gray-400">+{hashtags.length - 5}</span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
        <Link
          href={`/content/${post.id}`}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Edit
        </Link>

        {post.status === "draft" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "approved")}
            className="text-xs text-green-600 hover:text-green-800"
          >
            Approve
          </button>
        )}

        {post.status === "approved" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "draft")}
            className="text-xs text-gray-600 hover:text-gray-800"
          >
            Unapprove
          </button>
        )}

        {post.status === "approved" && onSchedule && (
          <button
            onClick={() => setShowSchedulePicker(!showSchedulePicker)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Schedule
          </button>
        )}

        {post.status === "approved" && post.mediaUrl && onPostNow && (
          <button
            onClick={() => onPostNow(post.id)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            Post Now
          </button>
        )}

        {post.status === "scheduled" && onStatusChange && (
          <button
            onClick={() => onStatusChange(post.id, "approved")}
            className="text-xs text-gray-600 hover:text-gray-800"
          >
            Unschedule
          </button>
        )}

        {onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        )}
        </div>

        {showSchedulePicker && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900"
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
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
