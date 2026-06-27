"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  action: () => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Don't trigger shortcuts when typing in inputs (except for Cmd+K)
      if (isInput) {
        const isGlobalShortcut = shortcuts.some(
          (s) =>
            s.key.toLowerCase() === "k" &&
            (s.modifiers?.meta || s.modifiers?.ctrl)
        );
        if (!isGlobalShortcut) return;
      }

      for (const shortcut of shortcuts) {
        const { key, modifiers = {}, action } = shortcut;
        const keyMatch = e.key.toLowerCase() === key.toLowerCase();
        const ctrlMatch = modifiers.ctrl ? e.ctrlKey : !e.ctrlKey;
        const shiftMatch = modifiers.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = modifiers.alt ? e.altKey : !e.altKey;
        const metaMatch = modifiers.meta ? e.metaKey : !e.metaKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          e.preventDefault();
          action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
