"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [products, setProducts] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-60">{children}</main>
      <CommandPalette products={products} />
    </div>
  );
}
