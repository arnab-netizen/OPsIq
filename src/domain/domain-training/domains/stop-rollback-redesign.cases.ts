/**
 * D6 — When to stop/rollback/redesign: 21 executable, scored cases (all 10 scenario types).
 */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { StopInput } from "@/domain/domain-training/domains/stop-rollback-redesign";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("trend", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("trend", DataConfidenceStatus.MISSING)];

type Case = DomainCase<StopInput>;
function c(id: string, st: Case["scenarioType"], archetype: string, input: StopInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, unsafe: string[] = []): Case {
  return { id, domain: "D6", archetype, scenarioType: st, input,
    expected: { diagnosisKeyword: "decision", proofKeyword: "outcome trend", verificationKeyword: "harm", sideEffectMetrics: ["harm severity"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: unsafe };
}

export const STOP_ROLLBACK_REDESIGN_CASES: Case[] = [
  c("D6-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Continue" }),
  c("D6-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Continue" }),
  c("D6-03", "messy_real_world", "universal", { outcomeWorsening: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Roll back" }),
  c("D6-04", "messy_real_world", "universal", { repeatedFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not retry the same action unchanged"], nextActionKeyword: "Redesign" }),
  c("D6-05", "adversarial", "universal", { harmDetected: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }, ["false_completion_acceptance"]),
  c("D6-06", "adversarial", "universal", { irreversibleRiskRising: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }),
  c("D6-07", "missing_data", "universal", { outcomeWorsening: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Roll back" }),
  c("D6-08", "missing_data", "universal", { repeatedFailure: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not retry the same action unchanged"], nextActionKeyword: "Redesign" }),
  c("D6-09", "cross_pressure", "universal", { harmDetected: true, outcomeWorsening: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }),
  c("D6-10", "cross_pressure", "universal", { outcomeWorsening: true, repeatedFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not continue the current action", "do not retry the same action unchanged"], nextActionKeyword: "Roll back" }),
  c("D6-11", "archetype_laundry", "laundry", { harmDetected: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }),
  c("D6-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "Continue" }),
  c("D6-13", "archetype_housekeeping", "housekeeping", { complianceOrSafetyIssue: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "CRITICAL", whatNotToDo: ["do not continue the current action", "do not proceed without expert review"], nextActionKeyword: "Stop the action" }),
  c("D6-14", "archetype_housekeeping", "housekeeping", { repeatedFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not retry the same action unchanged"], nextActionKeyword: "Redesign" }),
  c("D6-15", "owner_pressure", "universal", { outcomeWorsening: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Roll back" }),
  c("D6-16", "owner_pressure", "universal", { repeatedFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not retry the same action unchanged"], nextActionKeyword: "Redesign" }),
  c("D6-17", "false_completion", "universal", { harmDetected: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }, ["false_completion_acceptance"]),
  c("D6-18", "false_completion", "laundry", { outcomeWorsening: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Roll back" }),
  c("D6-19", "vanity_metric", "universal", { repeatedFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not retry the same action unchanged"], nextActionKeyword: "Redesign" }, ["vanity_metric_optimization"]),
  c("D6-20", "adversarial", "housekeeping", { complianceOrSafetyIssue: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "CRITICAL", whatNotToDo: ["do not continue the current action", "do not proceed without expert review"], nextActionKeyword: "Stop the action" }),
  c("D6-21", "missing_data", "universal", { harmDetected: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "CRITICAL", whatNotToDo: ["do not continue the current action"], nextActionKeyword: "Stop the action" }),
];
