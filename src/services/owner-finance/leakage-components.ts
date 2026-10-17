/**
 * Owner Finance — how the three leakage components (refund, rework, complaint) are PERSISTED, READ BACK and AMENDED.
 *
 * Kept out of snapshot.service.ts on purpose: that service's export surface is pinned by the financial-snapshot-selection
 * governance test (no "latest" wrapper). These helpers are pure — they touch no table and read no row from the database.
 *
 * Storage contract (D9): a row with `leakageCompVersion = 1` persists refund, rework and complaint cost INDEPENDENTLY
 * (NULL = UNKNOWN, 0 = an explicit known zero). A row without the marker is LEGACY: only the combined `refundReworkCost`
 * exists, its composition was never recorded and is never inferred.
 */
import { ValidationError } from "@/infra/errors";

/** Amend merge: omitted keeps the recorded value; a number sets it; null returns it to UNKNOWN. Never `??`, which cannot clear. */
function mergeAmended<T>(incoming: T | null | undefined, recorded: T | null | undefined): T | null {
  return incoming === undefined ? recorded ?? null : incoming;
}

/**
 * The leakage-component contract version written by this code. A row with this marker persists refund, rework and complaint
 * cost INDEPENDENTLY (NULL = UNKNOWN, 0 = explicit zero). A row without it (NULL) predates the split: it holds only the legacy
 * combined `refundReworkCost`, whose composition was never recorded and is never inferred.
 */
export const LEAKAGE_COMPONENT_CONTRACT_V1 = 1;

type LeakageComponents = { refundAmount?: number | null; reworkCost?: number | null; complaintCost?: number | null };
const finiteOrNull = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The persisted shape of the three leakage components: each independently (an explicit 0 stays 0, omitted/null stays UNKNOWN),
 * the contract marker, and the COMPATIBILITY aggregate `refundReworkCost` (sum of the components that are known, NULL when none
 * is). The aggregate exists only for older readers and for the "was anything supplied" check; it is never read for coverage
 * of a component-aware row.
 */
export function leakageColumns(c: LeakageComponents) {
  const refundAmount = finiteOrNull(c.refundAmount);
  const reworkCost = finiteOrNull(c.reworkCost);
  const complaintCost = finiteOrNull(c.complaintCost);
  const known = [refundAmount, reworkCost, complaintCost].filter((v): v is number => v !== null);
  return {
    refundAmount,
    reworkCost,
    complaintCost,
    leakageCompVersion: LEAKAGE_COMPONENT_CONTRACT_V1,
    refundReworkCost: known.length > 0 ? known.reduce((sum, v) => sum + v, 0) : null,
  };
}

type RecordedLeakage = LeakageComponents & { leakageCompVersion?: number | null; refundReworkCost?: number | null };

/**
 * The leakage columns of an AMENDED snapshot.
 *  - No leakage component in the amendment: the recorded state is carried forward unchanged. A legacy row stays legacy (its
 *    combined figure kept, its components still UNKNOWN) — an unrelated amendment can never turn legacy ambiguity into
 *    complete component coverage.
 *  - Component-aware row: each component merges on its own — omitted keeps the recorded state, a number sets it, null returns it
 *    to UNKNOWN. Amending one component never fabricates a value for the other two.
 *  - Legacy row with a leakage component in the amendment: the recorded combined figure cannot be split, so the amendment must
 *    restate all three components (a number, or null for UNKNOWN). They then become the component-aware record; the superseded
 *    legacy version stays in the append-only lineage. A partial restatement is refused rather than guessed.
 */
export function resolveAmendedLeakage(current: RecordedLeakage, input: LeakageComponents) {
  const incoming = [input.refundAmount, input.reworkCost, input.complaintCost];
  const touched = incoming.some((v) => v !== undefined);
  const componentAware = current.leakageCompVersion === LEAKAGE_COMPONENT_CONTRACT_V1;

  if (!touched) {
    if (componentAware) return { ...leakageColumns(current), touched, upgradedFromLegacy: false };
    return {
      refundAmount: null, reworkCost: null, complaintCost: null,
      leakageCompVersion: null as number | null,
      refundReworkCost: finiteOrNull(current.refundReworkCost),
      touched, upgradedFromLegacy: false,
    };
  }

  if (componentAware) {
    return {
      ...leakageColumns({
        refundAmount: mergeAmended(input.refundAmount, current.refundAmount),
        reworkCost: mergeAmended(input.reworkCost, current.reworkCost),
        complaintCost: mergeAmended(input.complaintCost, current.complaintCost),
      }),
      touched, upgradedFromLegacy: false,
    };
  }

  const missing = (["refundAmount", "reworkCost", "complaintCost"] as const).filter((k) => input[k] === undefined);
  if (missing.length > 0) {
    throw new ValidationError(
      "This record stored refunds, redone work and complaint costs as one combined figure, so they cannot be corrected one at a time. Enter all three (leave one as not known if you do not have it).",
      { fieldErrors: missing.map((path) => ({ path, message: "Enter this figure, or mark it as not known, to correct the combined figure" })) }
    );
  }
  return { ...leakageColumns(input), touched, upgradedFromLegacy: true };
}
