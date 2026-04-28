import type { DiagnosisV2Input, DiagnosisV2Result } from "@/domain/diagnosis-v2/types";
import { runDiagnosisV2 } from "./orchestrator";
import { computeBusinessStateSnapshot, type BusinessStateSnapshot } from "@/services/business-state/business-state.engine";
import { buildVariableSnapshots, type VariableSnapshot } from "@/services/variables/variable-registry.engine";
import { evaluateBusinessTriggers, type TriggerDecision } from "@/services/triggers/trigger-rule.engine";
import { buildActionPlan, type ActionPlanV2 } from "@/services/actions/action-plan.engine";
import { computeDataQualityScore, type DataQualityScore } from "@/services/confidence/data-quality.engine";
import { buildDiagnosisExplanations, type ExplanationNode } from "@/services/findings/explanation.engine";
import { buildAuditEvent, type AuditEventEnvelope } from "@/services/audit/audit-event.builder";

export interface EnterpriseDiagnosisV2Result extends DiagnosisV2Result {
  enterprise: {
    dataQuality: DataQualityScore;
    businessState: BusinessStateSnapshot;
    variables: VariableSnapshot[];
    triggers: TriggerDecision[];
    actionPlan: ActionPlanV2;
    explanations: ExplanationNode[];
    auditEvents: AuditEventEnvelope[];
  };
}

export function runEnterpriseDiagnosisV2(input: DiagnosisV2Input): EnterpriseDiagnosisV2Result {
  const base = runDiagnosisV2(input);
  const dataQuality = computeDataQualityScore({
    facts: base.facts,
    validationIssues: base.validationIssues,
    evidenceSufficiency: base.evidenceSufficiency,
  });
  const businessState = computeBusinessStateSnapshot(base);
  const variables = buildVariableSnapshots({ facts: base.facts, metrics: base.metrics });
  const triggers = evaluateBusinessTriggers({ state: businessState, variables });
  const actionPlan = buildActionPlan({ recommendations: base.recommendations, risks: base.risks });
  const explanations = buildDiagnosisExplanations(base);
  const terminalEvent = base.needsInput ? "diagnosis.v2.needs_input" : "diagnosis.v2.completed";
  const auditEvents = [
    buildAuditEvent({
      name: "diagnosis.v2.started",
      engagementId: input.engagementId,
      payload: { runId: input.runId, runMode: base.run.runMode },
      occurredAt: input.nowIso,
    }),
    buildAuditEvent({
      name: terminalEvent,
      engagementId: input.engagementId,
      payload: {
        runId: input.runId,
        confidence: base.run.confidence,
        needsInput: base.needsInput,
        validationIssueCount: base.validationIssues.length,
        recommendationCount: base.recommendations.length,
      },
      occurredAt: base.run.completedAt,
    }),
    buildAuditEvent({
      name: "business_state.snapshot_computed",
      engagementId: input.engagementId,
      payload: { status: businessState.status, confidence: businessState.confidence },
      occurredAt: base.run.completedAt,
    }),
    buildAuditEvent({
      name: "action_plan.generated",
      engagementId: input.engagementId,
      payload: { phase: actionPlan.phase, actionCount: actionPlan.items.length },
      occurredAt: base.run.completedAt,
    }),
  ];

  return {
    ...base,
    enterprise: {
      dataQuality,
      businessState,
      variables,
      triggers,
      actionPlan,
      explanations,
      auditEvents,
    },
  };
}
