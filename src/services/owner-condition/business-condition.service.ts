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
import { computeMissingInputsWithPriority, type MissingInput } from "@/domain/owner-finance/data-confidence";

/**
 * Deterministic total order for a domain's per-cycle actions. priorityScore
 * is clamped to [0,100] (calculateOwnerPriorityScore), so ties at the
 * ceiling are a real, expected occurrence whenever multiple critical
 * findings coexist -- a single-key orderBy has no guaranteed return order
 * for tied rows across repeated SELECTs, which is exactly what caused the
 * top-action non-determinism fixed by PR #361's dashboard.service.ts
 * change. Same 6-key sequence as that fix.
 */
const TOP_ACTION_ORDER_BY = [
  { priorityScore: "desc" as const },
  { expectedImpactScore: "desc" as const },
  { confidence: "desc" as const },
  { findingCode: "asc" as const },
  { title: "asc" as const },
  { id: "asc" as const },
];

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

// Deterministic transforms of REAL recovery data (recovery predates the spine and
// does not natively emit a DomainScore). These are documented mappings of real
// recovery fields — nothing is invented.
const RECOVERY_HEALTH_STATUS_RISK: Record<string, number> = { critical: 85, at_risk: 55, healthy: 20 };
const RECOVERY_PRIORITY_SCORE: Record<string, number> = { critical: 90, high: 70, medium: 45, low: 20 };
const RECOVERY_EFFORT_SCORE: Record<string, number> = { high: 75, medium: 50, low: 25 };
const RECOVERY_CRITICAL_METRICS = ["revenue", "totalCosts", "orderCount"] as const;

/** Map a persisted recovery cycle (+ its snapshot) to a spine DomainScore (pure). */
export function recoveryCycleToDomainScore(cycle: any, snapshot: any): DomainScore {
  const missingCritical = RECOVERY_CRITICAL_METRICS.filter(
    (f) => snapshot == null || snapshot[f] === null || snapshot[f] === undefined
  );
  return {
    domain: "recovery",
    healthScore: clampScore(cycle.healthScore), // real recovery health score
    riskScore: clampScore(RECOVERY_HEALTH_STATUS_RISK[cycle.healthStatus] ?? (100 - clampScore(cycle.healthScore))),
    opportunityScore: 0, // recovery does not score opportunity (honest 0, not invented)
    dataConfidenceScore: clampScore(100 - missingCritical.length * 30), // from real snapshot completeness
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.finding?.code ?? a.metricToMove),
    generatedAt: cycle.createdAt instanceof Date ? cycle.createdAt : new Date(cycle.createdAt),
  };
}

/** Map a persisted cashflow cycle row to a spine DomainScore (pure). */
export function cashflowCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "cashflow",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.dangerScore),
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted cashflow action row to a spine OwnerAction (pure). */
export function cashflowActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "cashflow",
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

/** Map a persisted sales cycle row to a spine DomainScore (pure). */
export function salesCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "sales",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.riskScore),
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted sales action row to a spine OwnerAction (pure). */
export function salesActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "sales",
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

/** Map a persisted operations cycle row to a spine DomainScore (pure). */
export function operationsCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "operations",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.riskScore), // operations ∈ EXECUTION_DOMAINS → routes into executionRiskScore
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted operations action row to a spine OwnerAction (pure). */
export function operationsActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "operations",
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

/** Map a persisted sop (execution) cycle row to a spine DomainScore (pure). */
export function sopCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "sop",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.riskScore), // sop ∈ EXECUTION_DOMAINS → routes into executionRiskScore
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted sop (execution) action row to a spine OwnerAction (pure). */
export function sopActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "sop",
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

/** Map a persisted marketing (growth) cycle row to a spine DomainScore (pure). */
export function marketingCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "marketing",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.riskScore), // marketing is growth: risk does not raise survival/execution rollup
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted marketing (growth) action row to a spine OwnerAction (pure). */
export function marketingActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "marketing",
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

/** Map a persisted strategy (decision-support) cycle row to a spine DomainScore (pure). */
export function strategyCycleToDomainScore(cycle: any): DomainScore {
  return {
    domain: "strategy",
    healthScore: clampScore(cycle.healthScore),
    riskScore: clampScore(cycle.riskScore), // strategy is decision-support: risk scores the option, not survival/execution
    opportunityScore: clampScore(cycle.opportunityScore),
    dataConfidenceScore: clampScore(cycle.dataConfidenceScore),
    topFindingCodes: (cycle.findings ?? []).slice(0, 3).map((f: any) => f.code),
    topActionCodes: (cycle.actions ?? []).slice(0, 3).map((a: any) => a.findingCode),
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt : new Date(cycle.generatedAt),
  };
}

