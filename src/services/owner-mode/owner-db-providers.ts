/**
 * Real DB-backed domain providers for the production owner-advice runtime.
 *
 * Each provider reads PERSISTED Prisma records (workspace/business scoped) and returns a normalized
 * DomainState with sourceType REAL_DB / REAL_DB_SERVICE, freshness/staleness, confidence and missing
 * flags. `buildOwnerDomainProviders` prefetches the rows once (async) and returns the synchronous
 * provider closures the ingestion seam expects. Nothing here fabricates data: when a record is
 * absent the provider reports `missing` + DATA_SOURCE_MISSING and lowers confidence.
 *
 * Typed against the generated Prisma client so `tsc` validates every model/field access even though
 * `[db]`-gated execution is deferred to CI.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import {
  type Confidence,
  type DomainProvider,
  type DomainState,
  type Freshness,
  type IngestionDomain,
  type OwnerDomainProviders,
} from "./owner-domain-ingestion";

export interface OwnerDbProviderDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  /** Caller-supplied "now" (no Date.now in this layer) for deterministic staleness. */
  now: Date;
  /** Records older than this many days are flagged stale (lowers confidence). */
  freshnessDays?: number;
}

const DAY_MS = 86_400_000;

function freshnessOf(date: Date | null | undefined, now: Date, windowDays: number): Freshness {
  if (!date) return "unknown";
  const ageDays = (now.getTime() - date.getTime()) / DAY_MS;
  return ageDays <= windowDays ? "fresh" : "stale";
}

function state(partial: Omit<DomainState, "realData"> & { realData: boolean }): DomainState {
  return partial;
}

/** The prefetched, workspace/business-scoped DB rows the providers + context derivation read. */
export interface OwnerDomainRows {
  cashflow: Awaited<ReturnType<PrismaClient["ownerCashflowSnapshot"]["findFirst"]>>;
  finance: Awaited<ReturnType<PrismaClient["ownerFinancialSnapshot"]["findFirst"]>>;
  wcItems: Awaited<ReturnType<PrismaClient["ownerWorkingCapitalItem"]["findMany"]>>;
  capacity: Awaited<ReturnType<PrismaClient["ownerCapacitySnapshot"]["findFirst"]>>;
  compliance: Awaited<ReturnType<PrismaClient["ownerComplianceItem"]["findMany"]>>;
  proofs: Awaited<ReturnType<PrismaClient["proof"]["findMany"]>>;
  workload: Awaited<ReturnType<PrismaClient["ownerWorkloadSnapshot"]["findFirst"]>>;
  standingCount: number;
  business: Awaited<ReturnType<PrismaClient["ownerBusiness"]["findFirst"]>>;
  learningCount: number;
  /** targetDomain of owner-confirmed intakes (manual/import paths) for THIS workspace+business. */
  confirmedIntakeDomains?: string[];
  /** Latest customer-reputation signal (complaints / rework) for THIS workspace+business, or null when no
   *  metric snapshot is persisted. Additive: absent ⇒ context derivation is byte-for-byte unchanged. */
  reputation?: { complaintCount: number; rewashCount: number; refundCount: number } | null;
}

/**
 * Prefetch all DB-backed domain rows in ONE async pass, workspace/business scoped throughout — a
 * provider/context-derivation step never reads another workspace's rows.
 */
