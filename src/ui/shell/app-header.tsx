"use client";

import { forwardRef } from "react";
import { useActiveBusiness } from "@/context/active-business-context";
import { AccountMenu } from "@/components/owner/AccountMenu";
import { BUSINESS_TYPE_LABELS } from "@/domain/owner-mode/owner-data-hub";

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
            className="ml-2 hidden items-baseline gap-1.5 sm:flex"
          >
            <span className="text-sm font-medium text-foreground">{activeBusiness?.name ?? "—"}</span>
            {activeBusiness?.businessType && (
              <span className="text-xs text-muted-foreground">
                {BUSINESS_TYPE_LABELS[activeBusiness.businessType as keyof typeof BUSINESS_TYPE_LABELS] ?? activeBusiness.businessType}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <AccountMenu userName={userName} />
      </div>
    </header>
  );
});
