import type { ReactNode } from "react";

/**
 * Standard page-level header: title + one-line description + optional
 * actions. Replaces the ad hoc `<h1 style={{...}}>` + inline-styled
 * description + button row pattern duplicated across owner pages (e.g. the
 * former owner/cockpit page.tsx) with one consistent, token-driven layout.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground max-w-prose">{description}</p>
        )}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}
