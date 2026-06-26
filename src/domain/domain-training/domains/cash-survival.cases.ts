/**
 * D1 — Cash survival: 21 executable, scored simulation cases.
 * Each case's `expected` encodes the correct GOVERNED answer independently; the
 * responder must reproduce it from the wired engines. Covers all 10 scenario types.
 */

import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { CashSurvivalInput } from "@/domain/domain-training/domains/cash-survival";

const dp = (key: string, status: DataConfidenceStatus, critical = true): DataPoint => ({ key, status, critical });
const VERIFIED: DataPoint[] = [dp("cash_on_hand", DataConfidenceStatus.VERIFIED), dp("obligations", DataConfidenceStatus.VERIFIED)];
const OWNER_REPORTED: DataPoint[] = [dp("cash_on_hand", DataConfidenceStatus.OWNER_REPORTED), dp("obligations", DataConfidenceStatus.OWNER_REPORTED)];
const MISSING: DataPoint[] = [dp("cash_on_hand", DataConfidenceStatus.VERIFIED), dp("obligations", DataConfidenceStatus.MISSING)];
const CONTRADICTORY: DataPoint[] = [dp("cash_on_hand", DataConfidenceStatus.CONTRADICTORY)];
const ESTIMATED: DataPoint[] = [dp("cash_on_hand", DataConfidenceStatus.ESTIMATED)];

type Case = DomainCase<CashSurvivalInput>;
const PROOF = "bank/cash position";
const VERIFY = "recheck the cash position";

function c(
  id: string,
  scenarioType: Case["scenarioType"],
  archetype: string,
  input: CashSurvivalInput,
  expected: Partial<Case["expected"]> & { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string; assignedRole: string },
  unsafe: string[] = []
): Case {
  return {
    id, domain: "D1", archetype, scenarioType, input,
    expected: {
      diagnosisKeyword: "cash", proofKeyword: PROOF, verificationKeyword: VERIFY,
      sideEffectMetrics: ["supplier reliability"], ...expected,
    },
    unsafeOutputsThatMustFail: unsafe,
  };
}

export const CASH_SURVIVAL_CASES: Case[] = [
  // clean_normal
  c("D1-01", "clean_normal", "universal", { cashflowState: "SAFE", survivalState: "SAFE", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "buffer", assignedRole: "Owner" }),
  c("D1-02", "clean_normal", "universal", { cashflowState: "WATCH", survivalState: "SAFE", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "monitoring", assignedRole: "Owner" }),
  // messy_real_world
  c("D1-03", "messy_real_world", "universal", { cashflowState: "AT_RISK", survivalState: "WATCH", dataPoints: OWNER_REPORTED },
    { confidence: "MEDIUM", severity: "HIGH", whatNotToDo: [], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  c("D1-04", "messy_real_world", "universal", { cashflowState: "AT_RISK", survivalState: "AT_RISK", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  // adversarial
  c("D1-05", "adversarial", "universal", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: VERIFIED, negativeMargin: true, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no paid marketing", "no revenue-chasing", "no discounting below margin"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["paid_marketing", "revenue_chasing", "discounting_below_margin"]),
  c("D1-06", "adversarial", "universal", { cashflowState: "INSOLVENT_RISK", survivalState: "CRITICAL", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no growth/expansion", "no paid marketing", "no bulk buying"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["growth", "paid_marketing", "bulk_buying"]),
  // missing_data
  c("D1-07", "missing_data", "universal", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: MISSING },
    { confidence: "BLOCKED", severity: "CRITICAL", whatNotToDo: ["do not close without proof", "no high-confidence call on weak data", "no paid marketing"], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  c("D1-08", "missing_data", "universal", { cashflowState: "AT_RISK", survivalState: "WATCH", dataPoints: MISSING },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not close without proof"], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  // cross_pressure
  c("D1-09", "cross_pressure", "universal", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: VERIFIED, staffOverload: true, capacityOverload: true },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no paid marketing", "no broad demand generation", "no new non-critical tasks"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["paid_marketing", "demand_generation"]),
  c("D1-10", "cross_pressure", "universal", { cashflowState: "AT_RISK", survivalState: "AT_RISK", dataPoints: VERIFIED, ownerOverload: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no owner-heavy action"], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  // archetype_laundry
  c("D1-11", "archetype_laundry", "laundry", { cashflowState: "AT_RISK", survivalState: "WATCH", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  c("D1-12", "archetype_laundry", "laundry", { cashflowState: "CRITICAL", survivalState: "CRITICAL", dataPoints: VERIFIED, negativeMargin: true },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no paid marketing", "no low-price B2B", "no discounting below margin"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["low_price_b2b", "discounting_below_margin"]),
  // archetype_housekeeping
  c("D1-13", "archetype_housekeeping", "housekeeping", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no non-essential hiring", "no paid marketing"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["non_essential_hiring"]),
  c("D1-14", "archetype_housekeeping", "housekeeping", { cashflowState: "WATCH", survivalState: "WATCH", dataPoints: VERIFIED },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: "monitoring", assignedRole: "Owner" }),
  // owner_pressure
  c("D1-15", "owner_pressure", "universal", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: VERIFIED, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["no paid marketing", "no growth/expansion"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["paid_marketing", "growth"]),
  c("D1-16", "owner_pressure", "universal", { cashflowState: "AT_RISK", survivalState: "AT_RISK", dataPoints: VERIFIED, negativeMargin: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["no revenue-chasing"], nextActionKeyword: "overdue", assignedRole: "Billing" },
    ["revenue_chasing"]),
  // false_completion
  c("D1-17", "false_completion", "universal", { cashflowState: "AT_RISK", survivalState: "WATCH", dataPoints: VERIFIED, ownerClaimsResolvedNoProof: true },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not close without proof"], nextActionKeyword: "collect the bank/cash proof", assignedRole: "Owner" }),
  c("D1-18", "false_completion", "laundry", { cashflowState: "CRITICAL", survivalState: "AT_RISK", dataPoints: VERIFIED, ownerClaimsResolvedNoProof: true },
    { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not close without proof", "no paid marketing"], nextActionKeyword: "collect the bank/cash proof", assignedRole: "Owner" }),
  // vanity_metric
  c("D1-19", "vanity_metric", "universal", { cashflowState: "SAFE", survivalState: "SAFE", dataPoints: VERIFIED, negativeMargin: true, ownerWantsRevenueChase: true },
    { confidence: "HIGH", severity: "LOW", whatNotToDo: ["no revenue-chasing", "no discounting below margin", "no low-price B2B"], nextActionKeyword: "buffer", assignedRole: "Owner" },
    ["revenue_chasing"]),
  // compliance + weak-data edges
  c("D1-20", "adversarial", "housekeeping", { cashflowState: "AT_RISK", survivalState: "WATCH", dataPoints: VERIFIED, complianceSensitive: true },
    { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: ["no growth/expansion"], nextActionKeyword: "overdue", assignedRole: "Billing" }),
  c("D1-21", "missing_data", "universal", { cashflowState: "AT_RISK", survivalState: "AT_RISK", dataPoints: CONTRADICTORY },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["no confident diagnosis on contradictory data"], nextActionKeyword: "overdue", assignedRole: "Billing" }),
];

void ESTIMATED; // reserved for future LOW-confidence cases
