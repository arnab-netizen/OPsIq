"use client";

interface AppHeaderProps {
  userName?: string | null;
}

export function AppHeader({ userName }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-primary">OpsIQ</h1>
        <span className="text-xs text-muted-foreground">
          Governed Business Intervention OS
        </span>
      </div>
      <div className="flex items-center gap-4">
        {userName && (
          <span className="text-sm text-muted-foreground">{userName}</span>
        )}
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">
            {userName?.charAt(0)?.toUpperCase() ?? "U"}
          </span>
        </div>
      </div>
    </header>
  );
}
