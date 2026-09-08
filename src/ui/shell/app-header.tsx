"use client";

import { forwardRef } from "react";
import { useOperatorMutation } from "@/hooks/useOperatorMutation";
import { useActiveBusiness } from "@/context/active-business-context";

interface AppHeaderProps {
  userName?: string | null;
  onMenuClick?: () => void;
  /** Whether the mobile nav drawer this button opens is currently open. */
  menuOpen?: boolean;
  /** id of the drawer element this button opens, wired via aria-controls. */
  menuControlsId?: string;
  /**
   * True while the mobile drawer is open and modal. The header — including this
   * trigger button — sits outside the dialog, so while it is open the header is hidden
   * from assistive tech for the duration, matching aria-modal semantics (everything
   * outside the modal is inert). Desktop layouts never set this.
   */
  backgroundHidden?: boolean;
}

export const AppHeader = forwardRef<HTMLButtonElement, AppHeaderProps>(function AppHeader(
  { userName, onMenuClick, menuOpen = false, menuControlsId, backgroundHidden = false },
  menuButtonRef,
) {
  // Always-visible active-business readout — a real human usability test found the owner had
  // no way to tell which business the rest of the app was currently showing them. Read-only here
  // (switching happens via the BusinessContextSelector on the pages that have one); this just
  // keeps the current context visible everywhere, including pages with no selector of their own
  // (Home, Priorities, Actions).
  const { activeBusiness, businesses, loading: businessLoading } = useActiveBusiness();

  // End the session via the governed mutation hook; always return the user to
  // /login afterwards (success or failure), never surfacing a raw error.
  const logoutMutation = useOperatorMutation<{ success: boolean }, Record<string, never>>({
    url: "/api/auth/logout",
    method: "POST",
    operationName: "logout",
    onSettled: () => {
      window.location.href = "/login";
    },
  });

  return (
    <header
      aria-hidden={backgroundHidden || undefined}
      className="flex h-14 items-center justify-between border-b border-border bg-background px-6"
    >
      <div className="flex items-center gap-3">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuControlsId}
          className="mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        {/* Brand mark, not the page heading -- each page supplies its own real <h1>. The
            surrounding <header> already carries the "banner" landmark, so assistive tech
            doesn't need a heading here to identify the site name. */}
        <p className="text-lg font-semibold text-[var(--primary-text)]">OpsIQ</p>
        {!businessLoading && businesses.length > 0 && (
          <span
            data-testid="active-business-indicator"
            className="ml-2 hidden items-center gap-1.5 rounded-full border border-border bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground sm:flex"
          >
            <span className="text-muted-foreground">Business:</span>
            {activeBusiness?.name ?? "—"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        {userName && (
          <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
        )}
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">
            {userName?.charAt(0)?.toUpperCase() ?? "U"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate({})}
          disabled={logoutMutation.isLoading}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Log out
        </button>
      </div>
    </header>
  );
});
