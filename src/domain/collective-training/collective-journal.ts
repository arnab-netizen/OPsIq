/**
 * C18 (journal) — Collective decision journal + harm ledger projection (pure).
 *
 * Projects a CollectiveDecisionPacket onto the existing F7 DecisionRecord shape and the
 * F8 HarmEntry shape so the collective decision is written through the SAME governed
 * audit/decision-memory and harm-tracking layers as individual decisions (workspace-
 * scoped). It validates via the existing F7/F8 validators — no parallel audit system.
 */

import type { CollectiveDecisionPacket } from "@/domain/collective-training/collective-types";
import type { CollectiveInput } from "@/domain/collective-training/collective-engine";
import type { DecisionRecord } from "@/domain/domain-training/decision-journal";
import { validateDecisionRecord } from "@/domain/domain-training/decision-journal";
import type { HarmEntry } from "@/domain/domain-training/harm-ledger";
import { validateHarmEntry } from "@/domain/domain-training/harm-ledger";
import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import { maxSeverity } from "@/domain/domain-training/severity-scoring";

export function toDecisionRecord(
  workspaceId: string, archetype: string, input: CollectiveInput, packet: CollectiveDecisionPacket, occurredAtMs: number,
): DecisionRecord {
  const severity: TrainingSeverity = packet.rankedDomainSignals.reduce<TrainingSeverity>((acc, s) => maxSeverity(acc, s.severity), "INFO");
  const wntd = [
    ...packet.whatNotToDo.prohibited, ...packet.whatNotToDo.temporarilyBlocked,
    ...packet.whatNotToDo.requiresProof, ...packet.whatNotToDo.requiresExpertEscalation,
  ];
  return {
    occurredAtMs,
    workspaceId,
    domain: "collective",
    archetype,
    diagnosis: packet.primaryDiagnosis,
    evidenceUsed: [...new Set(packet.rankedDomainSignals.flatMap((s) => s.evidenceUsed))],
    missingData: [...new Set(packet.rankedDomainSignals.flatMap((s) => s.missingData))],
    confidence: packet.confidence,
    severity,
    recommendation: packet.primaryNextAction,
    whatNotToDo: wntd.length > 0 ? wntd : ["(none — no active prohibition)"],
    responsibleRole: packet.whoShouldDoIt.who,
    howToExecute: packet.howToDoIt.steps.join(" → "),
    proofRequired: packet.proofRequired.evidenceType,
    expectedOutcome: packet.verificationPlan.successMetric,
    verificationPlan: `${packet.verificationPlan.successMetric} (review: ${packet.verificationPlan.reviewWindow})`,
    stopRollbackRedesign: `STOP: ${packet.stopRollbackRedesign.stopCondition}; ROLLBACK: ${packet.stopRollbackRedesign.rollbackCondition}; REDESIGN: ${packet.stopRollbackRedesign.redesignCondition}`,
    learningStatus: packet.learningStatus,
  };
}

/** Harm entries to write through the F8 harm ledger (only when harm exists). */
export function toHarmEntries(workspaceId: string, input: CollectiveInput): HarmEntry[] {
  return (input.verification?.harms ?? []).map((h) => ({ ...h, workspaceId }));
}

export interface JournalResult {
  record: DecisionRecord;
  recordViolations: string[];
  harmEntries: HarmEntry[];
  harmViolations: string[];
}

/** Build + validate the full journal projection for a collective decision. */
export function journalCollectiveDecision(
  workspaceId: string, archetype: string, input: CollectiveInput, packet: CollectiveDecisionPacket, occurredAtMs: number,
): JournalResult {
  const record = toDecisionRecord(workspaceId, archetype, input, packet, occurredAtMs);
  const harmEntries = toHarmEntries(workspaceId, input);
  return {
    record,
    recordViolations: validateDecisionRecord(record),
    harmEntries,
    harmViolations: harmEntries.flatMap((h) => validateHarmEntry(h)),
  };
}
