/**
 * Browser client for /api/owner/first-run/*. Transport only: timeouts, JSON, and operator-safe errors.
 * No routing, scoring or permission logic lives here (all of it is decided server-side).
 */
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import type { FirstRunContext, FirstMoneyReadView, NextQuestionView } from "@/services/owner-first-run/first-run.service";
import type { CorrectionResult } from "@/services/owner-first-run/first-run-actions.service";

import type { NextMoveView } from "@/domain/owner-first-run/next-move";

export type { NextMoveView, FirstRunContext, FirstMoneyReadView, NextQuestionView, CorrectionResult };

const TIMEOUT_MS = 20_000;
const BASE = "/api/owner/first-run";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

/** A per-attempt key: a double click or a retry of the same attempt can never create a second record. */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const firstRunApi = {
  context: () => call<FirstRunContext>(""),
  createBusiness: (body: { name?: string; businessType: string; currency: string }) =>
    post<{ business: { id: string; name: string; businessType: string; currency: string }; replayed: boolean }>("/business", body),
  result: (businessId: string) => call<FirstMoneyReadView>(`/result?businessId=${encodeURIComponent(businessId)}`),
  markViewed: (businessId: string) => post<{ ok: true }>("/result/viewed", { businessId }),
  accept: (businessId: string, idempotencyKey: string) => post<{ replayed: boolean }>("/accept", { businessId, idempotencyKey }),
  correct: (body: Record<string, unknown>) => post<CorrectionResult>("/correct", body),
  improve: (businessId: string, idempotencyKey: string) => post<{ replayed: boolean }>("/improve", { businessId, idempotencyKey }),
  nextQuestion: (businessId: string, skipped: string[], answered: number) =>
    call<NextQuestionView>(
      `/next-question?businessId=${encodeURIComponent(businessId)}&skipped=${encodeURIComponent(skipped.join(","))}&answered=${answered}`,
    ),
  feedback: (body: { businessId: string; rating: string; reason?: string; idempotencyKey: string }) => post<{ replayed: boolean }>("/feedback", body),
  nextMove: (businessId: string) =>
    call<{ nextMove: NextMoveView | null }>(`/next-move?businessId=${encodeURIComponent(businessId)}`),
  cockpitVisit: () => post<{ ok: true }>("/cockpit-visit", {}),
};