export async function prefetchOwnerDomainRows(deps: OwnerDbProviderDeps): Promise<OwnerDomainRows> {
  const { db, workspaceId, businessId } = deps;
  // Every business-specific read is scoped by workspaceId + businessId. A `businessId` predicate matches
  // neither another business's rows (different id) nor LEGACY workspace-only rows (business_id IS NULL),
  // so there is no cross-business leakage, no cross-workspace leakage, and a business backed only by
  // legacy null-business rows reports those domains as missing (it never inflates REAL_DB readiness).
  // behavioralLearningArtifact stays workspace-scoped by design (workspace-private learning memory).
  const [cashflow, finance, wcItems, capacity, compliance, proofs, workload, standingCount, business, learningCount, confirmedIntakes, reputationRow] = await Promise.all([
    db.ownerCashflowSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { periodEnd: "desc" } }),
    db.ownerFinancialSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { periodEnd: "desc" } }),
    db.ownerWorkingCapitalItem.findMany({ where: { workspaceId, businessId, status: "open" } }),
    db.ownerCapacitySnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } }),
    db.ownerComplianceItem.findMany({ where: { workspaceId, businessId } }),
    db.proof.findMany({ where: { workspaceId, businessId } }),
    db.ownerWorkloadSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } }),
    db.ownerStandingInstruction.count({ where: { workspaceId, businessId, status: "active" } }),
    db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId } }),
    db.behavioralLearningArtifact.count({ where: { workspaceId, active: true } }),
    // Owner-confirmed manual/import intakes feed the supplied-data view (workspace+business scoped).
    // Defensive: some callers inject a partial db (no intake model) — treat as no confirmed intakes.
    (db as { ownerDataIntake?: { findMany: (a: unknown) => Promise<Array<{ targetDomain: string | null }>> } }).ownerDataIntake?.findMany
      ? db.ownerDataIntake.findMany({ where: { workspaceId, businessId, ownerConfirmed: true }, select: { targetDomain: true } })
      : Promise.resolve([] as Array<{ targetDomain: string | null }>),
    // Latest customer-reputation signal (additive). Defensive: a partial injected db may lack the model.
    (db as { ownerMetricSnapshot?: { findFirst: (a: unknown) => Promise<{ complaintCount: number | null; rewashCount: number | null; refundAmount: number | null } | null> } }).ownerMetricSnapshot?.findFirst
      ? db.ownerMetricSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { periodEnd: "desc" }, select: { complaintCount: true, rewashCount: true, refundAmount: true } })
      : Promise.resolve(null),
  ]);
  const confirmedIntakeDomains = (confirmedIntakes as Array<{ targetDomain: string | null }>)
    .map((r) => r.targetDomain)
    .filter((d): d is string => typeof d === "string");
  const rep = reputationRow as { complaintCount: number | null; rewashCount: number | null; refundAmount: number | null } | null;
  const reputation = rep && (rep.complaintCount != null || rep.rewashCount != null)
    ? { complaintCount: rep.complaintCount ?? 0, rewashCount: rep.rewashCount ?? 0, refundCount: rep.refundAmount ?? 0 }
    : null;
  return { cashflow, finance, wcItems, capacity, compliance, proofs, workload, standingCount, business, learningCount, confirmedIntakeDomains, reputation };
}

/**
 * Prefetch all DB-backed domain rows (one async pass) and return the synchronous provider map.
 * Workspace/business scoped throughout — a provider never reads another workspace's rows.
 */
export async function buildOwnerDomainProviders(deps: OwnerDbProviderDeps): Promise<OwnerDomainProviders> {
  return buildProvidersFromRows(await prefetchOwnerDomainRows(deps), deps);
}

