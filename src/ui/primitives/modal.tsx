"use client";

import { useRef, type ReactNode } from "react";
import { useDialogA11y } from "./use-dialog-a11y";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape-to-close, Tab focus trap, background scroll lock, initial focus on
  // open, and focus restoration on close -- delegated to the shared
  // `useDialogA11y` hook (./use-dialog-a11y.ts) instead of a second,
  // separately-derived copy of the same logic.
  //
  // This delegation is itself the fix for a real production bug: Modal used
  // to run its own "focus the first focusable element" effect with `onClose`
  // in that effect's dependency array. Any parent re-render that passed a
  // fresh `onClose` closure -- e.g. a controlled `<input>` inside the modal
  // re-rendering the parent on every keystroke, which is normal React, not a
  // caller mistake -- re-ran that effect and threw focus to the dialog's
  // first focusable element (the Close button) on every keystroke, wiping
  // out whatever the visitor had just typed. `useDialogA11y`'s initial-focus
  // effect depends only on `isOpen` (plus the stable `containerRef`), so it
  // fires exactly once per open/close cycle no matter how many times the
  // parent re-renders while the modal stays open.
  useDialogA11y({ isOpen, onClose, containerRef: dialogRef });

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="mx-4 w-full max-w-lg rounded-lg border border-border bg-background shadow-xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
