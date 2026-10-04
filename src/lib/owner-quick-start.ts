/**
 * Owner quick start — reporting-period choices and the ONE-ACTION orchestration of the existing
 * governed calls (save snapshot → run diagnosis). No second diagnosis engine and no bypass: both
 * steps go through the same endpoints the Finance page uses. Fetch is injected so the flow is unit
 * tested and holds no UI state.
 *
 * Failure semantics (tested):
 *   - the snapshot is saved at most once per flow; if diagnosis then fails the flow reports
 *     `diagnosis_failed` WITH the saved snapshot id so a retry only re-runs the diagnosis
 *     (`retryDiagnosis`) and can never duplicate the snapshot;
 *   - a duplicate-period conflict is reported as such, never retried as a second snapshot.
 */
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";
import type { QuickSnapshotPayload } from "@/domain/owner-finance/quick-entry";

export type QuickPeriodId = "last_month" | "this_month";

export interface QuickPeriodOption {
  id: QuickPeriodId;
  label: string;
  start: string;
  end: string;
  /** True when the period is still in progress — a read on it is provisional, never completed truth. */
  provisional: boolean;
}

function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Reporting periods offered without asking the owner for dates. OpsIQ has no authoritative business
 * timezone, so the calendar month is taken from the owner's own device clock; each option is kept only
 * if the shared `evidencePeriodState` confirms it is what its label says ("completed" for last month,
 * "provisional" for this month so far) — an option that would classify differently (e.g. the final day
 * of a month, when the end date has already passed) is withheld rather than mislabelled.
 */
export function quickReportingPeriods(now: Date): QuickPeriodOption[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastStart = new Date(y, m - 1, 1);
  const lastEndDay = new Date(y, m, 0).getDate();
  const thisEndDay = new Date(y, m + 1, 0).getDate();
  const candidates: Array<QuickPeriodOption & { expected: "completed" | "provisional" }> = [
    {
      id: "last_month",
      label: "Last month",
      start: isoDate(lastStart.getFullYear(), lastStart.getMonth(), 1),
      end: isoDate(lastStart.getFullYear(), lastStart.getMonth(), lastEndDay),
      provisional: false,
      expected: "completed",
    },
    {
      id: "this_month",
      label: "This month so far",
      start: isoDate(y, m, 1),
      end: isoDate(y, m, thisEndDay),
      provisional: true,
      expected: "provisional",
    },
  ];
  return candidates
    .filter((c) => evidencePeriodState({ periodStart: c.start, periodEnd: c.end }, now) === c.expected)
    .map((c) => ({ id: c.id, label: c.label, start: c.start, end: c.end, provisional: c.provisional }));
}

export type QuickStartApi = (path: string, init: { method: "POST"; body: string }) => Promise<unknown>;

export type QuickStartResult =
  | { status: "diagnosed"; snapshotId: string }
  | { status: "diagnosis_failed"; snapshotId: string; error: unknown }
  | { status: "snapshot_failed"; error: unknown };

function snapshotIdOf(body: unknown): string | null {
  const id = (body as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Run the first diagnosis on an ALREADY SAVED snapshot (the retry path — never re-posts the snapshot). */
export async function retryDiagnosis(api: QuickStartApi, businessId: string, snapshotId: string): Promise<QuickStartResult> {
  try {
    await api(`/api/owner/finance/businesses/${encodeURIComponent(businessId)}/diagnoses`, {
      method: "POST",
      body: JSON.stringify({ snapshotId }),
    });
    return { status: "diagnosed", snapshotId };
  } catch (error) {
    return { status: "diagnosis_failed", snapshotId, error };
  }
}

/**
 * Save the snapshot once through the governed endpoint, then run the diagnosis on it. Callers invoke
 * this only when the canonical first-read sufficiency is met — insufficient evidence is never saved
 * by the quick path (the owner is told what is still needed instead).
 */
export async function runQuickStart(args: {
  api: QuickStartApi;
  businessId: string;
  payload: QuickSnapshotPayload;
}): Promise<QuickStartResult> {
  const { api, businessId, payload } = args;
  let snapshotId: string | null;
  try {
    const created = await api(`/api/owner/finance/businesses/${encodeURIComponent(businessId)}/snapshots`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    snapshotId = snapshotIdOf(created);
  } catch (error) {
    return { status: "snapshot_failed", error };
  }
  if (!snapshotId) return { status: "snapshot_failed", error: new Error("The snapshot was saved without an id.") };
  return retryDiagnosis(api, businessId, snapshotId);
}
