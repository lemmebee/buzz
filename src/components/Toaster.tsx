"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
        classNames: {
          toast: "text-sm",
          title: "font-medium",
          description: "text-text-secondary",
          success: "border-success-bg",
          error: "border-error-bg",
          info: "border-primary/20",
          warning: "border-warning-bg",
        },
      }}
      richColors
      closeButton
    />
  );
}
