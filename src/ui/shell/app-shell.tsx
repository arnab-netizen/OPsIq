"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "./app-header";
import { SidebarNav } from "./sidebar-nav";

interface AppShellProps {
  children: ReactNode;
  userName?: string | null;
  canViewOwnerRecovery?: boolean;
}

export function AppShell({ children, userName, canViewOwnerRecovery = false }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader userName={userName} onMenuClick={() => setDrawerOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 flex-shrink-0 border-r border-border bg-accent/50 md:block overflow-y-auto">
          <SidebarNav canViewOwnerRecovery={canViewOwnerRecovery} />
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <div
              className="absolute left-0 top-0 h-full w-64 bg-background shadow-xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <SidebarNav
                canViewOwnerRecovery={canViewOwnerRecovery}
                onLinkClick={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
