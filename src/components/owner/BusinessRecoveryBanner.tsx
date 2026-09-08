"use client";

/**
 * Shown app-wide (via AppShell) when ActiveBusinessContext.needsBusinessRecovery is true — a
 * previously-selected business is no longer valid (archived, deleted, foreign, or a fixture the
 * ordinary owner list no longer includes) and more than one legitimate business remains. This is
 * the explicit fail-safe surface the trust invariant requires: no page may silently substitute a
 * different business for the one the owner was actually looking at. See
 * src/context/active-business-context.tsx for the resolution rule this renders for.
 */
import { useActiveBusiness } from "@/context/active-business-context";

export function BusinessRecoveryBanner() {
  const { needsBusinessRecovery, businesses, setActiveBusinessId } = useActiveBusiness();

  if (!needsBusinessRecovery) return null;

  return (
    <div
      role="alert"
      data-testid="business-recovery-banner"
      className="border-b border-warning/30 bg-warning/10 px-6 py-4"
    >
      <p className="text-sm font-medium text-foreground">
        The business you were viewing is no longer available.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a business to continue. Nothing has changed about your other businesses.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {businesses.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setActiveBusinessId(b.id)}
            className="min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}
