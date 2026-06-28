"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const [products, setProducts] = useState<{ id: number; name: string }[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data))
      .catch(() => {});
  }, []);

  // Load sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      setSidebarCollapsed(true);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setMobileOpen(false);
    },
    [router]
  );

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "1", action: () => navigate("/products"), description: "Products" },
    { key: "2", action: () => navigate("/generate"), description: "Generate" },
    { key: "3", action: () => navigate("/content"), description: "Content" },
    { key: "4", action: () => navigate("/schedules"), description: "Schedules" },
    { key: "5", action: () => navigate("/settings"), description: "Settings" },
    { key: "[", action: toggleSidebar, description: "Toggle sidebar" },
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleSidebar}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-text-secondary hover:text-text-primary"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={() => setMobileOpen(false)}
          >
            <img src="/icon.svg" alt="Buzz" width={20} height={20} />
            <span className="text-sm font-semibold text-text-primary">Buzz</span>
          </Link>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <CommandPalette products={products} />
    </div>
  );
}
