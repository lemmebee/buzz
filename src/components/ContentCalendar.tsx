"use client";

import { useState } from "react";
import { ContentItem, Product } from "../../drizzle/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ContentCalendarProps {
  posts: ContentItem[];
  products: Record<number, Product>;
  onPostClick: (post: ContentItem) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function ContentCalendar({ posts, products, onPostClick }: ContentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Group posts by date
  const postsByDate = posts.reduce((acc, post) => {
    const date = post.scheduledAt
      ? formatDate(new Date(post.scheduledAt))
      : post.createdAt
        ? formatDate(new Date(post.createdAt))
        : null;
    
    if (date) {
      if (!acc[date]) acc[date] = [];
      acc[date].push(post);
    }
    return acc;
  }, {} as Record<string, ContentItem[]>);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "draft": return "bg-border text-text-secondary";
      case "approved": return "bg-success-bg text-success";
      case "scheduled": return "bg-primary/15 text-primary";
      case "posted": return "bg-info-bg text-info";
      default: return "bg-border text-text-secondary";
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text-primary">
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={previousMonth}
            className="p-2 rounded-md border border-border bg-surface text-text-secondary hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-md border border-border bg-surface text-text-secondary hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day Headers */}
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-text-tertiary py-2">
            {day}
          </div>
        ))}

        {/* Empty Cells for Days Before First Day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayPosts = postsByDate[dateStr] || [];
          const isToday = formatDate(new Date()) === dateStr;

          return (
            <div
              key={day}
              className={`aspect-square rounded-lg border p-2 ${
                isToday ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-text-secondary"}`}>
                {day}
              </div>
              <div className="space-y-1 overflow-hidden">
                {dayPosts.slice(0, 3).map((post) => (
                  <button
                    key={post.id}
                    onClick={() => onPostClick(post)}
                    className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate ${getStatusColor(post.status)}`}
                    title={`${post.content?.slice(0, 50) || "Untitled"} - ${post.productId ? products[post.productId]?.name || "Unknown" : "Unknown"}`}
                  >
                    {post.content?.slice(0, 20) || "Untitled"}
                  </button>
                ))}
                {dayPosts.length > 3 && (
                  <div className="text-xs text-text-tertiary text-center">
                    +{dayPosts.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
