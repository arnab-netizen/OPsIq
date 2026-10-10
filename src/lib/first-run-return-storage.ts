/**
 * Per-viewer convenience for the "Improve this recommendation" round trip: what the owner was looking at before they left
 * (labels and tiers only) and that they are mid-round-trip. sessionStorage can be unavailable or empty (private window,
 * cleared data); nothing here is authoritative — question progress and evidence live on the server — so every access is
 * guarded and the flow works (without the "what changed" comparison) when it returns nothing.
 */
import type { FirstRunBeforeSummary } from "@/domain/owner-first-run/first-run-return";

const BEFORE_KEY = "opsiq:first-run:before";
const ACTIVE_KEY = "opsiq:first-run:round-trip";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveBeforeSummary(summary: FirstRunBeforeSummary): void {
  try {
    const s = store();
    if (!s) return;
    s.setItem(BEFORE_KEY, JSON.stringify(summary));
    s.setItem(ACTIVE_KEY, "1");
  } catch {
    /* convenience only */
  }
}

export function readBeforeSummary(): FirstRunBeforeSummary | null {
  try {
    const raw = store()?.getItem(BEFORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FirstRunBeforeSummary>;
    if (typeof v.confidenceTier !== "string" || typeof v.questionLabel !== "string" || !Array.isArray(v.missingEvidence)) return null;
    return {
      recommendedAction: typeof v.recommendedAction === "string" ? v.recommendedAction : null,
      confidenceTier: v.confidenceTier,
      evidenceQuality: typeof v.evidenceQuality === "string" ? v.evidenceQuality : null,
      missingEvidence: v.missingEvidence.filter((m): m is string => typeof m === "string"),
      questionLabel: v.questionLabel,
    };
  } catch {
    return null;
  }
}

export function isRoundTripActive(): boolean {
  try {
    return store()?.getItem(ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearRoundTrip(): void {
  try {
    store()?.removeItem(BEFORE_KEY);
    store()?.removeItem(ACTIVE_KEY);
  } catch {
    /* convenience only */
  }
}
