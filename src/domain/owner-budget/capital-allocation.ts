/**
 * Capital Allocation Engine (Section 6). Pure, deterministic.
 *
 * Ranks the best use of available funds using the survival-first allocation
 * hierarchy. Available budget accounts for committed/accrued obligations and
 * reserves — not just paid spend. Growth/scale/experiment candidates are gated by
 * mode and the evidence-confidence gate (reused). Funds the highest-priority
 * candidates until free cash is exhausted; lower-priority items are deferred/blocked.
 */

import {
  type AllocationCandidate,
  type AllocationDecision,
  type AvailableBudget,
  type BudgetConfidenceLevel,
  type BudgetMode,
  type CapitalAllocationResult,
  type RankedAllocation,
  ALLOCATION_HIERARCHY,
} from "@/domain/owner-budget/types";
import { checkConfidenceGate, type GatedRecommendation } from "@/domain/owner-budget/confidence-gate";

export interface CapitalAllocationInput {
  approvedBudget?: number | null;
  committedSpend?: number | null;
  paidSpend?: number | null;
  accruedObligations?: number | null;
  reserveRequired?: number | null;
  obligationsDueSoon?: number | null;
  candidates: AllocationCandidate[];
  mode: BudgetMode;
  confidence: BudgetConfidenceLevel;
}

function categoryRank(c: AllocationCandidate["category"]): number {
  const i = ALLOCATION_HIERARCHY.indexOf(c);
  return i === -1 ? ALLOCATION_HIERARCHY.length : i;
}

/** Map an allocation category to the confidence-gated recommendation class (if any). */
function gatedClassFor(c: AllocationCandidate["category"]): GatedRecommendation | null {
  switch (c) {
    case "growth_roi":
      return "controlled_growth";
    case "scale_after_readiness":
      return "scale";
    case "strategic_experiment":
      return "capped_test";
    default:
      return null;
  }
}

/** Offensive categories are blocked in defensive modes. */
const OFFENSIVE: ReadonlySet<AllocationCandidate["category"]> = new Set([
  "growth_roi",
  "scale_after_readiness",
  "strategic_experiment",
  "discretionary",
]);

function availableBudget(input: CapitalAllocationInput): AvailableBudget {
  const approved = input.approvedBudget ?? null;
  const committed = input.committedSpend ?? null;
  const paid = input.paidSpend ?? null;
  const accrued = input.accruedObligations ?? null;
  const reserveRequired = Math.max(0, input.reserveRequired ?? 0);
  const obligationsDueSoon = Math.max(0, input.obligationsDueSoon ?? 0);

  let freeToAllocate: number | null = null;
  if (approved !== null) {
    freeToAllocate =
      approved - (committed ?? 0) - (paid ?? 0) - (accrued ?? 0) - reserveRequired - obligationsDueSoon;
  }
  return { approved, committed, paid, accrued, reserveRequired, obligationsDueSoon, freeToAllocate };
}

/**
 * Rank and decide funding for candidates. Deterministic ordering: by hierarchy
 * rank, then descending expected return, then descending amount.
 */
export function rankCapitalAllocation(input: CapitalAllocationInput): CapitalAllocationResult {
  const available = availableBudget(input);
  let remaining = available.freeToAllocate;

  const ordered = [...input.candidates].sort((a, b) => {
    const r = categoryRank(a.category) - categoryRank(b.category);
    if (r !== 0) return r;
    const ret = (b.expectedReturnPct ?? -Infinity) - (a.expectedReturnPct ?? -Infinity);
    if (ret !== 0) return ret;
    return b.amount - a.amount;
  });

  const defensive = input.mode === "EMERGENCY" || input.mode === "STABILIZE";
  const ranked: RankedAllocation[] = ordered.map((candidate, index) => {
    const conf = candidate.evidenceConfidence ?? input.confidence;
    const reviewInDays = candidate.category === "strategic_experiment" ? 14 : 30;
    const killRule =
      candidate.expectedReturnPct != null
        ? `Stop if return < ${Math.max(0, Math.round(candidate.expectedReturnPct / 2))}% by review.`
        : "Stop if no measurable benefit by review date.";

    // Mandatory-tier items are always funded (within free cash) regardless of mode.
    const isOffensive = OFFENSIVE.has(candidate.category);

    // Confidence gate for offensive categories.
    const gateClass = gatedClassFor(candidate.category);
    if (gateClass) {
      const gate = checkConfidenceGate(gateClass, conf);
      if (!gate.allowed) {
        return mk(candidate, index, "BLOCK", 0, gate.reason, conf, reviewInDays, killRule);
      }
    }

    // Defensive modes block offensive (non-essential) spend.
    if (isOffensive && defensive) {
      return mk(
        candidate, index, "DEFER", 0,
        `Deferred: ${input.mode} mode protects survival before ${candidate.category}.`,
        conf, reviewInDays, killRule
      );
    }

    // Fund within remaining free cash if known.
    if (remaining === null) {
      return mk(
        candidate, index, isOffensive ? "DEFER" : "FUND",
        isOffensive ? 0 : candidate.amount,
        remaining === null && !isOffensive
          ? "Funded as mandatory tier (free cash unknown — confirm approved budget)."
          : "Free cash unknown; defer discretionary until approved budget is set.",
        conf, reviewInDays, killRule
      );
    }
    if (remaining <= 0) {
      return mk(candidate, index, "DEFER", 0, "No free cash remaining at this priority.", conf, reviewInDays, killRule);
    }
    if (remaining >= candidate.amount) {
      remaining -= candidate.amount;
      return mk(candidate, index, "FUND", candidate.amount, `Funded in full at priority ${index + 1}.`, conf, reviewInDays, killRule);
    }
    const part = remaining;
    remaining = 0;
    return mk(candidate, index, "PARTIAL_FUND", part, `Partially funded (${part}); free cash exhausted.`, conf, reviewInDays, killRule);
  });

  const fundedTotal = ranked.reduce((s, r) => s + r.fundedAmount, 0);
  const blockedCount = ranked.filter((r) => r.decision === "BLOCK").length;
  return { available, ranked, blockedCount, fundedTotal };
}

function mk(
  candidate: AllocationCandidate,
  index: number,
  decision: AllocationDecision,
  fundedAmount: number,
  reason: string,
  confidence: BudgetConfidenceLevel,
  reviewInDays: number,
  killRule: string
): RankedAllocation {
  return { candidate, rank: index + 1, decision, fundedAmount, reason, confidence, reviewInDays, killRule };
}
