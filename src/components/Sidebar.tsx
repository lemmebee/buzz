"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Sparkles,
  Inbox,
  Calendar,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onMobileClose: () => void;
}

const navItems = [
  { href: "/products", label: "Products", icon: Package, shortcut: "1" },
  { href: "/generate", label: "Generate", icon: Sparkles, shortcut: "2" },
  { href: "/content", label: "Content", icon: Inbox, shortcut: "3" },
  { href: "/schedules", label: "Schedules", icon: Calendar, shortcut: "4" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "5" },
];

export function Sidebar({ collapsed, mobileOpen, onToggleCollapse, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/products") {
      return pathname === "/products" || pathname.startsWith("/products/");
    }
    if (href === "/content") {
      return pathname === "/content" || pathname.startsWith("/content/");
    }
    return pathname === href;
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border bg-surface transition-all duration-200",
          // Mobile: slide in/out
          "lg:relative lg:z-30",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Width
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="Buzz" width={24} height={24} />
            {!collapsed && (
              <span className="text-base font-semibold text-text-primary">
                Buzz
              </span>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden text-text-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      collapsed ? "justify-center" : "",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-text-secondary hover:bg-border hover:text-text-primary"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          {/* Collapse toggle (desktop only) */}
          <button
            onClick={onToggleCollapse}
            className="mb-2 hidden w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary lg:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span>Collapse</span>}
          </button>

          {/* Logout */}
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary",
              collapsed ? "justify-center" : ""
            )}
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).then(() => {
                window.location.href = "/login";
              });
            }}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Logout"}
          </button>
        </div>
      </aside>
    </>
  );
}

