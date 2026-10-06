/**
 * The owner dashboard's per-business HEALTH classification — the translation from a business's current
 * cash/finance reading (current-cash-finance-reading.ts) and execution progress into one health status.
 *
 * Why this is separate from the reading's own fields:
 *   - `gateState` is what a SAFETY GATE enforces. It fails safe: with no completed reading, a provisional
 *     SAFE/WATCH alone is enforced as an unverified AT_RISK floor (`gateDriver === "unverified"`). That floor is
 *     an enforcement decision, not a measurement, and must not be shown as a measured at-risk business
 *     (cash-finance-narrative.ts narrates an unverified gate as "not proven either way", never as measured danger).
 *   - `gateEvidenceSufficient` only answers "does a PRESENT current reading carry a material cash-evidence gap?".
 *     With no reading at all it is vacuously true. It is NOT "assessment evidence exists", so it can never be what
 *     makes a business healthy.
 *
 * Evidence states (`dashboardEvidenceState`):
 *   - "none"                  no completed and no provisional reading at all — nothing to assess;
 *   - "provisional_unproven"  only in-progress figures that read safe (SAFE/WATCH): they flag worsening only and
 *                             never prove health, but they are not a measured danger either;
 *   - "present"               a reading to classify: completed evidence (fresh, stale/unverified or amended — each
 *                             keeps its existing fail-safe severity) or an in-progress reading that is itself
 *                             genuinely unsafe (provisional AT_RISK/CRITICAL, surfaced as the warning it is).
 *
 * Precedence (unchanged from #592 except where noted):
 *   1. critical   — measured CRITICAL / INSOLVENT_RISK, or blocked/overdue execution (independent of cash evidence);
 *   2. at_risk    — measured AT_RISK, or execution at risk (completion < 50%, independent of cash evidence);
 *   3. needs_data — NEW: no assessable evidence, or only an unproven provisional reading; and (unchanged) a present
 *                   reading resting on incomplete material cash evidence;
 *   4. healthy    — only a present, safe reading with sufficient evidence.
 * A measured danger always wins over missing evidence; missing evidence is never counted as danger or health.
 */
import type { CurrentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";

export type DashboardHealthStatus = "healthy" | "at_risk" | "critical" | "improving" | "needs_data";
export type DashboardEvidenceState = "none" | "provisional_unproven" | "present";
export type ProgressSummary = "on_track" | "at_risk" | "blocked" | "no_actions";

type ReadingFields = Pick<
  CurrentCashFinanceReading,
  "gateState" | "gateDriver" | "provisional" | "gateEvidenceSufficient" | "gateEvidenceGaps"
>;

const CASH_FIELD_LABELS: Record<string, string> = { cashInHand: "cash in hand", bankBalance: "bank balance" };
function cashFieldLabel(field: string): string {
  return CASH_FIELD_LABELS[field] ?? field;
}

/** What assessable cash/finance evidence a business has (see the module doc). */
export function dashboardEvidenceState(reading: Pick<ReadingFields, "gateState" | "gateDriver" | "provisional">): DashboardEvidenceState {
  if (reading.gateState === null) return "none";
  // The only way an in-progress reading decides the gate with an "unverified" driver is the fail-safe floor applied
  // to a provisional SAFE/WATCH when no completed reading exists.
  if (reading.provisional && reading.gateDriver === "unverified") return "provisional_unproven";
  return "present";
}

export function classifyDashboardHealth(input: {
  reading: ReadingFields;
  progressSummary: ProgressSummary;
  businessName?: string | null;
}): { status: DashboardHealthStatus; needsDataReason?: string } {
  const { reading, progressSummary, businessName } = input;
  const evidence = dashboardEvidenceState(reading);
  // The fail-safe floor is an enforcement state, never a measured one.
  const measured = evidence === "present" ? reading.gateState : null;

  const status: DashboardHealthStatus =
    measured === "CRITICAL" || measured === "INSOLVENT_RISK" || progressSummary === "blocked" ? "critical"
    : measured === "AT_RISK" || progressSummary === "at_risk" ? "at_risk"
    : evidence !== "present" || !reading.gateEvidenceSufficient ? "needs_data"
    : "healthy";
  if (status !== "needs_data") return { status };

  const forName = businessName ? ` for ${businessName}` : "";
  if (evidence === "none") {
    return { status, needsDataReason: `Add your first financial figures so OpsIQ can assess ${businessName ?? "this business"}.` };
  }
  if (evidence === "provisional_unproven") {
    return {
      status,
      needsDataReason: `The only figures on file${forName} cover a period that is still in progress, so OpsIQ cannot assess it yet: add figures for a completed period.`,
    };
  }
  const missingFields = [...new Set(reading.gateEvidenceGaps.flatMap((g) => g.missing))];
  return {
    status,
    needsDataReason: `Cash position not confirmed${forName}: enter ${missingFields.length > 0 ? `the missing ${missingFields.map(cashFieldLabel).join(" and ")}` : "the missing bank balance / cash in hand"} (enter 0 if there is none).`,
  };
}
