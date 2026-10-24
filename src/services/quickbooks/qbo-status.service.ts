/**
 * QuickBooks Online V1 — owner-readable status (bounded; never tokens, provider bodies, raw errors or other tenants' data).
 *
 * Everything is read from persisted facts for ONE workspace + business: the connection row, its sync state, and the provenance
 * of the current canonical snapshots. Server configuration is reported only as available/unavailable and the deployment's
 * environment name.
 */
import { db } from "@/lib/db";
import { resolveQboConfig, type QboEnvironment } from "@/domain/quickbooks/qbo-config";
import { QBO_V1_DEFAULT_BASIS, QBO_BASELINE_MONTHS, closedMonths, toIsoDate, type QboAccountingBasis, type QboFreshness } from "@/domain/quickbooks/qbo-report-model";
import { QBO_REFUSAL_OWNER_TEXT, QBO_MATERIALIZATION_REFUSALS, type QboMaterializationRefusal } from "@/domain/quickbooks/qbo-derivation";
import { QBO_STALE_NOTICE, deriveQboOwnerState, ownerActionsFor, ownerFailureText, type QboOwnerState } from "@/domain/quickbooks/qbo-owner-status";
import { assertBusinessInWorkspace, BusinessScopeError } from "@/services/owner-mode/business-scope";
import { NotFoundError } from "@/infra/errors";
import { listFinancialSnapshotPeriodSources } from "@/services/owner-finance/snapshot.service";
import { listCashflowSnapshotPeriodStamps } from "@/services/owner-cashflow/snapshot.service";

export type PeriodSource = "QUICKBOOKS" | "MANUAL";

export interface QboOwnerStatus {
  /** False when the server has no (valid) QuickBooks configuration — Connect must not be offered. */
  available: boolean;
  environment: QboEnvironment | null;
  state: QboOwnerState;
  freshness: QboFreshness;
  companyName: string | null;
  connectedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  accountingBasis: QboAccountingBasis;
  /** Closed months still to import during the first import; null when not importing. */
  monthsRemaining: number | null;
  failure: string | null;
  staleNotice: string | null;
  actions: { connect: boolean; reconnect: boolean; disconnect: boolean; refresh: boolean };
  /** Source of each of the most recent closed months' CURRENT canonical figures. */
  periods: Array<{ periodStart: string; periodEnd: string; finance: PeriodSource | null; cashflow: PeriodSource | null }>;
  /** Months last left untouched because the owner entered or changed them. */
  ownerControlledMonths: number;
  /** Owner-safe reasons months were not filled from QuickBooks on the last run (bounded wording, never provider detail). */
  notices: string[];
}

const PERIOD_LIMIT = QBO_BASELINE_MONTHS;

