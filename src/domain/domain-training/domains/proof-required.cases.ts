/**
 * D4 — What proof is required: 21 executable, scored simulation cases (all 10 scenario types).
 */

import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import { EvidenceType } from "@/domain/domain-training/evidence-hierarchy";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { ProofInput } from "@/domain/domain-training/domains/proof-required";

const dp = (key: string, s: DataConfidenceStatus): DataPoint => ({ key, status: s, critical: true });
const VER: DataPoint[] = [dp("proof", DataConfidenceStatus.VERIFIED)];

type Case = DomainCase<ProofInput>;
const PROOF = "required strength";
const VERIFY = "attests the outcome";

function c(
  id: string, st: Case["scenarioType"], archetype: string, input: ProofInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string },
  unsafe: string[] = []
): Case {
  return {
    id, domain: "D4", archetype, scenarioType: st, input,
    expected: { diagnosisKeyword: "proof", proofKeyword: PROOF, verificationKeyword: VERIFY, sideEffectMetrics: ["false-completion rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: unsafe,
  };
}

const ACCEPT = "verified proof";
const COLLECT = "Collect the required proof";

export const PROOF_REQUIRED_CASES: Case[] = [
  c("D4-01", "clean_normal", "universal", { highRisk: false, evidence: EvidenceType.MANAGER_VERIFICATION, dataPoints: VER },
    { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: ACCEPT }),
  c("D4-02", "clean_normal", "universal", { highRisk: true, evidence: EvidenceType.SYSTEM_TRANSACTION, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: ACCEPT }),
  c("D4-03", "messy_real_world", "universal", { highRisk: false, evidence: EvidenceType.STAFF_SELF_REPORT, proofStale: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept stale proof"], nextActionKeyword: COLLECT }),
  c("D4-04", "messy_real_world", "universal", { highRisk: true, evidence: EvidenceType.STAFF_SELF_REPORT, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not close high-risk without manager verification or stronger"], nextActionKeyword: COLLECT }),
  c("D4-05", "adversarial", "universal", { highRisk: true, evidence: EvidenceType.PHOTO_VIDEO, proofShowsTaskNotOutcome: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not accept task-done as outcome-verified"], nextActionKeyword: COLLECT }, ["false_completion_acceptance"]),
  c("D4-06", "adversarial", "universal", { highRisk: false, evidence: EvidenceType.CUSTOMER_GENERATED, proofContradictory: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept contradictory proof"], nextActionKeyword: COLLECT }),
  c("D4-07", "missing_data", "universal", { highRisk: false, evidence: "none", dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept completion without proof"], nextActionKeyword: COLLECT }),
  c("D4-08", "missing_data", "universal", { highRisk: true, evidence: "none", dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not accept completion without proof"], nextActionKeyword: COLLECT }),
  c("D4-09", "cross_pressure", "universal", { highRisk: true, evidence: EvidenceType.MANAGER_VERIFICATION, proofStale: true, proofShowsTaskNotOutcome: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not accept stale proof", "do not accept task-done as outcome-verified"], nextActionKeyword: COLLECT }),
  c("D4-10", "cross_pressure", "universal", { highRisk: false, evidence: EvidenceType.STAFF_SELF_REPORT, proofContradictory: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept contradictory proof"], nextActionKeyword: COLLECT }),
  c("D4-11", "archetype_laundry", "laundry", { highRisk: true, evidence: EvidenceType.PHOTO_VIDEO, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: ACCEPT }),
  c("D4-12", "archetype_laundry", "laundry", { highRisk: false, evidence: EvidenceType.STAFF_SELF_REPORT, proofStale: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept stale proof"], nextActionKeyword: COLLECT }),
  c("D4-13", "archetype_housekeeping", "housekeeping", { highRisk: true, evidence: EvidenceType.MANAGER_VERIFICATION, dataPoints: VER },
    { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: ACCEPT }),
  c("D4-14", "archetype_housekeeping", "housekeeping", { highRisk: true, evidence: EvidenceType.STAFF_SELF_REPORT, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not close high-risk without manager verification or stronger"], nextActionKeyword: COLLECT }),
  c("D4-15", "owner_pressure", "universal", { highRisk: true, evidence: EvidenceType.STAFF_SELF_REPORT, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not close high-risk without manager verification or stronger"], nextActionKeyword: COLLECT }, ["false_completion_acceptance"]),
  c("D4-16", "owner_pressure", "universal", { highRisk: true, evidence: EvidenceType.OWNER_RECOLLECTION, dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not close high-risk without manager verification or stronger"], nextActionKeyword: COLLECT }),
  c("D4-17", "false_completion", "universal", { highRisk: false, evidence: EvidenceType.MANAGER_VERIFICATION, proofShowsTaskNotOutcome: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept task-done as outcome-verified"], nextActionKeyword: COLLECT }, ["false_completion_acceptance"]),
  c("D4-18", "false_completion", "laundry", { highRisk: false, evidence: EvidenceType.ASSUMPTION, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept completion without proof"], nextActionKeyword: COLLECT }),
  c("D4-19", "vanity_metric", "universal", { highRisk: false, evidence: EvidenceType.TIMESTAMPED_OPERATIONAL_LOG, proofShowsTaskNotOutcome: true, dataPoints: VER },
    { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not accept task-done as outcome-verified"], nextActionKeyword: COLLECT }),
  c("D4-20", "adversarial", "housekeeping", { highRisk: true, evidence: EvidenceType.MANAGER_VERIFICATION, complianceSensitive: true, dataPoints: VER },
    { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [], nextActionKeyword: COLLECT }),
  c("D4-21", "missing_data", "universal", { highRisk: true, evidence: "none", dataPoints: VER },
    { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not accept completion without proof"], nextActionKeyword: COLLECT }),
];