/** Map a persisted strategy (decision-support) action row to a spine OwnerAction (pure). */
export function strategyActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "strategy",
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

/** Map a persisted recovery action to a spine OwnerAction (pure). */
export function recoveryActionRowToOwnerAction(a: any): OwnerAction {
  return {
    id: a.id,
    domain: "recovery",
    findingCode: a.finding?.code ?? a.metricToMove ?? "RECOVERY_ACTION",
    title: a.title,
    description: a.description,
    ownerRole: a.assignedToRole,
    priorityScore: RECOVERY_PRIORITY_SCORE[a.priority] ?? 40,
    effortScore: RECOVERY_EFFORT_SCORE[a.effort] ?? 50,
    expectedImpactScore: RECOVERY_PRIORITY_SCORE[a.priority] ?? 40, // recovery priority encodes impact+urgency
    urgencyScore: 0,
    confidence: typeof a.confidence === "number" ? a.confidence : 0,
    status: a.status,
    verificationMetric: a.metricToMove ?? "metric",
    verificationMethod: "Compare the before/after value of the action's metric.",
    expectedTimeframeDays: typeof a.verificationWindowDays === "number" ? a.verificationWindowDays : 14,
  };
}

export interface BusinessConditionResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  domainsWired: string[];
  profile: BusinessConditionProfile | null;
  isStaleData: boolean;
  dataAgeDays: number | null;
  missingInputsWithPriority: MissingInput[];
  lastDiagnosedAt: string | null; // ISO date string of most recent domain diagnosis
  nextReassessmentDue: string | null; // ISO date string (lastDiagnosedAt + adaptive cadence)
  reassessmentCadenceDays: number | null; // adaptive review cadence (7 / 14 / 30) by condition
  reassessmentReason: string | null; // why this cadence — visible to the owner
}

/**
 * Adaptive review cadence (CLAUDE.md mandatory adaptive rule): the reassessment interval must
 * track the business condition, not be a fixed 30 days. A high-survival-risk business (tight cash,
 * complaints, capacity bottleneck) needs a weekly review; a stable one does not. Thresholds mirror
 * the existing risk-badge semantics used across the owner UI (>=70 critical, >=40 elevated). Pure.
 */
