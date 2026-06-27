"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Sparkles,
  Inbox,
  Calendar,
  Settings,
  Home,
  Search,
  Plus,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  products?: { id: number; name: string }[];
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  group: string;
  shortcut?: string;
}

export function CommandPalette({ products = [] }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setIsOpen(false);
      setQuery("");
    },
    [router]
  );

  const commands: CommandItem[] = [
    {
      id: "home",
      label: "Go to Dashboard",
      icon: Home,
      action: () => navigate("/"),
      group: "Navigation",
      shortcut: "1",
    },
    {
      id: "products",
      label: "Go to Products",
      icon: Package,
      action: () => navigate("/products"),
      group: "Navigation",
      shortcut: "2",
    },
    {
      id: "generate",
      label: "Go to Generate",
      icon: Sparkles,
      action: () => navigate("/generate"),
      group: "Navigation",
      shortcut: "3",
    },
    {
      id: "content",
      label: "Go to Content",
      icon: Inbox,
      action: () => navigate("/content"),
      group: "Navigation",
      shortcut: "4",
    },
    {
      id: "schedules",
      label: "Go to Schedules",
      icon: Calendar,
      action: () => navigate("/schedules"),
      group: "Navigation",
      shortcut: "5",
    },
    {
      id: "settings",
      label: "Go to Settings",
      icon: Settings,
      action: () => navigate("/settings"),
      group: "Navigation",
      shortcut: "6",
    },
    {
      id: "new-product",
      label: "Create New Product",
      icon: Plus,
      action: () => navigate("/products/new"),
      group: "Actions",
    },
    {
      id: "generate-content",
      label: "Generate Content",
      icon: Sparkles,
      action: () => navigate("/generate"),
      group: "Actions",
    },
    ...products.map((p) => ({
      id: `product-${p.id}`,
      label: p.name,
      icon: Package,
      action: () => navigate(`/products/${p.id}`),
      group: "Products",
    })),
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.group]) acc[cmd.group] = [];
      acc[cmd.group].push(cmd);
      return acc;
    },
    {} as Record<string, CommandItem[]>
  );

  const flatCommands = Object.values(groupedCommands).flat();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + flatCommands.length) % flatCommands.length
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatCommands[selectedIndex]) {
        flatCommands[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  let currentIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setIsOpen(false)}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {flatCommands.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-tertiary">
              No results found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([group, items]) => (
              <div key={group} className="mb-2">
                <div className="px-2 py-1 text-xs font-medium text-text-tertiary">
                  {group}
                </div>
                {items.map((cmd) => {
                  const index = currentIndex++;
                  const Icon = cmd.icon;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : "text-text-secondary hover:bg-border hover:text-text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-text-tertiary">
                          {cmd.shortcut}
                        </kbd>
                      )}
                      <ArrowRight className="h-3 w-3 text-text-tertiary" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2">
          <div className="flex items-center gap-4 text-xs text-text-tertiary">
            <span>
              <kbd className="rounded border border-border bg-background px-1 py-0.5">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1 py-0.5">
                ↵
              </kbd>{" "}
              Select
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1 py-0.5">
                esc
              </kbd>{" "}
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
