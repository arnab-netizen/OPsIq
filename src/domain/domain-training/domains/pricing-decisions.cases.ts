/**
 * D3 — Pricing decisions: 21 executable, scored simulation cases (all 10 scenario types).
 */

import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { PricingInput } from "@/domain/domain-training/domains/pricing-decisions";

const dp = (key: string, s: DataConfidenceStatus, critical = true): DataPoint => ({ key, status: s, critical });
const VER: DataPoint[] = [dp("floor", DataConfidenceStatus.VERIFIED), dp("segment_margins", DataConfidenceStatus.VERIFIED)];
const OWN: DataPoint[] = [dp("floor", DataConfidenceStatus.OWNER_REPORTED)];
const EST: DataPoint[] = [dp("floor", DataConfidenceStatus.ESTIMATED)];
const MIS: DataPoint[] = [dp("floor", DataConfidenceStatus.VERIFIED), dp("segment_margins", DataConfidenceStatus.MISSING)];
const CON: DataPoint[] = [dp("floor", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<PricingInput>;
const PROOF = "contribution floor";
const VERIFY = "recheck margin";

function c(
  id: string, st: Case["scenarioType"], archetype: string, input: PricingInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string },
  unsafe: string[] = []
): Case {
  return {
    id, domain: "D3", archetype, scenarioType: st, input,
    expected: { diagnosisKeyword: "pricing", proofKeyword: PROOF, verificationKeyword: VERIFY, sideEffectMetrics: ["conversion"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: unsafe,
  };
}

export const PRICING_DECISIONS_CASES: Case[] = [
  c("D3-01", "clean_normal", "universal", { targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Hold price" }),
  c("D3-02", "clean_normal", "universal", { targetMarginMet: true, segmentPricingNeeded: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "segment pricing" }),
  c("D3-03", "messy_real_world", "universal", { targetMarginMet: false, dataPoints: OWN },
    { confidence: "MEDIUM", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "floor" }),
  c("D3-04", "messy_real_world", "universal", { belowFloor: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no below-floor pricing", "no discounting below margin"], nextActionKeyword: "floor" }),
  c("D3-05", "adversarial", "universal", { belowFloor: true, competitorMatchingBlind: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no blind competitor matching", "no below-floor pricing"], nextActionKeyword: "floor" }, ["discounting_below_margin"]),
  c("D3-06", "adversarial", "universal", { broadPriceChangeHighRisk: true, targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no broad price change without a test"], nextActionKeyword: "Hold price" }),
  c("D3-07", "missing_data", "universal", { belowFloor: true, dataPoints: MIS },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["no below-floor pricing"], nextActionKeyword: "floor" }),
  c("D3-08", "missing_data", "universal", { targetMarginMet: false, dataPoints: MIS },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "floor" }),
  c("D3-09", "cross_pressure", "universal", { belowFloor: true, retentionRiskHigh: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no below-floor pricing", "no price change risking key-customer retention without review"], nextActionKeyword: "floor" }),
  c("D3-10", "cross_pressure", "universal", { b2bDiscountNoContributionProof: true, targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no B2B discount without contribution proof"], nextActionKeyword: "floor" }),
  c("D3-11", "archetype_laundry", "laundry", { belowFloor: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no below-floor pricing"], nextActionKeyword: "floor" }),
  c("D3-12", "archetype_laundry", "laundry", { segmentPricingNeeded: true, targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "segment pricing" }),
  c("D3-13", "archetype_housekeeping", "housekeeping", { targetMarginMet: false, dataPoints: VER },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "floor" }),
  c("D3-14", "archetype_housekeeping", "housekeeping", { targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Hold price" }),
  c("D3-15", "owner_pressure", "universal", { competitorMatchingBlind: true, targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: ["no blind competitor matching"], nextActionKeyword: "Hold price" }),
  c("D3-16", "owner_pressure", "universal", { belowFloor: true, competitorMatchingBlind: true, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no below-floor pricing", "no blind competitor matching"], nextActionKeyword: "floor" }, ["discounting_below_margin"]),
  c("D3-17", "false_completion", "universal", { broadPriceChangeHighRisk: true, targetMarginMet: true, dataPoints: EST },
    { confidence: "LOW", severity: "HIGH", whatNotToDo: ["no broad price change without a test"], nextActionKeyword: "Hold price" }),
  c("D3-18", "false_completion", "laundry", { b2bDiscountNoContributionProof: true, targetMarginMet: true, dataPoints: EST },
    { confidence: "LOW", severity: "MEDIUM", whatNotToDo: ["no B2B discount without contribution proof"], nextActionKeyword: "floor" }),
  c("D3-19", "vanity_metric", "universal", { competitorMatchingBlind: true, targetMarginMet: true, dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: ["no blind competitor matching"], nextActionKeyword: "Hold price" }),
  c("D3-20", "adversarial", "housekeeping", { targetMarginMet: false, complianceSensitive: true, dataPoints: VER },
    { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "floor" }),
  c("D3-21", "missing_data", "universal", { belowFloor: true, dataPoints: CON },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["no below-floor pricing"], nextActionKeyword: "floor" }),
];
