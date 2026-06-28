/**
 * Jarvis 360 Slice 1 — owner-facing evidence disclosure (pure).
 *
 * Audit finding: owner-facing decisions can proceed without disclosing the
 * evidence behind them, and stale data is not made prominent. This composes the
 * EXISTING input-quality gate (`evaluateInputQualityGate`) and cash-safety gate
 * (`evaluateCashSafetyGate`) into a single owner-readable disclosure with an
 * explicit status — it adds no new advisory/scoring logic, only presentation +
 * a combined status derived from the two proven gates.
 *
 * Status ladder (worst wins):
 *   blocked    — a gate blocks promotion (insufficient/unsafe for this decision).
 *   high_risk  — gate routes to owner/professional review.
 *   caution    — data is weak/stale but the decision is low-risk enough to proceed.
 *   allowed    — evidence sufficient.
 */

import type { InputQualityStatus } from "@/domain/owner-mode/input-quality";
import {
  evaluateInputQualityGate,
  InputQualityPromotionOutcome,
  RecommendationSensitivity,
} from "@/domain/owner-mode/recommendation-input-quality-gate";
import {
  evaluateCashSafetyGate,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";

export type EvidenceDisclosureStatus = "allowed" | "caution" | "high_risk" | "blocked";

const STATUS_RANK: Record<EvidenceDisclosureStatus, number> = {
  allowed: 0,
  caution: 1,
  high_risk: 2,
  blocked: 3,
};

export interface EvidenceDisclosureInput {
  /** The recommendation/decision sensitivity (drives how strict the gates are). */
  sensitivity: RecommendationSensitivity;
  /** Latest persisted input-quality status for the workspace (or null if none). */
  inputQualityStatus: InputQualityStatus | null;
  /** Optional cash/finance survival state (worst of cashflow + survival). */
  financialState?: FinancialHealthState | null;
  /** Human-readable data sources actually used. */
  dataSources: string[];
  /** Required inputs that are missing (drives prominence + blocking). */
  missingRequiredInputs: string[];
  /** Stale fields (drives the prominent staleness flag). */
  staleFields?: string[];
  /** Assumptions the recommendation rests on. */
  assumptions?: string[];
  /** Confidence in [0,1] if known. */
  confidence?: number | null;
}

export interface EvidenceDisclosure {
  status: EvidenceDisclosureStatus;
  /** True when stale data is present — surfaced prominently to the owner. */
  staleProminent: boolean;
  dataSources: string[];
  missingRequiredInputs: string[];
  staleFields: string[];
  assumptions: string[];
  confidence: number | null;
  /** Why the decision is allowed/caution/high-risk/blocked. */
  reasons: string[];
}

function worst(a: EvidenceDisclosureStatus, b: EvidenceDisclosureStatus): EvidenceDisclosureStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/**
 * Build the owner-facing evidence disclosure by composing the two proven gates.
 * Pure: no DB, no I/O. The recommendation promotion path still ENFORCES via the
 * gate services (Slice 0); this is the disclosure surfaced alongside that result.
 */
export function buildEvidenceDisclosure(input: EvidenceDisclosureInput): EvidenceDisclosure {
  const reasons: string[] = [];
  const staleFields = input.staleFields ?? [];
  let status: EvidenceDisclosureStatus = "allowed";

  // No input-quality assessment on record → fail-closed default (data_limited):
  // material decisions get downgraded, low-risk proceed with caution.
  const iqStatus: InputQualityStatus = input.inputQualityStatus ?? "data_limited";
  const iq = evaluateInputQualityGate(iqStatus, input.sensitivity);
  if (!iq.allowed) {
    status = worst(
      status,
      iq.outcome === InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA ? "blocked" : "high_risk"
    );
    reasons.push(iq.reason);
  } else if (input.inputQualityStatus == null) {
    status = worst(status, "caution");
    reasons.push("No input-quality assessment on record; proceeding with caution.");
  }

  if (input.financialState) {
    const cash = evaluateCashSafetyGate(input.financialState, input.financialState, input.sensitivity);
    if (!cash.allowed) {
      status = worst(status, "blocked");
      reasons.push(cash.reason);
    }
  }

  if (input.missingRequiredInputs.length > 0) {
    // Missing required inputs always at least cautions; material gates above may block.
    status = worst(status, "caution");
    reasons.push(`Missing required inputs: ${input.missingRequiredInputs.join(", ")}.`);
  }

  const staleProminent = staleFields.length > 0;
  if (staleProminent) {
    status = worst(status, "caution");
    reasons.push(`Stale data present: ${staleFields.join(", ")}.`);
  }

  if (reasons.length === 0) reasons.push("Evidence sufficient for this decision.");

  return {
    status,
    staleProminent,
    dataSources: input.dataSources,
    missingRequiredInputs: input.missingRequiredInputs,
    staleFields,
    assumptions: input.assumptions ?? [],
    confidence: input.confidence ?? null,
    reasons,
  };
}
