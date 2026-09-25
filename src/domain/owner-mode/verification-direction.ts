/**
 * Canonical higher-is-better / lower-is-better direction for the `verificationMetric`
 * keys used by Finance/Sales/Operations/Execution's action-verification flow.
 *
 * Source of truth: each domain's own recommendation-generation source states the
 * direction in plain terms next to the metric it names --
 * `src/domain/owner-finance/{recommendations,risk-rules,opportunity-rules}.ts`,
 * `src/domain/owner-sales/recommendations.ts`,
 * `src/domain/owner-operations/{recommendations,risk-rules,opportunity-rules}.ts`,
 * `src/domain/owner-sop/recommendations.ts` -- e.g. "Re-measure dataConfidenceScore
 * next snapshot; target higher." or "Re-measure delayRatePct next period; target
 * below threshold." This table is a one-time, reviewed transcription of those
 * already-authored statements into a structured lookup, not a runtime parse of the
 * prose -- the prose itself stays exactly as written and continues to be shown to
 * the owner unchanged.
 *
 * Used ONLY to choose the verify-outcome form's default direction selection
 * (see VerificationActionForm in components/owner/DomainActionInlineForms.tsx).
 * It is never consulted by the classification math in
 * domain/founder-recovery/verification.ts, which continues to take direction as an
 * explicit input exactly as before -- and it never overrides an owner's own choice
 * once the form is open.
 *
 * A metric absent from this table has a genuinely non-directional or ambiguous
 * verification method in its own source text -- e.g. `breakEvenRevenue` ("Compare
 * next-period revenue against breakEvenRevenue") is a comparison-to-a-threshold,
 * not a stated up/down direction, and `currency`/`currencyValid` are presence or
 * validity checks with no numeric direction at all. Callers must treat a missing
 * entry as unknown and require an explicit owner selection rather than guessing
 * either direction.
 */
export type VerificationDirection = "up" | "down";

export const VERIFICATION_METRIC_DIRECTION: Readonly<Record<string, VerificationDirection>> = {
  // Shared across every domain below.
  dataConfidenceScore: "up",

  // Finance.
  cashRunwayDays: "up",
  cashDaysOfCosts: "up",
  grossMarginPct: "up",
  netMarginPct: "up",
  revenueQualityScore: "up",
  fixedCostBurdenPct: "down",
  payrollBurdenPct: "down",
  debtServicePressurePct: "down",
  receivablesPressurePct: "down",
  payablesPressurePct: "down",
  discountLeakagePct: "down",
  refundReworkLeakagePct: "down",
  costLeakageRatioPct: "down",

  // Sales.
  leadToSaleConversionPct: "up",
  qualifiedConversionPct: "up",
  repeatRatePct: "up",
  b2bPipelineCoveragePct: "up",
  lostCustomerRatePct: "down",
  complaintToSaleRatioPct: "down",
  discountDependencePct: "down",
  refundRatePct: "down",

  // Operations.
  completionRatePct: "up",
  deliverySuccessRatePct: "up",
  sopCompliancePct: "up",
  capacityUtilizationPct: "down",
  delayRatePct: "down",
  reworkRatePct: "down",
  complaintRatePct: "down",
  idleRatePct: "down",

  // Execution / SOP.
  verificationRatePct: "up",
  proofCompliancePct: "up",
  sopCoveragePct: "up",
  overdueRatePct: "down",
  repeatedFailureRatePct: "down",
  disputeRatePct: "down",
  reassignmentRatePct: "down",
};

/**
 * The metric's canonical verification direction, or `null` when the metric is
 * absent from the table above (genuinely unknown/ambiguous in its own source
 * text). Callers must treat `null` as "require an explicit owner selection",
 * never as a fallback to "up" or "down".
 */
export function getVerificationDirection(metricKey: string | null | undefined): VerificationDirection | null {
  if (!metricKey) return null;
  return VERIFICATION_METRIC_DIRECTION[metricKey] ?? null;
}
