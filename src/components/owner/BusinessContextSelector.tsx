"use client";

/**
 * BusinessContextSelector — the canonical "which business am I looking at" control for
 * business-scoped Owner Mode pages. Prop-driven; NO data fetching and NO business logic here —
 * the caller already loads its own business list + selected id from its existing dashboard
 * loader (e.g. `getFinanceDashboard`, `getOwnerHome`) and passes them straight through. This
 * component only decides how to *render* that state, replacing the ~21 duplicate inline
 * selectors (a canonical `Select` copy in 14 pages, a raw unlabeled `<select>` copy in 6 pages,
 * one labelled raw `<select>` in 1 page) that had accumulated across the owner surface.
 *
 * Do NOT confuse this with the business-TYPE / archetype selector (PR #379, `BUSINESS_TYPE_OPTIONS`
 * inline in 9 pages) — that edits what kind of business a record is; this picks which business
 * record to view. They are unrelated controls and this component does not replace or wrap that one.
 *
 * Zero/one/many contract:
 *  - zero businesses: renders nothing. The page owns the empty-state message (it already does,
 *    consistently, across every migrated page — "No businesses yet. Create one in Finance…").
 *  - exactly one business: renders a plain, non-interactive context readout (no dropdown chrome) —
 *    matches the "shows context without unnecessary chrome" requirement.
 *  - two or more businesses: renders the interactive control (native `<select>` under the hood —
 *    a native select already provides full keyboard, screen-reader and touch support with no
 *    reinvention needed) with a real associated `<label>`, `aria-live` current-value announcement,
 *    and a 44px min touch target.
 *
 * Output event: onChange(businessId) — the caller is responsible for re-fetching its own
 * business-scoped data for the new id (every existing loader already does this) and, per the
 * governed-record safety rule, for gating its render on its own `loading` flag while the new
 * fetch is in flight so the previous business's data cannot remain visible mid-switch.
 */

interface BusinessContextOption {
  id: string;
  name: string;
  currency?: string;
}

export interface BusinessContextSelectorProps {
  /** The caller's own business list (already fetched by its existing loader). */
  businesses: BusinessContextOption[];
  /** The currently selected business id, or null if none selected yet. */
  selectedId: string | null;
  /** Fired with the newly chosen business id. The caller re-loads its own data for it. */
  onChange: (businessId: string) => void;
  /** True while the caller's own list/selection is not yet known — renders a disabled placeholder. */
  loading?: boolean;
  /** Optional layout override; defaults to a reasonable inline width used across owner pages. */
  className?: string;
}

function formatLabel(b: BusinessContextOption): string {
  return b.currency ? `${b.name} (${b.currency})` : b.name;
}

export function BusinessContextSelector({
  businesses,
  selectedId,
  onChange,
  loading = false,
  className = "",
}: BusinessContextSelectorProps) {
  if (loading) {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <span className="text-sm font-medium text-foreground">Business</span>
        <select
          disabled
          aria-label="Business (loading)"
          className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:w-72"
        >
          <option>Loading businesses…</option>
        </select>
      </div>
    );
  }

  if (businesses.length === 0) {
    // The page owns the empty/zero-business state (governed business-setup path);
    // rendering a selector here would offer a choice that does not exist.
    return null;
  }

  if (businesses.length === 1) {
    const only = businesses[0];
    return (
      <div className={`flex flex-col gap-0.5 ${className}`} data-testid="business-context-single">
        <span className="text-xs uppercase text-muted-foreground">Business</span>
        <span className="text-sm font-medium text-foreground">{formatLabel(only)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor="business-context-selector" className="text-sm font-medium text-foreground">
        Business
      </label>
      <select
        id="business-context-selector"
        name="businessSelector"
        data-testid="business-context-selector"
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-live="polite"
        className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 sm:w-72"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {formatLabel(b)}
          </option>
        ))}
      </select>
    </div>
  );
}