export async function getQboOwnerStatus(
  input: { workspaceId: string; businessId: string },
  deps: { env: Record<string, string | undefined>; now?: () => Date; client?: typeof db },
): Promise<QboOwnerStatus> {
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  try {
    await assertBusinessInWorkspace(client as never, input.workspaceId, input.businessId);
  } catch (e) {
    if (e instanceof BusinessScopeError) throw new NotFoundError("OwnerBusiness", input.businessId);
    throw e;
  }
  const cfg = resolveQboConfig(deps.env);
  const deploymentEnv = cfg.available ? cfg.config.environment : null;

  // The live connection (if any) of this deployment's environment, else the most recent one (a disconnected company).
  const rows = await client.qboConnection.findMany({
    where: { workspaceId: input.workspaceId, businessId: input.businessId, ...(deploymentEnv ? { environment: deploymentEnv } : {}) },
    include: { syncState: true },
    orderBy: { connectedAt: "desc" },
  });
  const conn = rows.find((r: { status: string }) => r.status !== "DISCONNECTED") ?? rows[0] ?? null;
  const sync = conn?.syncState ?? null;

  const { state, freshness } = deriveQboOwnerState({
    connection: conn ? { status: conn.status as "ACTIVE" | "REAUTH_REQUIRED" | "ERROR" | "DISCONNECTED" } : null,
    sync: sync ? { lifecycle: sync.lifecycle as "NEVER_SYNCED" | "BASELINING" | "SYNCED" | "FAILING", lastSuccessAt: sync.lastSuccessAt, lastErrorCode: sync.lastErrorCode, consecutiveFailures: sync.consecutiveFailures } : null,
    now,
  });

  let monthsRemaining: number | null = null;
  if (state === "IMPORTING" && sync) {
    const window = closedMonths(now, QBO_BASELINE_MONTHS);
    const cursor = sync.baselineCursor ? toIsoDate(sync.baselineCursor) : window[0].start;
    monthsRemaining = window.filter((m) => m.start <= cursor).length;
  }

  const periods = conn ? await periodSources(client, input.workspaceId, input.businessId, now) : [];
  const summary = (sync?.lastRunSummary ?? null) as { ownerControlled?: number; refusals?: Record<string, number> } | null;
  const notices = Object.keys(summary?.refusals ?? {})
    .filter((k): k is QboMaterializationRefusal => (QBO_MATERIALIZATION_REFUSALS as readonly string[]).includes(k))
    .map((k) => QBO_REFUSAL_OWNER_TEXT[k]);
  const actions = ownerActionsFor(state);

  return {
    available: cfg.available,
    environment: deploymentEnv,
    state,
    freshness,
    companyName: sync?.companyName ?? null,
    connectedAt: conn ? conn.connectedAt.toISOString() : null,
    lastAttemptAt: sync?.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: sync?.lastSuccessAt?.toISOString() ?? null,
    accountingBasis: QBO_V1_DEFAULT_BASIS,
    monthsRemaining,
    failure: state === "SYNC_ERROR" || state === "REAUTH_REQUIRED" ? ownerFailureText(state === "REAUTH_REQUIRED" ? "REAUTH_REQUIRED" : sync?.lastErrorCode ?? null) : null,
    staleNotice: state === "STALE" ? QBO_STALE_NOTICE : null,
    actions: { ...actions, connect: actions.connect && cfg.available, reconnect: actions.reconnect && cfg.available },
    periods,
    notices: state === "CONNECTED" || state === "STALE" || state === "IMPORTING" ? notices : [],
    ownerControlledMonths: typeof summary?.ownerControlled === "number" ? summary.ownerControlled : 0,
  };
}

/**
 * Where each recent month's CURRENT canonical figures came from. A Finance snapshot is QuickBooks-sourced iff its current
 * version has provenance; a Cashflow row iff its latest provenance stamp still equals the row's updatedAt (any later write
 * is the owner's). Pure reads, scoped by workspace + business.
 */
export async function periodSources(client: typeof db, workspaceId: string, businessId: string, now: Date) {
  const months = closedMonths(now, PERIOD_LIMIT);
  // Through the Finance / Cashflow model services (the only readers of those tables); each Finance row carries `source`.
  const since = new Date(`${months[months.length - 1].start}T00:00:00.000Z`);
  const [fin, cash] = await Promise.all([listFinancialSnapshotPeriodSources(workspaceId, businessId, since), listCashflowSnapshotPeriodStamps(workspaceId, businessId, since)]);
  const cashProv = await client.qboCanonicalProvenance.findMany({
    where: { workspaceId, businessId, cashflowSnapshotId: { in: cash.map((c) => c.id) } },
    orderBy: { materializedAt: "desc" },
    select: { cashflowSnapshotId: true, targetUpdatedAt: true },
  });
  const latestStamp = new Map<string, number | null>();
  for (const p of cashProv as Array<{ cashflowSnapshotId: string | null; targetUpdatedAt: Date | null }>) {
    if (p.cashflowSnapshotId && !latestStamp.has(p.cashflowSnapshotId)) latestStamp.set(p.cashflowSnapshotId, p.targetUpdatedAt ? p.targetUpdatedAt.getTime() : null);
  }
  return months.map((m) => {
    const f = fin.find((x: { periodStart: Date; periodEnd: Date }) => toIsoDate(x.periodStart) === m.start && toIsoDate(x.periodEnd) === m.end);
    const c = cash.find((x) => toIsoDate(x.periodStart) === m.start && toIsoDate(x.periodEnd) === m.end);
    return {
      periodStart: m.start,
      periodEnd: m.end,
      finance: f ? f.source : null,
      cashflow: c ? (latestStamp.get(c.id) === c.updatedAt.getTime() ? ("QUICKBOOKS" as const) : ("MANUAL" as const)) : null,
    };
  });
}
