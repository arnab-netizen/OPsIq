"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * True if `el` is actually reachable by a real user right now — i.e. it is not sitting
 * inside a closed native `<details>` (browsers hide non-`<summary>` content of a closed
 * `<details>` from layout and from the tab order, without any `display:none` in markup,
 * so a plain CSS/attribute check can't see it). `SidebarNav` groups collapsible sections
 * with `<details>`, so this keeps the trap's first/last boundary honest.
 */
function isReachable(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.tagName === "DETAILS" && !(node as HTMLDetailsElement).open) {
      return el.tagName === "SUMMARY" && el.parentElement === node;
    }
    node = node.parentElement;
  }
  return true;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isReachable,
  );
}

interface UseDialogA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  /** The dialog/drawer's own root element — must be attached whenever isOpen is true. */
  containerRef: RefObject<HTMLElement | null>;
  /** Element to return focus to on close. Falls back to whatever had focus when opened. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Behavioral contract for a modal-style overlay — a centered dialog or a slide-in panel
 * that fully overlays and blocks the background either way: Escape-to-close, a focus
 * trap confined to the container, background scroll lock, and focus restoration to the
 * trigger on close.
 *
 * Escape-to-close and the scroll lock mirror the pattern already used by `Modal`
 * (./modal.tsx: a keydown listener attached only while open, `document.body.style.overflow`
 * toggled and restored in the effect cleanup). `Modal` does not implement a focus trap or
 * focus restoration at all, though, so there was no existing hook to import for those —
 * they're new here. Extracted into a shared hook (rather than left inline in one consumer)
 * so the next modal-style surface, including a future pass over `Modal` itself, can reuse
 * it instead of re-deriving the same trap/lock/escape/restore logic.
 */
export function useDialogA11y({
  isOpen,
  onClose,
  containerRef,
  restoreFocusRef,
}: UseDialogA11yOptions) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Escape-to-close + Tab trap. One listener, attached only while open and always torn
  // down on close/unmount — repeated open/close cycles cannot accumulate listeners.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [isOpen, onClose, containerRef]);

  // Background scroll lock. The cleanup runs both when `isOpen` flips to false and when
  // the component unmounts while still open, so the lock can't leak either way.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Initial focus on open, restored on close (same both-paths cleanup guarantee as above).
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current =
      (restoreFocusRef?.current as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);

    const container = containerRef.current;
    if (container) {
      const [firstFocusable] = getFocusable(container);
      (firstFocusable ?? container).focus();
    }

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, containerRef, restoreFocusRef]);
}
