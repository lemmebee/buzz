"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          {variant === "destructive" && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-error-bg">
              <AlertTriangle className="h-5 w-5 text-error" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            <p className="mt-2 text-sm text-text-secondary">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
              variant === "destructive"
                ? "bg-error hover:bg-error/90"
                : "bg-primary hover:bg-primary-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const confirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    variant?: "default" | "destructive"
  ) => {
    setConfirmState({ isOpen: true, title, description, onConfirm, variant });
  };

  const close = () => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  };

  return { confirm, close, ...confirmState };
}
