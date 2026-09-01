import type { ReactNode } from "react";
import Link from "next/link";

export interface EmptyStateActionSpec {
  label: string;
  onClick?: () => void;
  href?: string;
}

function EmptyStateActionButton({
  action,
  variant,
}: {
  action: EmptyStateActionSpec;
  variant: "primary" | "outline";
}) {
  const classes =
    variant === "primary"
      ? "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      : "inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted";
  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {action.label}
    </button>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <svg
        className="h-8 w-8 animate-spin text-primary"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

const DEFAULT_EMPTY_ICON = (
  <svg
    className="h-12 w-12 text-muted-foreground/50"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth="1"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    />
  </svg>
);

/**
 * Shared empty-state primitive.
 *
 * Deliberately does not hardcode copy for "true empty" vs "filtered empty" vs
 * "permission denied" vs "error" — each call site owns its own title/description
 * so a zero-data first-run message is never confused with a filtered-out-of-results
 * message. See docs/opsiq-governance for the audit that consolidated this (P2
 * visual-system closure): several owner pages previously rendered a single bare
 * "No X found." string regardless of whether data never existed or a filter just
 * hid it, which pointed the same (missing) call-to-action at both situations.
 */
export function EmptyState({
  title = "Nothing here yet",
  description,
  icon,
  primaryAction,
  secondaryAction,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  primaryAction?: EmptyStateActionSpec;
  secondaryAction?: EmptyStateActionSpec;
  /** Legacy freeform action slot — prefer primaryAction/secondaryAction for new call sites. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 px-6 text-center">
      {icon ?? DEFAULT_EMPTY_ICON}
      <h3 className="mt-4 text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && <EmptyStateActionButton action={primaryAction} variant="primary" />}
          {secondaryAction && <EmptyStateActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
      {!primaryAction && !secondaryAction && action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 px-6 text-center">
      <svg
        className="h-12 w-12 text-destructive/60"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <h3 className="mt-4 text-sm font-medium text-foreground">{title}</h3>
      {message && (
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
