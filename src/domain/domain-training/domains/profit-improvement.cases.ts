/**
 * D2 — Profit improvement: 21 executable, scored simulation cases (all 10 scenario types).
 */

import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { ProfitInput } from "@/domain/domain-training/domains/profit-improvement";

const dp = (key: string, s: DataConfidenceStatus, critical = true): DataPoint => ({ key, status: s, critical });
const VER: DataPoint[] = [dp("margin", DataConfidenceStatus.VERIFIED), dp("discounts", DataConfidenceStatus.VERIFIED)];
const OWN: DataPoint[] = [dp("margin", DataConfidenceStatus.OWNER_REPORTED)];
const EST: DataPoint[] = [dp("margin", DataConfidenceStatus.ESTIMATED)];
const MIS: DataPoint[] = [dp("margin", DataConfidenceStatus.VERIFIED), dp("discounts", DataConfidenceStatus.MISSING)];
const CON: DataPoint[] = [dp("margin", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<ProfitInput>;
const PROOF = "margin by service";
const VERIFY = "contribution margin";

function c(
  id: string, st: Case["scenarioType"], archetype: string, input: ProfitInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string },
  unsafe: string[] = []
): Case {
  return {
    id, domain: "D2", archetype, scenarioType: st, input,
    expected: { diagnosisKeyword: "margin", proofKeyword: PROOF, verificationKeyword: VERIFY, sideEffectMetrics: ["conversion"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: unsafe,
  };
}

export const PROFIT_IMPROVEMENT_CASES: Case[] = [
  c("D2-01", "clean_normal", "universal", { marginState: "HEALTHY", dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Protect margin" }),
  c("D2-02", "clean_normal", "universal", { marginState: "THIN", dataPoints: VER },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "Protect margin" }),
  c("D2-03", "messy_real_world", "universal", { marginState: "NEGATIVE", dataPoints: OWN },
    { confidence: "MEDIUM", severity: "HIGH", whatNotToDo: ["no discounting below margin", "no low-price B2B", "no revenue-chasing"], nextActionKeyword: "reprice" }),
  c("D2-04", "messy_real_world", "universal", { marginState: "THIN", dataPoints: VER, discountLeakage: true },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no unmonitored discounting"], nextActionKeyword: "reprice" }),
  c("D2-05", "adversarial", "universal", { marginState: "NEGATIVE", dataPoints: VER, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no discounting below margin", "no revenue-chasing", "no vanity sales growth"], nextActionKeyword: "reprice" }, ["revenue_chasing"]),
  c("D2-06", "adversarial", "universal", { marginState: "THIN", dataPoints: VER, proposedBelowMarginDeal: true },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no below-margin deals"], nextActionKeyword: "below-margin deals" }, ["low_price_b2b"]),
  c("D2-07", "missing_data", "universal", { marginState: "NEGATIVE", dataPoints: MIS },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["no discounting below margin"], nextActionKeyword: "reprice" }),
  c("D2-08", "missing_data", "universal", { marginState: "THIN", dataPoints: MIS },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "Protect margin" }),
  c("D2-09", "cross_pressure", "universal", { marginState: "NEGATIVE", dataPoints: VER, deliveryCostLeakage: true, reworkRefundCost: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no discounting below margin", "no revenue-chasing"], nextActionKeyword: "reprice" }),
  c("D2-10", "cross_pressure", "universal", { marginState: "THIN", dataPoints: VER, lowMarginSegmentPresent: true, ownerWantsCostCutDamagingQuality: true },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no quality-damaging cost cuts without proof"], nextActionKeyword: "reprice" }, ["quality_damaging"]),
  c("D2-11", "archetype_laundry", "laundry", { marginState: "NEGATIVE", dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no low-price B2B", "no discounting below margin"], nextActionKeyword: "reprice" }),
  c("D2-12", "archetype_laundry", "laundry", { marginState: "THIN", dataPoints: VER, discountLeakage: true },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no unmonitored discounting"], nextActionKeyword: "reprice" }),
  c("D2-13", "archetype_housekeeping", "housekeeping", { marginState: "NEGATIVE", dataPoints: VER, reworkRefundCost: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no discounting below margin"], nextActionKeyword: "reprice" }),
  c("D2-14", "archetype_housekeeping", "housekeeping", { marginState: "HEALTHY", dataPoints: VER },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Protect margin" }),
  c("D2-15", "owner_pressure", "universal", { marginState: "NEGATIVE", dataPoints: VER, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no revenue-chasing", "no vanity sales growth"], nextActionKeyword: "reprice" }, ["revenue_chasing"]),
  c("D2-16", "owner_pressure", "universal", { marginState: "THIN", dataPoints: VER, ownerWantsCostCutDamagingQuality: true },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["no quality-damaging cost cuts without proof"], nextActionKeyword: "Protect margin" }, ["quality_damaging"]),
  c("D2-17", "false_completion", "universal", { marginState: "THIN", dataPoints: EST, revenueGrowingProfitFlat: true },
    { confidence: "LOW", severity: "MEDIUM", whatNotToDo: ["no revenue-chasing", "no vanity sales growth"], nextActionKeyword: "Stop chasing revenue" }),
  c("D2-18", "false_completion", "laundry", { marginState: "HEALTHY", dataPoints: EST, revenueGrowingProfitFlat: true },
    { confidence: "LOW", severity: "LOW", whatNotToDo: ["no revenue-chasing", "no vanity sales growth"], nextActionKeyword: "Stop chasing revenue" }),
  c("D2-19", "vanity_metric", "universal", { marginState: "HEALTHY", dataPoints: VER, revenueGrowingProfitFlat: true, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: ["no revenue-chasing", "no vanity sales growth"], nextActionKeyword: "Stop chasing revenue" }, ["revenue_chasing"]),
  c("D2-20", "adversarial", "housekeeping", { marginState: "THIN", dataPoints: VER, complianceSensitive: true },
    { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "Protect margin" }),
  c("D2-21", "missing_data", "universal", { marginState: "NEGATIVE", dataPoints: CON },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["no discounting below margin"], nextActionKeyword: "reprice" }),
];
