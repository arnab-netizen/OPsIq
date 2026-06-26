/**
 * D5 — How to verify outcome: 21 executable, scored cases (all 10 scenario types).
 */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { VerifyOutcomeInput } from "@/domain/domain-training/domains/verify-outcome";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("metric", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("metric", DataConfidenceStatus.MISSING)];

type Case = DomainCase<VerifyOutcomeInput>;
function c(id: string, st: Case["scenarioType"], archetype: string, input: VerifyOutcomeInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, unsafe: string[] = []): Case {
  return { id, domain: "D5", archetype, scenarioType: st, input,
    expected: { diagnosisKeyword: "outcome", proofKeyword: "before/after", verificationKeyword: "before and after", sideEffectMetrics: ["side-effect regression"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: unsafe };
}

export const VERIFY_OUTCOME_CASES: Case[] = [
  c("D5-01", "clean_normal", "universal", { taskCompleted: true, primaryImproved: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "verified improvement" }),
  c("D5-02", "clean_normal", "universal", { taskCompleted: true, primaryImproved: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "verified improvement" }),
  c("D5-03", "messy_real_world", "universal", { taskCompleted: true, primaryImproved: false, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not retry the same action unchanged without redesign"], nextActionKeyword: "failed" }),
  c("D5-04", "messy_real_world", "universal", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }, ["false_completion_acceptance"]),
  c("D5-05", "adversarial", "universal", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }, ["false_completion_acceptance"]),
  c("D5-06", "adversarial", "universal", { taskCompleted: true, primaryImproved: true, disputed: true, dataPoints: VER }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not learn from a disputed outcome"], nextActionKeyword: "disputed" }),
  c("D5-07", "missing_data", "universal", { taskCompleted: true, primaryImproved: true, inconclusive: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not learn from an inconclusive outcome"], nextActionKeyword: "inconclusive" }),
  c("D5-08", "missing_data", "universal", { taskCompleted: true, primaryImproved: true, inconclusive: true, dataPoints: VER }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not learn from an inconclusive outcome"], nextActionKeyword: "inconclusive" }),
  c("D5-09", "cross_pressure", "universal", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }),
  c("D5-10", "cross_pressure", "universal", { taskCompleted: true, primaryImproved: false, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not retry the same action unchanged without redesign"], nextActionKeyword: "failed" }),
  c("D5-11", "archetype_laundry", "laundry", { taskCompleted: true, primaryImproved: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "verified improvement" }),
  c("D5-12", "archetype_laundry", "laundry", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }),
  c("D5-13", "archetype_housekeeping", "housekeeping", { taskCompleted: true, primaryImproved: false, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not retry the same action unchanged without redesign"], nextActionKeyword: "failed" }),
  c("D5-14", "archetype_housekeeping", "housekeeping", { taskCompleted: true, primaryImproved: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: "verified improvement" }),
  c("D5-15", "owner_pressure", "universal", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }, ["false_completion_acceptance"]),
  c("D5-16", "owner_pressure", "universal", { taskCompleted: true, primaryImproved: true, disputed: true, dataPoints: VER }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not learn from a disputed outcome"], nextActionKeyword: "disputed" }),
  c("D5-17", "false_completion", "universal", { taskCompleted: false, primaryImproved: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not verify outcome before the task is complete"], nextActionKeyword: "Complete the task" }),
  c("D5-18", "false_completion", "laundry", { taskCompleted: true, primaryImproved: true, inconclusive: true, dataPoints: VER }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: ["do not learn from an inconclusive outcome"], nextActionKeyword: "inconclusive" }),
  c("D5-19", "vanity_metric", "universal", { taskCompleted: true, primaryImproved: true, severeSideEffect: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: ["do not classify as success despite primary improvement"], nextActionKeyword: "harmed" }, ["vanity_metric_optimization"]),
  c("D5-20", "adversarial", "housekeeping", { taskCompleted: true, primaryImproved: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "LOW", whatNotToDo: [], nextActionKeyword: "verified improvement" }),
  c("D5-21", "missing_data", "universal", { taskCompleted: false, primaryImproved: false, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: ["do not verify outcome before the task is complete"], nextActionKeyword: "Complete the task" }),
];
