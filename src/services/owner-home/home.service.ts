/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Home & Mobile Usability (Module 12) — owner-home service.
 *
 * Read-only. Gathers the proven per-domain spine data for a business (domain scores,
 * findings, open actions, and recorded verifications) and runs the deterministic
 * Owner Home Summary engine to produce the §19 owner-home payload. Owns no table and
 * mutates nothing; workspace ownership is enforced by the shared Module 1 `getBusiness`
 * guard and every read is workspace-scoped. Reuses the proven Business Condition
 * domain-score/action mappers — no scoring logic is duplicated here.
 */
import { db } from "@/lib/db";
import { coherentStrategyActions } from "@/services/owner-strategy/decision-view";
import { presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import { getBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import {
  buildOwnerHomeSummary,
  type OwnerHomeSummary,
  type OwnerHomeVerificationInput,
} from "@/domain/owner-home";
import {
  clampConfidence,
  clampScore,
  type DomainScore,
  type OwnerAction,
  type OwnerDomain,
  type OwnerFinding,
} from "@/domain/owner-spine/contracts";
import {
  financeCycleToDomainScore,
  financeActionRowToOwnerAction,
  recoveryCycleToDomainScore,
  recoveryActionRowToOwnerAction,
  cashflowCycleToDomainScore,
  cashflowActionRowToOwnerAction,
  salesCycleToDomainScore,
  salesActionRowToOwnerAction,
  operationsCycleToDomainScore,
  operationsActionRowToOwnerAction,
  sopCycleToDomainScore,
  sopActionRowToOwnerAction,
  marketingCycleToDomainScore,
  marketingActionRowToOwnerAction,
  strategyCycleToDomainScore,
  strategyActionRowToOwnerAction,
} from "@/services/owner-condition/business-condition.service";

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
    confidence: clampConfidence(typeof row.confidence === "number" ? row.confidence : 0),
    impactScore: clampScore(row.impactScore),
    urgencyScore: clampScore(row.urgencyScore),
    findingType: row.findingType === "opportunity" ? "opportunity" : "risk",
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    missingData: Array.isArray(row.missingData) ? (row.missingData as string[]) : [],
    verificationMetric: row.verificationMetric ?? undefined,
  };
}

