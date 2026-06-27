"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Sparkles,
  Inbox,
  Calendar,
  ArrowRight,
  CheckCircle2,
  Clock,
  Plus,
} from "lucide-react";
import { Skeleton, SkeletonStat } from "@/components/Skeleton";

interface DashboardData {
  products: { id: number; name: string; createdAt: string }[];
  content: {
    id: number;
    status: string;
    content: string;
    createdAt: string;
    scheduledAt?: string;
    productId: number;
  }[];
  schedules: { id: number; enabled: boolean; lastRunAt?: string }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/posts").then((r) => r.json()),
      fetch("/api/schedules").then((r) => r.json()),
    ]).then(([products, content, schedules]) => {
      setData({ products, content, schedules });
      setLoading(false);
    });
  }, []);

  const stats = data
    ? {
        products: data.products.length,
        drafts: data.content.filter((c) => c.status === "draft").length,
        scheduled: data.content.filter((c) => {
          if (c.status !== "scheduled" || !c.scheduledAt) return false;
          const scheduledDate = new Date(c.scheduledAt);
          const now = new Date();
          const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          return scheduledDate >= now && scheduledDate <= weekFromNow;
        }).length,
        posted: data.content.filter((c) => c.status === "posted").length,
      }
    : null;

  const recentActivity = data
    ? data.content
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5)
    : [];

  const hasProducts = data ? data.products.length > 0 : false;
  const showOnboarding = !hasProducts;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Overview of your content pipeline
        </p>
      </div>

      {showOnboarding && (
        <div className="mb-8 rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold text-text-primary">
            Welcome to Buzz
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Get started in 3 steps to begin generating AI-powered content
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-text-primary">
                  Add your first product
                </h3>
                <p className="mt-0.5 text-sm text-text-secondary">
                  Create a product with a marketing brief and screenshots
                </p>
                <Link
                  href="/products/new"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
                >
                  Add product <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-border text-sm font-medium text-text-tertiary">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-text-secondary">
                  Connect your Instagram account
                </h3>
                <p className="mt-0.5 text-sm text-text-tertiary">
                  Link your Instagram business account to publish content
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-border text-sm font-medium text-text-tertiary">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-text-secondary">
                  Generate your first post
                </h3>
                <p className="mt-0.5 text-sm text-text-tertiary">
                  Use AI to create engaging content for your product
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </>
        ) : (
          <>
            <Link
              href="/products"
              className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Package className="h-4 w-4" />
                Products
              </div>
              <div className="mt-2 text-2xl font-semibold text-text-primary">
                {stats?.products}
              </div>
            </Link>
            <Link
              href="/content?status=draft"
              className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Inbox className="h-4 w-4" />
                Drafts Pending
              </div>
              <div className="mt-2 text-2xl font-semibold text-text-primary">
                {stats?.drafts}
              </div>
            </Link>
            <Link
              href="/content?status=scheduled"
              className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Calendar className="h-4 w-4" />
                Scheduled This Week
              </div>
              <div className="mt-2 text-2xl font-semibold text-text-primary">
                {stats?.scheduled}
              </div>
            </Link>
            <Link
              href="/content?status=posted"
              className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <CheckCircle2 className="h-4 w-4" />
                Posted Total
              </div>
              <div className="mt-2 text-2xl font-semibold text-text-primary">
                {stats?.posted}
              </div>
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium text-text-primary">Recent Activity</h2>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-tertiary">
                    No recent activity
                  </p>
                  <Link
                    href="/generate"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    Generate your first post <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((item) => {
                    const product = data?.products.find(
                      (p) => p.id === item.productId
                    );
                    const statusIcon =
                      item.status === "posted" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : item.status === "scheduled" ? (
                        <Calendar className="h-4 w-4 text-primary" />
                      ) : (
                        <Clock className="h-4 w-4 text-text-tertiary" />
                      );
                    const statusText =
                      item.status === "posted"
                        ? "Posted"
                        : item.status === "scheduled"
                          ? "Scheduled"
                          : "Draft";
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-border"
                      >
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm text-text-primary">
                            {item.content.slice(0, 60)}
                            {item.content.length > 60 ? "..." : ""}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {product?.name} · {statusText}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-xs text-text-tertiary">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium text-text-primary">Quick Actions</h2>
            </div>
            <div className="p-2">
              <Link
                href="/generate"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Generate Content
              </Link>
              <Link
                href="/products/new"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary"
              >
                <Plus className="h-4 w-4" />
                Add Product
              </Link>
              <Link
                href="/schedules"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary"
              >
                <Calendar className="h-4 w-4" />
                View Schedules
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary"
              >
                <Package className="h-4 w-4" />
                Instagram Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
