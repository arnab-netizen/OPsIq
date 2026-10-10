"use client";

/**
 * Shown on every owner page except the first-run surface while the owner is supplying evidence for "Improve this
 * recommendation". It never blocks the input form (the existing governed surface is reused as-is); it only gives the
 * owner a one-tap way back to update the read, so nobody has to find the original recommendation again, and a way to
 * dismiss it if they changed their mind. Opaque (content never shows through the text), compact on a phone, and it adds
 * scroll padding so focused fields and anchors are not hidden under it. Presentation only: the marker is a query flag
 * or per-viewer session state, never authority.
 */
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FIRST_RUN_RETURN_PARAM, FIRST_RUN_UPDATE_HREF, isFirstRunReturn } from "@/domain/owner-first-run/first-run-return";
import { clearRoundTrip, isRoundTripActive } from "@/lib/first-run-return-storage";

export function FirstRunReturnBar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const flagged = isFirstRunReturn(params.get(FIRST_RUN_RETURN_PARAM));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads per-viewer session state after mount
    setActive(flagged || isRoundTripActive());
  }, [flagged, pathname]);

  if (!active || dismissed || pathname.startsWith("/owner/first-run")) return null;
  return (
    <div
      role="region"
      aria-label="Return to your first read"
      data-testid="first-run-return-bar"
      className="sticky top-0 z-30 -mx-6 -mt-6 mb-4 scroll-mt-40 border-b border-border bg-background shadow-sm"
    >
      <div className="flex flex-col gap-2 bg-primary/10 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-foreground">Adding something for your first read? Save it, then update your read.</p>
        <div className="flex items-center gap-2">
          <Link
            href={FIRST_RUN_UPDATE_HREF}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground sm:flex-none"
            data-testid="first-run-return-link"
          >
            Update my read
          </Link>
          <button
            type="button"
            onClick={() => { clearRoundTrip(); setDismissed(true); }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-3"
            aria-label="Dismiss this reminder"
            data-testid="first-run-return-dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
