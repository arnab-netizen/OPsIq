/** D16 — Daily priorities: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { DailyPrioritiesInput } from "@/domain/domain-training/domains/daily-priorities";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("p", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("p", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("p", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("p", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<DailyPrioritiesInput>;
const CRITW = "no low-leverage work while a critical blocker is open", MANYW = "no treating everything as top priority";
function c(id: string, st: Case["scenarioType"], a: string, input: DailyPrioritiesInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D16", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "priorities", proofKeyword: "priority list", verificationKeyword: "end of day", sideEffectMetrics: ["top-priority completion rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const FOCUSED = "focused", LEV = "highest-leverage", CBF = "critical blocker first", IMP = "highest-impact", PLAN = "daily plan";

export const DAILY_PRIORITIES_CASES: Case[] = [
  c("D16-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: FOCUSED }),
  c("D16-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: FOCUSED }),
  c("D16-03", "messy_real_world", "universal", { tooManyPriorities: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-04", "messy_real_world", "universal", { openCriticalBlocker: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }),
  c("D16-05", "adversarial", "universal", { openCriticalBlocker: true, workingOnLowLeverage: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }, ["busywork_over_critical"]),
  c("D16-06", "adversarial", "universal", { workingOnLowLeverage: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: IMP }),
  c("D16-07", "missing_data", "universal", { openCriticalBlocker: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }),
  c("D16-08", "missing_data", "universal", { tooManyPriorities: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-09", "cross_pressure", "universal", { openCriticalBlocker: true, tooManyPriorities: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW, MANYW], nextActionKeyword: CBF }),
  c("D16-10", "cross_pressure", "universal", { tooManyPriorities: true, noPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-11", "archetype_laundry", "laundry", { openCriticalBlocker: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }),
  c("D16-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: FOCUSED }),
  c("D16-13", "archetype_housekeeping", "housekeeping", { tooManyPriorities: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-14", "archetype_housekeeping", "housekeeping", { noPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: PLAN }),
  c("D16-15", "owner_pressure", "universal", { openCriticalBlocker: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }, ["busywork_over_critical"]),
  c("D16-16", "owner_pressure", "universal", { tooManyPriorities: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-17", "false_completion", "universal", { openCriticalBlocker: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }),
  c("D16-18", "false_completion", "laundry", { tooManyPriorities: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-19", "vanity_metric", "universal", { workingOnLowLeverage: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: IMP }, ["vanity_metric_optimization"]),
  c("D16-20", "adversarial", "housekeeping", { tooManyPriorities: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [MANYW], nextActionKeyword: LEV }),
  c("D16-21", "missing_data", "universal", { openCriticalBlocker: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: CBF }),
];
