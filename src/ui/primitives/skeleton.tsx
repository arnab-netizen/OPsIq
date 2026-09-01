/**
 * Layout-shaped loading skeletons.
 *
 * A small, reusable family instead of one bespoke placeholder per page. Each
 * variant reserves roughly the space its real content will occupy once loaded
 * (minimizing layout shift) and echoes that content's real hierarchy (a title
 * bar, N card sections, a table's header + rows, a form's label/input pairs) —
 * it never implies specific fake data (no fabricated numbers or names).
 *
 * Motion: a slow opacity pulse only. `prefers-reduced-motion` is respected via
 * the `motion-reduce:animate-none` utility, which leaves a static placeholder
 * (still communicates "loading" through shape/position, not motion).
 *
 * See docs/opsiq-governance for the audit that added this (P3 visual-system
 * closure): most owner workspace pages previously rendered a single bare
 * "Loading X workspace…" text string in place of the whole page while
 * fetching, which discards layout continuity and gives no sense of what's
 * about to appear.
 */

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Base pulsing placeholder block. Compose with width/height utility classes. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cx("animate-pulse motion-reduce:animate-none rounded-md bg-muted", className)}
    />
  );
}

/**
 * CARD_DASHBOARD — a title bar followed by N bordered card/section
 * placeholders. Matches the owner workspace pages (finance, onboarding,
 * cashflow, marketing, operations, strategy, sales, execution, ...) that
 * render a heading + a vertical stack of `bg-card` sections.
 */
export function CardDashboardSkeleton({
  sections = 3,
  label = "Loading",
}: {
  sections?: number;
  label?: string;
}) {
  return (
    <div className="mx-auto max-w-5xl py-8 px-4" role="status" aria-label={label}>
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: sections }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-3 h-3 w-32" />
            <Skeleton className="mb-2 h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * TABLE_LIST — a filter-bar placeholder followed by N row placeholders.
 * Matches paginated record lists (customers, risks, vendors, tasks, ...).
 */
export function TableListSkeleton({
  rows = 5,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="w-full">
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted p-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * FORM — stacked label/input placeholder pairs. Matches data-entry forms
 * (snapshot forms, business creation forms, manual-entry).
 */
export function FormSkeleton({
  fields = 4,
  label = "Loading",
}: {
  fields?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-4 rounded-lg border border-border bg-card p-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * DETAIL_PAGE — a title bar plus a couple of stacked info blocks. Matches
 * single-record detail routes (risks/[id], tasks/[taskId], compliance/[id]).
 */
export function DetailPageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label={label}>
      <Skeleton className="mb-6 h-7 w-64" />
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * METRIC_SUMMARY — a row of stat-tile placeholders. Matches metric/impact
 * dashboards (dashboard/impact and similar KPI-row pages).
 */
export function MetricSummarySkeleton({
  tiles = 4,
  label = "Loading",
}: {
  tiles?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
