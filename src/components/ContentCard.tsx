"use client";

import Link from "next/link";
import { Post } from "../../drizzle/schema";

interface ContentCardProps {
  post: Post;
  productName?: string;
  onDelete?: (id: number) => void;
  onStatusChange?: (id: number, status: string) => void;
  onPostNow?: (id: number) => void;
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
};

export function ContentCard({
  post,
  productName,
  onDelete,
  onStatusChange,
  onPostNow,
}: ContentCardProps) {
  const hashtags = post.hashtags ? JSON.parse(post.hashtags) : [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            {typeLabels[post.type] || post.type}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[post.status]}`}>
            {post.status}
          </span>
        </div>
        {productName && (
          <span className="text-xs text-gray-500">{productName}</span>
        )}
      </div>

      <Link href={`/content/${post.id}`}>
        <p className="text-sm text-gray-900 mb-3 line-clamp-3 hover:text-blue-600">
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

        {post.status === "approved" && post.mediaUrl && onPostNow && (
          <button
            onClick={() => onPostNow(post.id)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            Post Now
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
    </div>
  );
}
