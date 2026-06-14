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
  findings: { orderBy: { severity: "asc" } },
  actions: {
    orderBy: { priorityScore: "desc" },
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
  if (!selectedBusinessId && businesses.length > 0) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], summary: null };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard
  const where = { businessId: selectedBusinessId, workspaceId };
  const latest = { orderBy: { sequenceNumber: "desc" as const }, include: spineCycleInclude };

  const [finance, recovery, cashflow, sales, operations, sop, marketing, strategy] = await Promise.all([
    db.ownerFinanceCycle.findFirst({ where, ...latest }),
    db.recoveryCycle.findFirst({
      where,
      orderBy: { cycleNumber: "desc" },
      include: {
        snapshot: true,
        findings: { select: { code: true } },
        actions: { include: { finding: { select: { code: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.ownerCashflowCycle.findFirst({ where, ...latest }),
    db.ownerSalesCycle.findFirst({ where, ...latest }),
    db.ownerOperationsCycle.findFirst({ where, ...latest }),
    db.ownerSopCycle.findFirst({ where, ...latest }),
    db.ownerMarketingCycle.findFirst({ where, ...latest }),
    db.ownerStrategyCycle.findFirst({ where, ...latest }),
  ]);

  const domainScores: DomainScore[] = [];
  const actions: OwnerAction[] = [];
  const findings: OwnerFinding[] = [];
  const verifications: OwnerHomeVerificationInput[] = [];

  if (finance) {
    domainScores.push(financeCycleToDomainScore(finance));
    for (const a of finance.actions) actions.push(financeActionRowToOwnerAction(a));
    for (const f of finance.findings) findings.push(rowToFinding(f, "finance"));
    verifications.push(...flattenVerifications(finance, "finance"));
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
    verifications.push(...flattenVerifications(sales, "sales"));
  }
  if (operations) {
    domainScores.push(operationsCycleToDomainScore(operations));
    for (const a of operations.actions) actions.push(operationsActionRowToOwnerAction(a));
    for (const f of operations.findings) findings.push(rowToFinding(f, "operations"));
    verifications.push(...flattenVerifications(operations, "operations"));
  }
  if (sop) {
    domainScores.push(sopCycleToDomainScore(sop));
    for (const a of sop.actions) actions.push(sopActionRowToOwnerAction(a));
    for (const f of sop.findings) findings.push(rowToFinding(f, "sop"));
    verifications.push(...flattenVerifications(sop, "sop"));
  }
  if (marketing) {
    domainScores.push(marketingCycleToDomainScore(marketing));
    for (const a of marketing.actions) actions.push(marketingActionRowToOwnerAction(a));
    for (const f of marketing.findings) findings.push(rowToFinding(f, "marketing"));
    verifications.push(...flattenVerifications(marketing, "marketing"));
  }
  if (strategy) {
    domainScores.push(strategyCycleToDomainScore(strategy));
    for (const a of strategy.actions) actions.push(strategyActionRowToOwnerAction(a));
    for (const f of strategy.findings) findings.push(rowToFinding(f, "strategy"));
    verifications.push(...flattenVerifications(strategy, "strategy"));
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
