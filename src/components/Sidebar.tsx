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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/content", label: "Content", icon: Inbox },
  { href: "/schedules", label: "Schedules", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
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
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <img src="/icon.svg" alt="Buzz" width={24} height={24} />
        <span className="text-base font-semibold text-text-primary">Buzz</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-border hover:text-text-primary"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <button
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border hover:text-text-primary"
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" }).then(() => {
              window.location.href = "/login";
            });
          }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
