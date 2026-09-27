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
import { buildExplanations, TRUST_DOMAINS, type ExplanationCard } from "@/domain/owner-trust";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, CURRENT_STRATEGY_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import type { TrustDomain } from "@/domain/owner-trust";
import { rankOwnerFindingsBySeverity, type OwnerAction, type OwnerFinding, type OwnerDomain } from "@/domain/owner-spine/contracts";
import { db } from "@/lib/db";
import { presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
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
  // Canonical severity order for every domain's explanations (the DB severity column is a plain
  // string, so readers that order by it return critical, high, low, medium).
  const findings = rankOwnerFindingsBySeverity<OwnerFinding>(
    (cycle.findings ?? []).map((f: any) => rowToFinding(domain === "strategy" ? presentStoredStrategyFinding(f) : f, domain))
  );
  const actions = (cycle.actions ?? []).map((a: any) => rowToAction(a, domain));
  const explanations = buildExplanations(findings, actions);
  return {
    domain,
    cycleId,
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt.toISOString() : String(cycle.generatedAt),
    explanations,
  };
}

/** Prisma delegate (per trust domain) holding that domain's diagnosis cycles. */
const CYCLE_DELEGATES: Record<TrustDomain, string> = {
  finance: "ownerFinanceCycle",
  sales: "ownerSalesCycle",
  cashflow: "ownerCashflowCycle",
  operations: "ownerOperationsCycle",
  sop: "ownerSopCycle",
  marketing: "ownerMarketingCycle",
  strategy: "ownerStrategyCycle",
};

export interface TrustCycleRef {
  domain: TrustDomain;
  cycleId: string;
  sequenceNumber: number;
  generatedAt: string;
}

export interface BusinessTrustOverview {
  businesses: Array<{ id: string; name: string; currency: string }>;
  selectedBusinessId: string | null;
  cycles: TrustCycleRef[];
}

/**
 * Read-only: for a business, the current diagnosis cycle (shared current-cycle order) in every trust
 * domain that has one. Lets the owner pick a real cycle to explain without typing UUIDs.
 */
export async function getBusinessTrustOverview(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<BusinessTrustOverview> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({ id: b.id, name: b.name, currency: b.currency }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId && businesses.find((b: any) => b.id === requestedBusinessId)) {
    selectedBusinessId = requestedBusinessId;
  }
  // Unambiguous only when exactly one real business exists — see hasExactlyOneRealBusiness()
  // and owner-home/home.service.ts for the same rule. With 0 businesses this falls
  // through to the existing empty-state return below; with 2+, it now also falls through
  // (selectedBusinessId stays null) rather than silently guessing businesses[0] — the exact
  // server-side "wrong business" mechanism the controlled-beta launch-blocker audit flagged.
  if (!selectedBusinessId && businesses.length === 1) selectedBusinessId = businesses[0].id;
  if (!selectedBusinessId) return { businesses: businessList, selectedBusinessId: null, cycles: [] };

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const cycles: TrustCycleRef[] = [];
  for (const domain of TRUST_DOMAINS) {
    const delegate = (db as any)[CYCLE_DELEGATES[domain]];
    // The CURRENT cycle (current-diagnosis-cycle.ts): latest evidence period, never merely the latest run.
    const row = await delegate.findFirst({
      // Strategy scenarios are plans (forward periods are their nature); evidence domains: ended periods only.
      where: { businessId: selectedBusinessId, workspaceId, ...(domain === "strategy" ? {} : currentEvidenceWhere(new Date())) },
      orderBy: domain === "strategy" ? CURRENT_STRATEGY_CYCLE_ORDER : CURRENT_DIAGNOSIS_CYCLE_ORDER,
      select: { id: true, sequenceNumber: true, generatedAt: true },
    });
    if (row) {
      cycles.push({
        domain,
        cycleId: row.id,
        sequenceNumber: row.sequenceNumber,
        generatedAt: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : String(row.generatedAt),
      });
    }
  }
  return { businesses: businessList, selectedBusinessId, cycles };
}

/**
 * Read the governed audit trail for an entity (who changed what, when).
 *
 * `workspaceId` is emitted from the PERSISTED audit row (`e.workspaceId`), never
 * echoed from the caller's argument. Stage 7 S7-I10 requires attribution to
 * workspace, actor, time, source evidence, affected record and result; the
 * owner-facing DTO previously carried five of those six and omitted the
 * workspace, so no owner-accessible route could evidence workspace attribution
 * at all (the internal /api/audit routes that do are, by design, denied to a
 * scoped owner). Reading it back off the row rather than reflecting the
 * parameter is what makes it evidence: `queryAuditEvents` hard-filters
 * `where: { workspaceId }` against the wrapper's verified workspace, so every
 * row returned here provably carries that workspace and a caller can neither
 * select nor influence the value. No other persisted audit column is added —
 * `previousHash` and `correlationId` stay internal.
 */
export async function getEntityAuditTrail(
  entityId: string,
  workspaceId: string,
  opts: { limit?: number } = {}
) {
  const events = await queryAuditEvents({ workspaceId, entityId, limit: opts.limit ?? 50 });
  return events.map((e: any) => ({
    id: e.id,
    workspaceId: e.workspaceId,
    eventName: e.eventName,
    entityType: e.entityType,
    entityId: e.entityId,
    actorId: e.actorId,
    occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : String(e.occurredAt),
    payload: e.payload ?? null,
  }));
}
