/**
 * Canonical higher-is-better / lower-is-better direction for the `verificationMetric`
 * keys used by Finance/Sales/Operations/Execution's action-verification flow.
 *
 * Source of truth: each domain's own recommendation-generation source states the
 * direction in plain terms next to the metric it names --
 * `src/domain/owner-finance/{recommendations,risk-rules,opportunity-rules}.ts`,
 * `src/domain/owner-sales/{recommendations,risk-rules,opportunity-rules}.ts`,
 * `src/domain/owner-operations/{recommendations,risk-rules,opportunity-rules}.ts`,
 * `src/domain/owner-sop/{recommendations,risk-rules,opportunity-rules}.ts` -- e.g.
 * "Re-measure dataConfidenceScore next snapshot; target higher." or "Re-measure
 * delayRatePct next period; target below threshold." This table is a one-time,
 * reviewed transcription of those already-authored statements into a structured
 * lookup, not a runtime parse of the prose -- the prose itself stays exactly as
 * written and continues to be shown to the owner unchanged. Every risk-rules.ts
 * and opportunity-rules.ts file across all four domains was cross-checked so that
 * a metric appearing in more than one rule (e.g. both a risk and an opportunity)
 * was confirmed to want the same direction in every occurrence before being
 * included below -- see the capacityUtilizationPct exception for the one case
 * that failed this check.
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

/**
 * `capacityUtilizationPct` is the one metric key that means opposite things
 * depending on which finding produced the action, so it cannot have a single
 * global direction:
 *  - `OPS_CAPACITY_BOTTLENECK` (risk-rules.ts): utilization is too HIGH: the
 *    action reduces it -- verify direction "down".
 *  - `OPS_OPP_USE_CAPACITY_HEADROOM` (opportunity-rules.ts): utilization is too
 *    LOW (spare capacity): the action raises it -- verify direction "up".
 * Resolved from the action's own `findingCode` (authoritative action context,
 * already returned to every caller alongside `verificationMetric` -- see
 * `OwnerOperationsAction.findingCode` in prisma/schema.prisma), never guessed
 * from the metric key alone. Any other/unrecognized finding code for this
 * metric preserves the ambiguity: returns `null`, requiring an explicit owner
 * selection, exactly as an unmapped metric would.
 */
const CAPACITY_UTILIZATION_DIRECTION_BY_FINDING: Readonly<Record<string, VerificationDirection>> = {
  OPS_CAPACITY_BOTTLENECK: "down",
  OPS_OPP_USE_CAPACITY_HEADROOM: "up",
};

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

  // Operations. capacityUtilizationPct is intentionally NOT here -- see
  // CAPACITY_UTILIZATION_DIRECTION_BY_FINDING above.
  completionRatePct: "up",
  deliverySuccessRatePct: "up",
  sopCompliancePct: "up",
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
 * Own-property-only lookup, mirroring the established pattern in
 * `src/lib/audit-label.ts`'s `ownLookup`. A bare `map[key]` is unsafe once `key`
 * is a runtime string that isn't guaranteed to be one of the table's authored
 * keys: every plain object literal inherits `Object.prototype` members
 * (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`, ...), so
 * `map["constructor"]` resolves to `Object`'s constructor function rather than
 * `undefined` -- and `?? null` does NOT catch this, because a function value is
 * not nullish. `Object.prototype.hasOwnProperty.call` (never `map.hasOwnProperty`,
 * itself shadowable by a same-named own property) confirms the key was actually
 * authored on `map` before it is ever indexed.
 */
function ownLookup<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** Runtime guard: true only for the exact two live values this module ever hands out. */
function isVerificationDirection(value: unknown): value is VerificationDirection {
  return value === "up" || value === "down";
}

/**
 * The metric's canonical verification direction, or `null` when it is unknown or
 * ambiguous. Always returns exactly `"up"`, `"down"`, or `null` -- never an
 * inherited `Object.prototype` value, even for a metric key like `"constructor"`
 * or `"__proto__"`.
 *
 * `findingCode` is the action's own finding/recommendation code (e.g.
 * `a.findingCode` from the persisted action row) and is REQUIRED to resolve the
 * one metric with a per-finding direction (`capacityUtilizationPct` -- see
 * `CAPACITY_UTILIZATION_DIRECTION_BY_FINDING`); every caller should pass it when
 * available. Omitting it for that one metric returns `null` (explicit owner
 * selection required) rather than guessing either direction.
 */
export function getVerificationDirection(
  metricKey: string | null | undefined,
  findingCode?: string | null
): VerificationDirection | null {
  if (!metricKey || typeof metricKey !== "string") return null;

  if (metricKey === "capacityUtilizationPct") {
    const resolved = findingCode ? ownLookup(CAPACITY_UTILIZATION_DIRECTION_BY_FINDING, findingCode) : undefined;
    return isVerificationDirection(resolved) ? resolved : null;
  }

  const lookedUp = ownLookup(VERIFICATION_METRIC_DIRECTION, metricKey);
  return isVerificationDirection(lookedUp) ? lookedUp : null;
}