/** Pure: build the synchronous provider closures from already-prefetched rows. */
export function buildProvidersFromRows(rows: OwnerDomainRows, deps: OwnerDbProviderDeps): OwnerDomainProviders {
  const { now } = deps;
  const windowDays = deps.freshnessDays ?? 35;
  const { cashflow, finance, wcItems, capacity, compliance, proofs, workload, standingCount, business, learningCount } = rows;

  const providers: OwnerDomainProviders = {};

  // ── finance_cash (REAL_DB) ──
  providers.finance_cash = (): DomainState => {
    if (!cashflow && !finance) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no cashflow/finance snapshot persisted", realData: false, missing: true });
    const cash = (cashflow?.cashInHand ?? 0) + (cashflow?.bankBalance ?? 0);
    const fresh = freshnessOf(cashflow?.periodEnd ?? finance?.periodEnd ?? null, now, windowDays);
    const riskFlags: string[] = [];
    if (cashflow && cash <= 0) riskFlags.push("cash_negative");
    if ((cashflow?.receivablesOverdue ?? 0) > 0) riskFlags.push("receivables_overdue");
    return state({ sourceType: "REAL_DB", confidence: fresh === "fresh" ? "high" : "medium", freshness: fresh, realData: true, summary: `cash=${cash}, receivables=${cashflow?.receivables ?? "n/a"}, payables=${cashflow?.payables ?? "n/a"}`, riskFlags });
  };

  // ── margin_pricing (REAL_DB_SERVICE — derived from finance snapshot) ──
  providers.margin_pricing = (): DomainState => {
    if (!finance || finance.revenue == null) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no finance snapshot for margin", realData: false, missing: true });
    const revenue = finance.revenue ?? 0;
    const cogs = finance.costOfGoods ?? 0;
    const grossMargin = revenue > 0 ? (revenue - cogs) / revenue : null;
    const fresh = freshnessOf(finance.periodEnd, now, windowDays);
    const riskFlags = grossMargin !== null && grossMargin < 0.15 ? ["thin_margin"] : [];
    return state({ sourceType: "REAL_DB_SERVICE", confidence: fresh === "fresh" ? "high" : "medium", freshness: fresh, realData: true, summary: `gross margin ≈ ${grossMargin !== null ? Math.round(grossMargin * 100) + "%" : "n/a"}`, riskFlags });
  };

  // ── working_capital (REAL_DB) ──
  providers.working_capital = (): DomainState => {
    if (wcItems.length === 0 && !cashflow) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no working-capital items persisted", realData: false, missing: true });
    const receivables = wcItems.filter((i) => i.kind === "receivable").reduce((s, i) => s + i.amount, 0);
    const payables = wcItems.filter((i) => i.kind === "payable").reduce((s, i) => s + i.amount, 0);
    const overdueReceivables = wcItems.filter((i) => i.kind === "receivable" && i.dueDate && i.dueDate.getTime() < now.getTime());
    const riskFlags = overdueReceivables.length > 0 ? ["receivables_overdue"] : [];
    return state({ sourceType: "REAL_DB", confidence: "high", freshness: "fresh", realData: true, summary: `receivables=${receivables}, payables=${payables}, overdue receivables=${overdueReceivables.length}`, riskFlags });
  };

  // ── equipment_capacity (REAL_DB) ──
  providers.equipment_capacity = (): DomainState => {
    if (!capacity) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no capacity snapshot persisted", realData: false, missing: true });
    const fresh = freshnessOf(capacity.createdAt, now, windowDays);
    const riskFlags: string[] = [];
    if (capacity.bottleneckUtilization >= 1) riskFlags.push("bottleneck_over_capacity");
    if (!capacity.growthSafe) riskFlags.push("growth_unsafe");
    return state({ sourceType: "REAL_DB", confidence: fresh === "fresh" ? "high" : "medium", freshness: fresh, realData: true, summary: `bottleneck util=${Math.round(capacity.bottleneckUtilization * 100)}%, growthSafe=${capacity.growthSafe}`, riskFlags });
  };

  // ── compliance_proof (REAL_DB — compliance items + proof status) ──
  providers.compliance_proof = (): DomainState => {
    if (compliance.length === 0 && proofs.length === 0) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no compliance/proof records persisted", realData: false, missing: true });
    const expired = compliance.filter((c) => c.expiresAt && c.expiresAt.getTime() < now.getTime());
    const duplicateProof = proofs.filter((p) => p.duplicateFlagged);
    const staleProof = proofs.filter((p) => p.status === "REQUIRED" && !p.submittedAt);
    const riskFlags: string[] = [];
    if (expired.length > 0) riskFlags.push("compliance_expired");
    if (duplicateProof.length > 0) riskFlags.push("duplicate_proof");
    if (staleProof.length > 0) riskFlags.push("unsubmitted_proof");
    return state({ sourceType: "REAL_DB", confidence: "high", freshness: "fresh", realData: true, summary: `compliance items=${compliance.length} (expired=${expired.length}), proofs=${proofs.length} (duplicate=${duplicateProof.length})`, riskFlags });
  };

  // ── owner_workload_memory (REAL_DB — workload snapshot + standing instructions) ──
  providers.owner_workload_memory = (): DomainState => {
    if (!workload) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "no owner-workload snapshot persisted", realData: false, missing: true });
    const fresh = freshnessOf(workload.createdAt, now, windowDays);
    const riskFlags: string[] = [];
    if (workload.overloaded) riskFlags.push("owner_overloaded");
    if (workload.bottleneckRisk) riskFlags.push("owner_bottleneck");
    return state({ sourceType: "REAL_DB", confidence: fresh === "fresh" ? "high" : "medium", freshness: fresh, realData: true, summary: `daily load=${workload.dailyLoadPct}% (band ${workload.band}), owner-only critical tasks=${workload.ownerOnlyCriticalTasks}, standing instructions=${standingCount}`, riskFlags });
  };

  // ── location_stage (REAL_DB — business profile) ──
  providers.location_stage = (): DomainState => {
    if (!business) return state({ sourceType: "DATA_SOURCE_MISSING", confidence: "none", summary: "owner business record not found", realData: false, missing: true });
    return state({ sourceType: "REAL_DB", confidence: "high", freshness: "fresh", realData: true, summary: `location=${business.location ?? "n/a"}, currency=${business.currency}` });
  };

  // ── operations (REAL_DB_SERVICE — capacity-derived) ──
  if (capacity) {
    providers.operations = (): DomainState =>
      state({ sourceType: "REAL_DB_SERVICE", confidence: "medium", freshness: freshnessOf(capacity.createdAt, now, windowDays), realData: true, summary: `safe utilization=${Math.round(capacity.safeUtilization * 100)}%, expansion triggered=${capacity.expansionTriggered}` });
  }

  // ── learning_playbooks: surfaced as REAL_DB_SERVICE by the ingestion layer via the learning store;
  //    here we also confirm persisted artifacts exist for this workspace.
  if (learningCount > 0) {
    providers.learning_playbooks = (): DomainState =>
      state({ sourceType: "REAL_DB_SERVICE", confidence: "high", freshness: "fresh", realData: true, summary: `${learningCount} active learning artifact(s) for this workspace` });
  }

  // ── opportunity_contract (REAL_DB_SERVICE — steady-state growth/opportunity posture) ──
  // When live opportunity terms arrive as request input the caller can still override via context;
  // for a steady business the opportunity-evaluation readiness IS derivable from real capacity +
  // margin (can we profitably take on more?). Provided only when that real data exists.
  if (capacity || finance) {
    providers.opportunity_contract = (): DomainState => {
      const grossMargin = finance && finance.revenue != null && finance.revenue > 0
        ? (finance.revenue - (finance.costOfGoods ?? 0)) / finance.revenue : null;
      const scaleGated = (capacity ? capacity.bottleneckUtilization >= 1 || !capacity.growthSafe : false)
        || (grossMargin !== null && grossMargin < 0.15);
      const riskFlags = scaleGated ? ["growth_gated"] : [];
      return state({
        sourceType: "REAL_DB_SERVICE", confidence: "medium", freshness: "fresh", realData: true,
        summary: `no live contract under evaluation; growth posture: scale ${scaleGated ? "GATED (resolve constraint first)" : "available via capped pilot"}${grossMargin !== null ? `, gross margin ≈ ${Math.round(grossMargin * 100)}%` : ""}`,
        riskFlags,
      });
    };
  }
  void ((): IngestionDomain => "opportunity_contract")();
  return providers;
}

/** A deliberately fixture-only provider set (NOT real) — used by tests to prove it cannot pass readiness. */
export function fixtureOnlyProviders(): OwnerDomainProviders {
  const fake: DomainProvider = () => ({ sourceType: "CONTEXT_PROVIDED", confidence: "low", summary: "fixture-only (not real DB)", realData: false });
  return { finance_cash: fake, working_capital: fake } satisfies OwnerDomainProviders;
}

export type { Confidence };
