"use client";

/**
 * Display-only admission mode for public pages that are statically generated (resources, calculators, the
 * shared header). One cached request per page load to the same /api/auth/beta-status the signup form reads.
 * Initial render and any failure use the INVITE_ONLY wording; the server still decides every real signup.
 */
import { useEffect, useState } from "react";

let cached: Promise<string | null> | null = null;

function fetchModeOnce(): Promise<string | null> {
  if (!cached) {
    cached = Promise.resolve()
      .then(() => fetch("/api/auth/beta-status"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (typeof data?.admissionMode === "string" ? (data.admissionMode as string) : null))
      .catch(() => null);
  }
  return cached;
}

/** Test seam: forget the cached answer. */
export function resetPublicAdmissionModeCache(): void {
  cached = null;
}

export function usePublicAdmissionMode(initial: string | null = null): string | null {
  const [mode, setMode] = useState<string | null>(initial);
  useEffect(() => {
    if (initial !== null) return;
    let cancelled = false;
    void fetchModeOnce().then((m) => {
      if (!cancelled) setMode(m);
    });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  return mode;
}
