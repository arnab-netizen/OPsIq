"use client";

import Link from "next/link";

/**
 * App Router route-level error boundary.
 *
 * Presentational only. Shows a branded, user-safe message — it never renders
 * error.message, error.stack, or any internal detail. Offers a retry and a
 * link back into the app, plus beta support contact.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="w-full max-w-md space-y-4">
        <span className="text-xl font-bold text-primary">Rebilix</span>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          Rebilix hit an unexpected error. You can try again or return to the app. If it keeps
          happening, contact beta support and we&rsquo;ll help.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
          >
            Return to Rebilix
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Contact beta support:{" "}
          <a href="mailto:support@opsiq.com" className="text-primary hover:underline">
            support@opsiq.com
          </a>
        </p>
      </div>
    </main>
  );
}
