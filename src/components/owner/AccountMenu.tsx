"use client";

/**
 * Replaces the header's previous non-interactive avatar + always-visible "Log out" button.
 * A real usability test found the avatar did nothing when clicked and logout sat exposed in the
 * main header — a lay owner could end their session with one accidental click. This groups
 * account-level actions behind one deliberate click, and every destination here is a real,
 * already-existing page (Account = /settings, Help = /owner/help, feedback = /owner/feedback) —
 * nothing here is a stub.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useOperatorMutation } from "@/hooks/useOperatorMutation";

interface AccountMenuProps {
  userName?: string | null;
}

export function AccountMenu({ userName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const logoutMutation = useOperatorMutation<{ success: boolean }, Record<string, never>>({
    url: "/api/auth/logout",
    method: "POST",
    operationName: "logout",
    onSettled: () => {
      window.location.href = "/login";
    },
  });

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const trigger = triggerRef.current;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      // Without this, closing (Escape, outside click, or picking an item) unmounts the focused
      // menu item and the browser drops focus to <body> instead of giving it back to the control
      // that opened the menu -- found during a manual keyboard-accessibility pass, same class of
      // gap as the shared Modal primitive had.
      trigger?.focus();
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-testid="account-menu-trigger"
        className="flex items-center gap-2 rounded-full transition-colors hover:bg-muted p-0.5 pr-1"
      >
        <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">
            {userName?.charAt(0)?.toUpperCase() ?? "U"}
          </span>
        </span>
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          data-testid="account-menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          {userName && (
            <p className="truncate px-3 py-2 text-sm font-medium text-foreground border-b border-border mb-1">
              {userName}
            </p>
          )}
          <Link
            ref={firstItemRef}
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            Account
          </Link>
          <Link
            href="/owner/help"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            Help
          </Link>
          <Link
            href="/owner/feedback"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            Send feedback
          </Link>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => logoutMutation.mutate({})}
            disabled={logoutMutation.isLoading}
            data-testid="account-menu-logout"
            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {logoutMutation.isLoading ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
