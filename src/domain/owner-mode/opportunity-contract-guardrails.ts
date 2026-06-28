/**
 * Jarvis 360 Slice 11 — marketing / opportunity / contract guardrails (pure).
 *
 * Audit finding: opportunity scoring existed but was never called; there were no
 * contract/quote profitability guardrails; marketing did not enforce cash/capacity/
 * quality. These pure screens REJECT/DEFER bad opportunities, contracts, and
 * campaigns (not merely flag them), reusing the margin floor + capacity status +
 * cash-safety state. No DB/I-O. (Marketing/growth recommendations are additionally
 * gated at promotion by the Slice 0 cash gate + Slice 7 capacity gate.)
 */

import { type CapacityStatus, capacityBlocksGrowth } from "@/domain/owner-mode/equipment-capacity";
import { marginFloorPrice } from "@/domain/owner-finance/unit-economics";
import { type FinancialHealthState } from "@/domain/owner-finance/cash-safety-gate";

export type ScreenVerdict = "accept" | "defer" | "reject";

// --- Opportunity screen ------------------------------------------------------

export interface OpportunityInput {
  fitScore: number; // 0..1
  marginPct: number | null; // 0..1
  marginFloorPct: number; // 0..1
  capacityStatus: CapacityStatus;
  paymentRisk: "low" | "medium" | "high";
}

export interface ScreenResult {
  verdict: ScreenVerdict;
  reasons: string[];
}

export function screenOpportunity(o: OpportunityInput): ScreenResult {
  const reasons: string[] = [];
  if (o.marginPct != null && o.marginPct < o.marginFloorPct) {
    reasons.push(`Margin ${Math.round(o.marginPct * 100)}% is below the ${Math.round(o.marginFloorPct * 100)}% floor.`);
    return { verdict: "reject", reasons };
  }
  if (capacityBlocksGrowth(o.capacityStatus)) {
    reasons.push("Capacity is saturated/down — cannot fulfill new volume.");
    return { verdict: "defer", reasons };
  }
  if (o.paymentRisk === "high") {
    reasons.push("High payment/credit risk — defer pending terms or deposit.");
    return { verdict: "defer", reasons };
  }
  if (o.fitScore < 0.4) {
    reasons.push(`Low fit score (${o.fitScore.toFixed(2)}).`);
    return { verdict: "reject", reasons };
  }
  reasons.push("Profitable, fulfillable, acceptable risk.");
  return { verdict: "accept", reasons };
}

// --- Contract / quote screen -------------------------------------------------

export interface ContractInput {
  price: number;
  directCost: number;
  marginFloorPct: number; // 0..1
  paymentTermsDays: number;
  capacityStatus: CapacityStatus;
}

export interface ContractScreenResult extends ScreenResult {
  marginPct: number;
  floorPrice: number;
  ownerApprovalRequired: boolean;
}

export function screenContractQuote(c: ContractInput): ContractScreenResult {
  const floorPrice = marginFloorPrice(c.directCost, c.marginFloorPct);
  const marginPct = c.price > 0 ? (c.price - c.directCost) / c.price : 0;
  const reasons: string[] = [];
  let verdict: ScreenVerdict = "accept";
  if (c.price < floorPrice) {
    reasons.push(`Quote ${c.price} is below the margin-floor price ${Math.round(floorPrice)}.`);
    verdict = "reject";
  } else if (capacityBlocksGrowth(c.capacityStatus)) {
    reasons.push("Capacity cannot absorb this contract right now.");
    verdict = "defer";
  } else if (c.paymentTermsDays > 60) {
    reasons.push(`Long payment terms (${c.paymentTermsDays}d) strain working capital.`);
    verdict = "defer";
  } else {
    reasons.push("Clears margin floor, capacity, and payment terms.");
  }
  // Even an acceptable contract is owner-approved when it is large/long-dated.
  const ownerApprovalRequired = verdict === "accept" && (c.paymentTermsDays > 30 || marginPct < c.marginFloorPct + 0.05);
  return { verdict, reasons, marginPct: Math.round(marginPct * 1000) / 10, floorPrice, ownerApprovalRequired };
}

// --- Marketing run-now gate --------------------------------------------------

export interface MarketingInput {
  financialState: FinancialHealthState;
  capacityStatus: CapacityStatus;
  qualityRed: boolean;
  reputationRed: boolean;
}

export interface MarketingDecision {
  run: boolean;
  reasons: string[];
  stopLossRequired: boolean;
}

const CASH_SEVERITY: Record<FinancialHealthState, number> = { SAFE: 0, WATCH: 1, AT_RISK: 2, CRITICAL: 3, INSOLVENT_RISK: 4 };

/** Marketing should not run when cash is unsafe, capacity is blocked, or quality/reputation is red. */
export function shouldRunMarketing(m: MarketingInput): MarketingDecision {
  const reasons: string[] = [];
  if (CASH_SEVERITY[m.financialState] >= 2) reasons.push(`Cash state ${m.financialState} is unsafe for paid acquisition.`);
  if (capacityBlocksGrowth(m.capacityStatus)) reasons.push("Capacity cannot absorb new demand.");
  if (m.qualityRed) reasons.push("Quality is red — marketing would amplify a broken experience.");
  if (m.reputationRed) reasons.push("Reputation is red — fix service before acquiring.");
  const run = reasons.length === 0;
  if (run) reasons.push("Cash, capacity, quality, and reputation permit marketing.");
  return { run, reasons, stopLossRequired: run };
}
