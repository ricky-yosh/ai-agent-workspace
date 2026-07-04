import { useRef, useCallback } from "react";
import { useEventListener } from "./useEventListener";

export interface ShortcutSpec {
  key?: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface Shortcut extends ShortcutSpec {
  handler: () => void;
  ignoreInputs?: boolean;
}

export function matchesShortcut(e: KeyboardEvent, spec: ShortcutSpec): boolean {
  if ((spec.ctrl ?? false) !== e.ctrlKey) return false;
  if ((spec.meta ?? false) !== e.metaKey) return false;
  if ((spec.shift ?? false) !== e.shiftKey) return false;
  if ((spec.alt ?? false) !== e.altKey) return false;
  if (spec.key !== undefined && e.key !== spec.key) return false;
  if (spec.code !== undefined && e.code !== spec.code) return false;
  return true;
}

export function matchesAnyShortcut(e: KeyboardEvent, specs: ShortcutSpec[]): boolean {
  return specs.some(s => matchesShortcut(e, s));
}

export const TERMINAL_PASSTHROUGH_SHORTCUTS: ShortcutSpec[] = [
  { code: "BracketRight", meta: true, shift: true },
  { code: "BracketLeft", meta: true, shift: true },
  { key: "ArrowDown", meta: true, shift: true },
  { key: "ArrowUp", meta: true, shift: true },
  { key: "ArrowLeft", meta: true, shift: true },
  { key: "ArrowRight", meta: true, shift: true },
  { key: "Enter", meta: true, shift: true },
  { key: "n", meta: true },
  { key: "t", meta: true },
  { key: "w", meta: true },
  { key: "d", meta: true },
  { key: "d", meta: true, shift: true },
  { code: "Backslash", meta: true },
  { key: "Tab", ctrl: true },
  { key: "Tab", ctrl: true, shift: true },
  { key: "'", meta: true },
];

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handler = useCallback((e: KeyboardEvent) => {
    for (const s of shortcutsRef.current) {
      const target = e.target instanceof HTMLElement ? e.target : null;
      // Ignore inputs that are inside a real input/textarea/contenteditable,
      // but NOT when the input is part of an xterm terminal (its hidden
      // helper textarea should not suppress host shortcuts).
      const inInput = !!(
        target &&
        target.closest?.("input, textarea, [contenteditable]") &&
        !target.closest?.(".xterm")
      );
      if (s.ignoreInputs && inInput) continue;
      if (!matchesShortcut(e, s)) continue;
      e.preventDefault();
      s.handler();
      return;
    }
  }, []);

  useEventListener(document, "keydown", handler, []);
}
