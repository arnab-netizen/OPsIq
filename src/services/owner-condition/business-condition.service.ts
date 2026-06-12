/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Command Center (Module 2 Slice 8) — Business Condition Profile service.
 *
 * Deterministically rolls up per-domain scores into ONE Business Condition Profile
 * and surfaces the single highest-priority next owner action, using the proven
 * Owner Intelligence Spine helper (`buildBusinessConditionProfile`). Reads
 * persisted data only; nothing invented. Workspace ownership is enforced via the
 * shared Module 1 `getBusiness` guard.
 *
 * v1 wires the FINANCE domain (the first domain that emits a full spine
 * DomainScore). The rollup is domain-agnostic: additional domains plug in as they
 * adopt the spine DomainScore. (Recovery does not yet emit a spine DomainScore;
 * integrating it is a future slice and must not modify Module 1.)
 */
import { db } from "@/lib/db";
import { getBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import {
  buildBusinessConditionProfile,
  clampScore,
  type DomainScore,
  type OwnerAction,
  type BusinessConditionProfile,
} from "@/domain/owner-spine/contracts";

/** Map a persisted finance cycle row to a spine DomainScore (pure). */
export function financeCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "finance",
    healthScore: clampScore(cycle.overallHealthScore),
    riskScore: clampScore(cycle.survivalRiskScore),
    opportunityScore: clampScore(cycle.growthOpportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted finance action row to a spine OwnerAction (pure). */
export function financeActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "finance",
    findingCode: a.findingCode,
    title: a.title,
    description: a.description,
    ownerRole: a.ownerRole,
    priorityScore: clampScore(a.priorityScore),
    effortScore: clampScore(a.effortScore),
    expectedImpactScore: clampScore(a.expectedImpactScore),
    urgencyScore: 0, // not separately persisted; priorityScore already encodes urgency
    confidence: typeof a.confidence === "number" ? a.confidence : 0,
    status: a.status,
    verificationMetric: a.verificationMetric,
    verificationMethod: a.verificationMethod,
    expectedTimeframeDays: a.expectedTimeframeDays,
  };
}

export interface BusinessConditionResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  domainsWired: string[];
  profile: BusinessConditionProfile | null;
}

/**
 * Build the Business Condition Profile for a business (or the owner's most-recent
 * business). Deterministic and honest: no domain data ⇒ no profile (not invented).
 */
export async function getBusinessCondition(
  workspaceId: string,
  requestedBusinessId?: string | null,
  opts: { now?: Date } = {}
): Promise<BusinessConditionResult> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId) {
    const owned = businesses.find((b: any) => b.id === requestedBusinessId);
    if (owned) selectedBusinessId = owned.id;
  }
  if (!selectedBusinessId && businesses.length > 0) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], profile: null };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [financeCycle, latestFinanceSnapshot] = await Promise.all([
    db.ownerFinanceCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: { priorityScore: "desc" } },
      },
    }),
    db.ownerFinancialSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  const domainScores: DomainScore[] = [];
  const topActions: OwnerAction[] = [];
  if (financeCycle) {
    domainScores.push(financeCycleToDomainScore(financeCycle));
    for (const a of financeCycle.actions) topActions.push(financeActionRowToOwnerAction(a));
  }

  const missingCriticalData =
    latestFinanceSnapshot && Array.isArray(latestFinanceSnapshot.missingCriticalData)
      ? (latestFinanceSnapshot.missingCriticalData as string[])
      : [];

  if (domainScores.length === 0) {
    return {
      businesses: businessList,
      selectedBusinessId,
      hasData: false,
      domainsWired: [],
      profile: null,
    };
  }

  const profile = buildBusinessConditionProfile({
    businessId: selectedBusinessId,
    workspaceId,
    domainScores,
    topActions,
    missingCriticalData,
    now: opts.now,
  });

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: true,
    domainsWired: domainScores.map((d) => d.domain),
    profile,
  };
}
