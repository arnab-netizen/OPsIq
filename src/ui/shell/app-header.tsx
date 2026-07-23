"use client";

import { useOperatorMutation } from "@/hooks/useOperatorMutation";

interface AppHeaderProps {
  userName?: string | null;
  onMenuClick?: () => void;
}

export function AppHeader({ userName, onMenuClick }: AppHeaderProps) {
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
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-primary">Rebilix</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Governed Business Intervention OS
        </span>
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
}
