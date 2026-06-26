/** D24 — Risk / compliance: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { RiskComplianceInput } from "@/domain/domain-training/domains/risk-compliance";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("rc", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("rc", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("rc", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("rc", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<RiskComplianceInput>;
const COMPW = "no acting on a compliance-sensitive decision without verified expert sign-off";
const CRITW = "no ignoring a known critical risk";
const MITW = "no proceeding without a mitigation plan";
function c(id: string, st: Case["scenarioType"], a: string, input: RiskComplianceInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D24", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Risk/compliance", proofKeyword: "mitigation plan", verificationKeyword: "expert sign-off", sideEffectMetrics: ["open critical risks"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const STDCTRL = "standard controls", MIT = "mitigation plan", EXP = "verified expert", SIGN = "expert sign-off", IGN = "ignored critical risk";

export const RISK_COMPLIANCE_CASES: Case[] = [
  c("D24-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: STDCTRL }),
  c("D24-02", "clean_normal", "universal", { noMitigationPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MITW], nextActionKeyword: MIT }),
  c("D24-03", "messy_real_world", "universal", { complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }),
  c("D24-04", "messy_real_world", "universal", { criticalRiskIgnored: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: IGN }),
  c("D24-05", "adversarial", "universal", { complianceSensitive: true, criticalRiskIgnored: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "CRITICAL", whatNotToDo: [CRITW, COMPW], nextActionKeyword: IGN }, ["compliance_violation"]),
  c("D24-06", "adversarial", "universal", { complianceSensitive: true, verifiedExpertSource: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: SIGN }),
  c("D24-07", "missing_data", "universal", { criticalRiskIgnored: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: IGN }),
  c("D24-08", "missing_data", "universal", { noMitigationPlan: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [MITW], nextActionKeyword: MIT }),
  c("D24-09", "cross_pressure", "universal", { complianceSensitive: true, noMitigationPlan: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW, MITW], nextActionKeyword: EXP }),
  c("D24-10", "cross_pressure", "universal", { criticalRiskIgnored: true, noMitigationPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW, MITW], nextActionKeyword: IGN }),
  c("D24-11", "archetype_laundry", "laundry", { complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }),
  c("D24-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: STDCTRL }),
  c("D24-13", "archetype_housekeeping", "housekeeping", { criticalRiskIgnored: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: IGN }),
  c("D24-14", "archetype_housekeeping", "housekeeping", { complianceSensitive: true, verifiedExpertSource: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: SIGN }),
  c("D24-15", "owner_pressure", "universal", { complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }, ["compliance_violation"]),
  c("D24-16", "owner_pressure", "universal", { criticalRiskIgnored: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: IGN }, ["ignored_critical_risk"]),
  c("D24-17", "false_completion", "universal", { complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }, ["false_proof_acceptance"]),
  c("D24-18", "false_completion", "laundry", { noMitigationPlan: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [MITW], nextActionKeyword: MIT }),
  c("D24-19", "vanity_metric", "universal", { criticalRiskIgnored: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CRITW], nextActionKeyword: IGN }, ["vanity_metric_optimization"]),
  c("D24-20", "adversarial", "housekeeping", { complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }),
  c("D24-21", "missing_data", "universal", { complianceSensitive: true, dataPoints: CON }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [COMPW], nextActionKeyword: EXP }),
];