/** Flatten a domain cycle's action verifications into home verification inputs. */
function flattenVerifications(cycle: any, domain: OwnerDomain): OwnerHomeVerificationInput[] {
  const out: OwnerHomeVerificationInput[] = [];
  for (const a of cycle?.actions ?? []) {
    for (const v of a.verifications ?? []) {
      out.push({
        domain,
        actionTitle: a.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }
  return out;
}

const spineCycleInclude = {
  // Severity is a plain string, so a DB orderBy sorts it alphabetically
  // (critical, high, low, medium). Findings are ranked after read: by
  // buildOwnerHomeSummary and by the *CycleToDomainScore adapters.
  findings: true,
  actions: {
    // Deterministic total order: priorityScore is clamped to [0,100], so
    // ties at the ceiling are a real, expected occurrence -- a single-key
    // orderBy has no guaranteed return order for tied rows across
    // repeated SELECTs. Same fix/rationale as dashboard.service.ts (PR #361).
    orderBy: [
      { priorityScore: "desc" },
      { expectedImpactScore: "desc" },
      { confidence: "desc" },
      { findingCode: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  },
} as const;

export interface OwnerHomeResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  domainsWired: string[];
  summary: OwnerHomeSummary | null;
}

/**
 * Build the §19 owner-home summary for a business (or the owner's most-recent one).
 * Deterministic and honest: no domain data ⇒ no summary (not invented).
 */
export async function getOwnerHome(
  workspaceId: string,
  requestedBusinessId?: string | null,
  opts: { now?: Date } = {}
): Promise<OwnerHomeResult> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId && businesses.find((b: any) => b.id === requestedBusinessId)) {
    selectedBusinessId = requestedBusinessId;
  }
  // Unambiguous only when exactly one real business exists — see hasExactlyOneRealBusiness()
  // and cockpit-finance-priority.service.ts for the same rule. With 0 businesses this falls
  // through to the existing empty-state return below; with 2+, it now also falls through
  // (selectedBusinessId stays null) rather than silently guessing businesses[0] — the exact
  // server-side "wrong business" mechanism the controlled-beta launch-blocker audit flagged.
  if (!selectedBusinessId && businesses.length === 1) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], summary: null };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard
  const where = { businessId: selectedBusinessId, workspaceId };
  const latest = { orderBy: { sequenceNumber: "desc" as const }, include: spineCycleInclude };

  // For domains where verification success triggers re-diagnosis (creating a new cycle),
  // verifications must be queried directly across ALL cycles — not through the newest
  // cycle's action chain — because the old cycle's actions hold the actual verification
  // records and are invisible from the newest cycle. Affected domains: finance, sales,
  // operations, sop, strategy (cashflow and marketing do not trigger re-diagnosis).
  const [finance, recovery, cashflow, sales, operations, sop, marketing, strategy,
    allFinanceVers, allSalesVers, allOperationsVers, allSopVers, allStrategyVers] = await Promise.all([
    db.ownerFinanceCycle.findFirst({ where, ...latest }),
    db.recoveryCycle.findFirst({
      where,
      orderBy: { cycleNumber: "desc" },
      include: {
        snapshot: true,
        findings: { select: { code: true, severity: true, confidence: true } },
        actions: { include: { finding: { select: { code: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.ownerCashflowCycle.findFirst({ where, ...latest }),
    db.ownerSalesCycle.findFirst({ where, ...latest }),
    db.ownerOperationsCycle.findFirst({ where, ...latest }),
    db.ownerSopCycle.findFirst({ where, ...latest }),
    db.ownerMarketingCycle.findFirst({ where, ...latest }),
    // Strategy needs its evaluated snapshot: its actions are arbitrated against the current decision.
    db.ownerStrategyCycle.findFirst({ where, ...latest, include: { ...spineCycleInclude, snapshot: true } }),
    db.ownerFinanceVerification.findMany({
      where,
      include: { action: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.ownerSalesVerification.findMany({
      where,
      include: { action: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.ownerOperationsVerification.findMany({
      where,
      include: { action: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.ownerSopVerification.findMany({
      where,
      include: { action: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.ownerStrategyVerification.findMany({
      where,
      include: { action: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const domainScores: DomainScore[] = [];
  const actions: OwnerAction[] = [];
  const findings: OwnerFinding[] = [];
  const verifications: OwnerHomeVerificationInput[] = [];

  if (finance) {
    domainScores.push(financeCycleToDomainScore(finance));
    for (const a of finance.actions) actions.push(financeActionRowToOwnerAction(a));
    for (const f of finance.findings) findings.push(rowToFinding(f, "finance"));
    for (const v of allFinanceVers) {
      verifications.push({
        domain: "finance",
        actionTitle: v.action.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }
  if (recovery) {
    domainScores.push(recoveryCycleToDomainScore(recovery, recovery.snapshot));
    for (const a of recovery.actions) actions.push(recoveryActionRowToOwnerAction(a));
    // Recovery findings do not carry the spine findingType/impact shape → excluded from
    // the risk/opportunity lists (honest: nothing inferred). Recovery scores still count.
  }
  if (cashflow) {
    domainScores.push(cashflowCycleToDomainScore(cashflow));
    for (const a of cashflow.actions) actions.push(cashflowActionRowToOwnerAction(a));
    for (const f of cashflow.findings) findings.push(rowToFinding(f, "cashflow"));
    verifications.push(...flattenVerifications(cashflow, "cashflow"));
  }
  if (sales) {
    domainScores.push(salesCycleToDomainScore(sales));
    for (const a of sales.actions) actions.push(salesActionRowToOwnerAction(a));
    for (const f of sales.findings) findings.push(rowToFinding(f, "sales"));
    for (const v of allSalesVers) {
      verifications.push({
        domain: "sales",
        actionTitle: v.action.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }
  if (operations) {
    domainScores.push(operationsCycleToDomainScore(operations));
    for (const a of operations.actions) actions.push(operationsActionRowToOwnerAction(a));
    for (const f of operations.findings) findings.push(rowToFinding(f, "operations"));
    for (const v of allOperationsVers) {
      verifications.push({
        domain: "operations",
        actionTitle: v.action.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }
  if (sop) {
    domainScores.push(sopCycleToDomainScore(sop));
    for (const a of sop.actions) actions.push(sopActionRowToOwnerAction(a));
    for (const f of sop.findings) findings.push(rowToFinding(f, "sop"));
    for (const v of allSopVers) {
      verifications.push({
        domain: "sop",
        actionTitle: v.action.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }
  if (marketing) {
    domainScores.push(marketingCycleToDomainScore(marketing));
    for (const a of marketing.actions) actions.push(marketingActionRowToOwnerAction(a));
    for (const f of marketing.findings) findings.push(rowToFinding(f, "marketing"));
    verifications.push(...flattenVerifications(marketing, "marketing"));
  }
  if (strategy) {
    domainScores.push(strategyCycleToDomainScore(strategy));
    // Only the decision's primary step and allowed supporting steps reach Home (never a stale
    // "Pursue"/"Proceed" that conflicts with the current decision).
    for (const a of coherentStrategyActions(strategy, strategy.actions)) actions.push(strategyActionRowToOwnerAction(a));
    // Retired "data quality" rows are data gaps, not upside (presentStoredStrategyFinding).
    for (const f of strategy.findings) findings.push(rowToFinding(presentStoredStrategyFinding(f), "strategy"));
    for (const v of allStrategyVers) {
      verifications.push({
        domain: "strategy",
        actionTitle: v.action.title,
        metric: v.verificationMetric,
        beforeValue: v.beforeValue ?? null,
        afterValue: v.afterValue ?? null,
        status: v.status,
        verifiedAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      });
    }
  }

  if (domainScores.length === 0) {
    return { businesses: businessList, selectedBusinessId, hasData: false, domainsWired: [], summary: null };
  }

  const summary = buildOwnerHomeSummary({ domainScores, findings, actions, verifications, now: opts.now });
  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: true,
    domainsWired: domainScores.map((d) => d.domain),
    summary,
  };
}
