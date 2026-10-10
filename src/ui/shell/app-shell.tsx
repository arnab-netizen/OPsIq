"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./app-header";
import { SidebarNav } from "./sidebar-nav";
import { useDialogA11y } from "@/ui/primitives/use-dialog-a11y";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { CapabilitiesProvider } from "@/context/capabilities-context";
import { BusinessRecoveryBanner } from "@/components/owner/BusinessRecoveryBanner";

interface AppShellProps {
  children: ReactNode;
  userName?: string | null;
  canViewOwnerRecovery?: boolean;
  /** The signed-in user's resolved capability set — see SidebarNav's `capabilities` prop. */
  capabilities?: readonly string[];
}

const MOBILE_NAV_DRAWER_ID = "mobile-nav-drawer";

export function AppShell({
  children,
  userName,
  canViewOwnerRecovery = false,
  capabilities = [],
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const closeDrawer = () => setDrawerOpen(false);

  // Any route change — a drawer nav link, browser back/forward, or navigation from
  // anywhere else — closes the drawer so it never survives as a stale overlay on the
  // page it navigated to. This is a legitimate sync-with-external-system effect (the
  // external system being the router's current location, not React state), matching the
  // repo's established pattern for this exact lint rule (see e.g.
  // src/app/(authenticated)/owner/process-intelligence/page.tsx).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing on navigation is the intentional route-change-close contract, not accidental derived-state sync
    setDrawerOpen(false);
  }, [pathname]);

  // Focus trap, Escape-to-close, background scroll lock, and focus restoration — see
  // src/ui/primitives/use-dialog-a11y.ts. The drawer fully overlays and blocks the
  // background (backdrop click and Escape both close it, background scroll is locked),
  // so it follows the same modal-dialog behavioral contract as a centered dialog even
  // though its layout is a slide-in side panel, not a centered box.
  useDialogA11y({
    isOpen: drawerOpen,
    onClose: closeDrawer,
    containerRef: drawerRef,
    restoreFocusRef: menuButtonRef,
  });

  return (
    <ActiveBusinessProvider>
      <div className="flex h-screen flex-col">
        <AppHeader
          ref={menuButtonRef}
          userName={userName}
          onMenuClick={() => setDrawerOpen(true)}
          menuOpen={drawerOpen}
          menuControlsId={MOBILE_NAV_DRAWER_ID}
          backgroundHidden={drawerOpen}
        />
        <BusinessRecoveryBanner />
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          <aside
            aria-hidden={drawerOpen || undefined}
            className="hidden w-60 flex-shrink-0 border-r border-border bg-accent/50 md:block overflow-y-auto"
          >
            <SidebarNav canViewOwnerRecovery={canViewOwnerRecovery} capabilities={capabilities} />
          </aside>

          {/* Mobile drawer. Modal dialog pattern: role="dialog" + aria-modal="true" +
              an accessible name via aria-label, since it fully overlays and blocks
              background interaction rather than behaving as ordinary in-flow nav content. */}
          {drawerOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeDrawer}>
              <div
                ref={drawerRef}
                id={MOBILE_NAV_DRAWER_ID}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                tabIndex={-1}
                className="absolute left-0 top-0 h-full w-64 bg-background shadow-xl overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <SidebarNav
                  canViewOwnerRecovery={canViewOwnerRecovery}
                  capabilities={capabilities}
                  onLinkClick={closeDrawer}
                />
              </div>
            </div>
          )}

          <main aria-hidden={drawerOpen || undefined} className="flex-1 scroll-pt-28 overflow-y-auto p-6">
            <CapabilitiesProvider capabilities={capabilities}>{children}</CapabilitiesProvider>
          </main>
        </div>
      </div>
    </ActiveBusinessProvider>
  );
}
