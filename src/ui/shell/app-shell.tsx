"use client";

import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { SidebarNav } from "./sidebar-nav";

interface AppShellProps {
  children: ReactNode;
  userName?: string | null;
  canViewOwnerRecovery?: boolean;
}

export function AppShell({ children, userName, canViewOwnerRecovery = false }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader userName={userName} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 flex-shrink-0 border-r border-border bg-accent/50 md:block overflow-y-auto">
          <SidebarNav canViewOwnerRecovery={canViewOwnerRecovery} />
        </aside>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
