/**
 * BUSINESS-REALITY PROOF LEDGER CONTRACT — the per-scenario proof-layer record for the known-to-unknown
 * corpus. Every counted scenario carries one; a proof layer is "pass" only when that layer actually ran.
 * A `skipped` scenario is never a pass. Pure contract + helpers; no DB, no model.
 */
import { z } from "zod";
import type { BusinessRealityScenario } from "./business-reality-scenario";

export const LAYER_STATUSES = ["pass", "fail", "skipped", "not_run"] as const;
export type BrLayerStatus = (typeof LAYER_STATUSES)[number];
const layer = z.enum(LAYER_STATUSES);

export const businessRealityLedgerEntrySchema = z.object({
  scenarioId: z.string().min(3),
  ownerRuntimeStatus: layer,
  dbStatus: layer,
  desktopStatus: layer,
  mobileStatus: layer,
  inputQualityStatus: layer,
  boundaryStatus: layer,
  noveltyStatus: layer,
  outcomeLoopStatus: layer,
  sourcePrivacyStatus: layer,
  businessScopeStatus: layer,
  actionStatusPolicyStatus: layer,
  dashboardStatus: layer,
  skipped: z.boolean(),
  failureReason: z.string().nullable(),
  evidenceArtifactRef: z.string().nullable(),
});
export type BusinessRealityLedgerEntry = z.infer<typeof businessRealityLedgerEntrySchema>;

/** A fresh ledger entry (all layers not_run) for a scenario. */
export function freshLedgerEntry(scenarioId: string): BusinessRealityLedgerEntry {
  const l: BrLayerStatus = "not_run";
  return {
    scenarioId, ownerRuntimeStatus: l, dbStatus: l, desktopStatus: l, mobileStatus: l, inputQualityStatus: l,
    boundaryStatus: l, noveltyStatus: l, outcomeLoopStatus: l, sourcePrivacyStatus: l, businessScopeStatus: l,
    actionStatusPolicyStatus: l, dashboardStatus: l, skipped: false, failureReason: null, evidenceArtifactRef: null,
  };
}

/** A "skipped" layer is NEVER a pass. */
export function isPass(status: BrLayerStatus): boolean {
  return status === "pass";
}

/**
 * A HIGH-RISK scenario is "risk-ready" only when it has real DB + desktop + MOBILE proof (a high-risk case an
 * owner might hit on a phone must render safely there). Enforces §6.8: highRisk without mobile proof fails.
 */
export function isRiskReady(scenario: BusinessRealityScenario, ledger: BusinessRealityLedgerEntry): boolean {
  if (ledger.skipped) return false;
  if (!scenario.highRisk) return isPass(ledger.dbStatus) && isPass(ledger.desktopStatus);
  return isPass(ledger.dbStatus) && isPass(ledger.desktopStatus) && isPass(ledger.mobileStatus);
}