export function computeReassessmentCadence(
  survivalRiskScore: number,
  executionRiskScore: number
): { days: number; reason: string } {
  const risk = Math.max(survivalRiskScore, executionRiskScore);
  if (risk >= 70) {
    return { days: 7, reason: "High survival/execution risk — weekly cash, complaint and capacity review until the condition stabilises." };
  }
  if (risk >= 40) {
    return { days: 14, reason: "Elevated risk — fortnightly review while the condition recovers." };
  }
  return { days: 30, reason: "Stable condition — monthly review cadence." };
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
    return { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], profile: null, isStaleData: false, dataAgeDays: null, missingInputsWithPriority: [], lastDiagnosedAt: null, nextReassessmentDue: null, reassessmentCadenceDays: null, reassessmentReason: null };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [financeCycle, latestFinanceSnapshot, recoveryCycle, cashflowCycle, salesCycle, operationsCycle, sopCycle, marketingCycle, strategyCycle] = await Promise.all([
    db.ownerFinanceCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        // Deterministic total order: priorityScore is clamped to [0,100], so
        // ties at the ceiling are a real, expected occurrence. Same fix/
        // rationale as dashboard.service.ts (PR #361).
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerFinancialSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    // Read-only read of the proven Module 1 recovery cycle (no recovery mutation).
    db.recoveryCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { cycleNumber: "desc" },
      include: {
        snapshot: true,
        findings: { select: { code: true } },
        actions: { include: { finding: { select: { code: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.ownerCashflowCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerSalesCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerOperationsCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerSopCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerMarketingCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
    db.ownerStrategyCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        findings: { orderBy: { severity: "asc" } },
        actions: { orderBy: TOP_ACTION_ORDER_BY },
      },
    }),
  ]);

  const domainScores: DomainScore[] = [];
  const topActions: OwnerAction[] = [];
  if (financeCycle) {
    domainScores.push(financeCycleToDomainScore(financeCycle));
    for (const a of financeCycle.actions) topActions.push(financeActionRowToOwnerAction(a));
  }
  if (recoveryCycle) {
    domainScores.push(recoveryCycleToDomainScore(recoveryCycle, recoveryCycle.snapshot));
    for (const a of recoveryCycle.actions) topActions.push(recoveryActionRowToOwnerAction(a));
  }
  if (cashflowCycle) {
    domainScores.push(cashflowCycleToDomainScore(cashflowCycle));
    for (const a of cashflowCycle.actions) topActions.push(cashflowActionRowToOwnerAction(a));
  }
  if (salesCycle) {
    domainScores.push(salesCycleToDomainScore(salesCycle));
    for (const a of salesCycle.actions) topActions.push(salesActionRowToOwnerAction(a));
  }
  if (operationsCycle) {
    domainScores.push(operationsCycleToDomainScore(operationsCycle));
    for (const a of operationsCycle.actions) topActions.push(operationsActionRowToOwnerAction(a));
  }
  if (sopCycle) {
    domainScores.push(sopCycleToDomainScore(sopCycle));
    for (const a of sopCycle.actions) topActions.push(sopActionRowToOwnerAction(a));
  }
  if (marketingCycle) {
    domainScores.push(marketingCycleToDomainScore(marketingCycle));
    for (const a of marketingCycle.actions) topActions.push(marketingActionRowToOwnerAction(a));
  }
  if (strategyCycle) {
    domainScores.push(strategyCycleToDomainScore(strategyCycle));
    for (const a of strategyCycle.actions) topActions.push(strategyActionRowToOwnerAction(a));
  }

  const missingCriticalData =
    latestFinanceSnapshot && Array.isArray(latestFinanceSnapshot.missingCriticalData)
      ? (latestFinanceSnapshot.missingCriticalData as string[])
      : [];

  // Compute data staleness from the latest finance snapshot's periodEnd (honest: 0 when no snapshot).
  const STALE_DAYS = 45;
  const now = opts.now ?? new Date();
  let isStaleData = false;
  let dataAgeDays: number | null = null;
  if (latestFinanceSnapshot?.periodEnd) {
    const periodEnd = latestFinanceSnapshot.periodEnd instanceof Date
      ? latestFinanceSnapshot.periodEnd
      : new Date(latestFinanceSnapshot.periodEnd as string);
    const ageDays = Math.floor((now.getTime() - periodEnd.getTime()) / 86_400_000);
    dataAgeDays = ageDays;
    isStaleData = ageDays > STALE_DAYS;
  }

  const missingInputsWithPriority = latestFinanceSnapshot
    ? computeMissingInputsWithPriority(latestFinanceSnapshot as Record<string, unknown>)
    : [];

  // Most-recent domain diagnosis date (cadence is applied below, once the profile risk is known).
  let lastDiagnosedAt: string | null = null;
  let lastDate: Date | null = null;
  if (domainScores.length > 0) {
    const latestScore = domainScores.reduce((latest, s) => {
      const t = s.generatedAt instanceof Date ? s.generatedAt : new Date(s.generatedAt as string);
      const l = latest instanceof Date ? latest : new Date(latest as string);
      return t > l ? s.generatedAt : latest;
    }, domainScores[0].generatedAt);
    lastDate = latestScore instanceof Date ? latestScore : new Date(latestScore as string);
    lastDiagnosedAt = lastDate.toISOString();
  }

  if (domainScores.length === 0) {
    return {
      businesses: businessList,
      selectedBusinessId,
      hasData: false,
      domainsWired: [],
      profile: null,
      isStaleData: false,
      dataAgeDays: null,
      missingInputsWithPriority,
      lastDiagnosedAt: null,
      nextReassessmentDue: null,
      reassessmentCadenceDays: null,
      reassessmentReason: null,
    };
  }

  const profile = buildBusinessConditionProfile({
    businessId: selectedBusinessId,
    workspaceId,
    domainScores,
    topActions,
    missingCriticalData,
    now,
  });

  // Adaptive review cadence driven by the diagnosed condition (not a fixed 30 days).
  const cadence = computeReassessmentCadence(profile.survivalRiskScore, profile.executionRiskScore);
  const nextReassessmentDue = lastDate
    ? new Date(lastDate.getTime() + cadence.days * 86_400_000).toISOString()
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: true,
    domainsWired: domainScores.map((d) => d.domain),
    profile,
    isStaleData,
    dataAgeDays,
    missingInputsWithPriority,
    lastDiagnosedAt,
    nextReassessmentDue,
    reassessmentCadenceDays: cadence.days,
    reassessmentReason: cadence.reason,
  };
}
