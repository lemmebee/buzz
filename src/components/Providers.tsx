"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/Toaster";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <ThemeProvider>
      {isLoginPage ? children : <AppShell>{children}</AppShell>}
      <Toaster />
    </ThemeProvider>
  );
}
