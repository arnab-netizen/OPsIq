/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Trust, Audit & Explainability (Module 11) — trust service.
 *
 * Read-only. Builds credible explanations for a diagnosis cycle's findings/actions
 * via the proven per-domain diagnosis reads + the deterministic explainability
 * engine, and reads an entity's audit trail from the existing governed audit log.
 * Owns no table and mutates nothing — workspace ownership is enforced by the
 * underlying domain reads and the audit query is workspace-scoped.
 */
import { buildExplanations, type ExplanationCard } from "@/domain/owner-trust";
import type { TrustDomain } from "@/domain/owner-trust";
import type { OwnerAction, OwnerFinding, OwnerDomain } from "@/domain/owner-spine/contracts";
import { queryAuditEvents } from "@/infra/audit";
import { getFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { getCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { getSopDiagnosis } from "@/services/owner-sop/diagnosis.service";
import { getMarketingDiagnosis } from "@/services/owner-marketing/diagnosis.service";
import { getStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";

type CycleReader = (cycleId: string, workspaceId: string) => Promise<any>;

const DIAGNOSIS_READERS: Record<TrustDomain, CycleReader> = {
  finance: getFinanceDiagnosis,
  sales: getSalesDiagnosis,
  cashflow: getCashflowDiagnosis,
  operations: getOperationsDiagnosis,
  sop: getSopDiagnosis,
  marketing: getMarketingDiagnosis,
  strategy: getStrategyDiagnosis,
};

/** Map a persisted finding row to a spine OwnerFinding (attach the domain). */
function rowToFinding(row: any, domain: OwnerDomain): OwnerFinding {
  return {
    domain,
    code: row.code,
    title: row.title,
    summary: row.summary,
    sourceMetric: row.sourceMetric,
    sourceValue: row.sourceValue ?? null,
    threshold: row.threshold ?? null,
    severity: row.severity,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    impactScore: row.impactScore,
    urgencyScore: row.urgencyScore,
    findingType: row.findingType,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    missingData: Array.isArray(row.missingData) ? (row.missingData as string[]) : [],
    verificationMetric: row.verificationMetric ?? undefined,
  };
}

/** Map a persisted action row to a spine OwnerAction (attach the domain). */
function rowToAction(row: any, domain: OwnerDomain): OwnerAction {
  return {
    domain,
    findingCode: row.findingCode,
    title: row.title,
    description: row.description,
    ownerRole: row.ownerRole,
    priorityScore: row.priorityScore,
    effortScore: row.effortScore,
    expectedImpactScore: row.expectedImpactScore,
    urgencyScore: 0,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    status: row.status,
    verificationMetric: row.verificationMetric,
    verificationMethod: row.verificationMethod,
    expectedTimeframeDays: row.expectedTimeframeDays,
  };
}

export interface CycleExplanations {
  domain: TrustDomain;
  cycleId: string;
  generatedAt: string;
  explanations: ExplanationCard[];
}

/** Build explanations for every finding in a diagnosis cycle (workspace-scoped). */
export async function getCycleExplanations(
  domain: TrustDomain,
  cycleId: string,
  workspaceId: string
): Promise<CycleExplanations> {
  const cycle = await DIAGNOSIS_READERS[domain](cycleId, workspaceId); // throws NotFound if absent / cross-workspace
  const findings = (cycle.findings ?? []).map((f: any) => rowToFinding(f, domain));
  const actions = (cycle.actions ?? []).map((a: any) => rowToAction(a, domain));
  const explanations = buildExplanations(findings, actions);
  return {
    domain,
    cycleId,
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt.toISOString() : String(cycle.generatedAt),
    explanations,
  };
}

/** Read the governed audit trail for an entity (who changed what, when). */
export async function getEntityAuditTrail(
  entityId: string,
  workspaceId: string,
  opts: { limit?: number } = {}
) {
  const events = await queryAuditEvents({ workspaceId, entityId, limit: opts.limit ?? 50 });
  return events.map((e: any) => ({
    id: e.id,
    eventName: e.eventName,
    entityType: e.entityType,
    entityId: e.entityId,
    actorId: e.actorId,
    occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : String(e.occurredAt),
    payload: e.payload ?? null,
  }));
}
