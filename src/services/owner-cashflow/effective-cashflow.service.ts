/**
 * The ONE reader of "which Cashflow row is the current / effective one" (workspace + business scoped).
 *
 * A Cashflow period is unique per (business, periodStart, periodEnd), so several rows can share a `periodEnd`
 * (different `periodStart`). The domain rule that resolves such a tie lives in `@/domain/owner-finance/liquidity`
 * (`compareCashflowRows` / `pickEffectiveCashflowRow`): this file only fetches the candidate rows and applies it,
 * so the first read, the improve flow, Finance's bank-balance enrichment, the Now view's cash reading, the
 * re-diagnosis target and the staleness check can never disagree about which row is "current".
 *
 * The candidate set is every row of the winning `periodEnd`. It is fetched in one query ordered by `periodEnd`
 * (the common case is a single row); only a saturated page — every fetched row sharing the top `periodEnd`, so
 * more of that tie may exist — is widened by a second, exact query. Unbounded ties are therefore never cut off.
 */
import { db as sharedDb } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  pickEffectiveCashflowRow,
  pickLatestCashflowRow,
  type CashflowSelectionRow,
} from "@/domain/owner-finance/liquidity";

/** First-page size: far above any realistic tie, so the second query is an exception. */
const TIE_PAGE = 25;

/** Full persisted row (every column) — the consumers differ only in which columns they read. */
type CashflowRow = NonNullable<Awaited<ReturnType<PrismaClient["ownerCashflowSnapshot"]["findFirst"]>>>;

/** Any client that can list Cashflow rows: the shared client, an injected one, or a transaction. */
export interface CashflowReadClient {
  ownerCashflowSnapshot: Pick<PrismaClient["ownerCashflowSnapshot"], "findMany">;
}
const defaultClient = (): CashflowReadClient => sharedDb as unknown as CashflowReadClient;

export type { CashflowRow };

const scopeOf = (workspaceId: string, businessId: string) => ({ workspaceId, businessId });

function sameMs(a: Date | string, b: Date | string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Every candidate row of the greatest `periodEnd` at or before `asOf` (the tie set; empty when none).
 * `asOf: null` means no upper bound on `periodEnd`. `startedBy` additionally requires `periodStart <= startedBy`
 * (the Cashflow dashboard's "has started" view).
 */
export async function loadEffectiveCashflowCandidates(
  workspaceId: string,
  businessId: string,
  asOf: Date | string | null,
  opts: { startedBy?: Date; client?: CashflowReadClient } = {}
): Promise<CashflowRow[]> {
  const client = opts.client ?? defaultClient();
  const end = asOf === null ? null : asOf instanceof Date ? asOf : new Date(asOf);
  if (end !== null && Number.isNaN(end.getTime())) return [];
  const where = {
    ...scopeOf(workspaceId, businessId),
    ...(end ? { periodEnd: { lte: end } } : {}),
    ...(opts.startedBy ? { periodStart: { lte: opts.startedBy } } : {}),
  };
  const page = (await client.ownerCashflowSnapshot.findMany({
    where,
    orderBy: [{ periodEnd: "desc" }, { updatedAt: "desc" }, { periodStart: "desc" }, { id: "desc" }],
    take: TIE_PAGE,
  })) as CashflowRow[];
  if (page.length === 0) return [];
  const top = page[0].periodEnd;
  const tie = page.filter((r) => sameMs(r.periodEnd, top));
  if (page.length < TIE_PAGE || tie.length < page.length) return tie;
  // The whole page is one periodEnd: the tie may be longer than the page, so take it exactly.
  return (await client.ownerCashflowSnapshot.findMany({
    where: { ...where, periodEnd: top },
    orderBy: [{ updatedAt: "desc" }, { periodStart: "desc" }, { id: "desc" }],
  })) as CashflowRow[];
}

/** The effective Cashflow row for a Finance period ending at `financePeriodEnd` (null when none qualifies). */
export async function loadEffectiveCashflowRow(
  workspaceId: string,
  businessId: string,
  financePeriodEnd: Date | string,
  client?: CashflowReadClient
): Promise<CashflowRow | null> {
  const candidates = await loadEffectiveCashflowCandidates(workspaceId, businessId, financePeriodEnd, { client });
  return pickEffectiveCashflowRow(candidates as CashflowSelectionRow[], financePeriodEnd) as CashflowRow | null;
}

/**
 * The latest Cashflow row that has STARTED by `now` (its period may still be in progress) — the Cashflow module's own
 * diagnosable snapshot. Same tie rule as the effective row; only the candidate window differs.
 */
export async function loadLatestStartedCashflowRow(
  workspaceId: string,
  businessId: string,
  now: Date,
  client?: CashflowReadClient
): Promise<CashflowRow | null> {
  // No upper bound on periodEnd: a started, still-in-progress period is the latest.
  const candidates = await loadEffectiveCashflowCandidates(workspaceId, businessId, null, { startedBy: now, client });
  return pickLatestCashflowRow(candidates as CashflowSelectionRow[]) as CashflowRow | null;
}

/** Id of the effective row at or before `asOf` — the target of a Cashflow re-diagnosis. */
export async function loadEffectiveCashflowSnapshotId(
  workspaceId: string,
  businessId: string,
  asOf: Date,
  client?: CashflowReadClient
): Promise<string | null> {
  return (await loadEffectiveCashflowRow(workspaceId, businessId, asOf, client))?.id ?? null;
}

/**
 * Serialises "decide on the cash position" against "change the cash position" for one business. Cashflow creates and
 * edits take it EXCLUSIVELY; a decision that must not rest on a balance that just changed (accepting a read) takes it
 * SHARED. Transaction-scoped: released on commit/rollback. A row lock alone cannot do this, because a NEW row (which
 * can win the selection) is not a row anybody could have locked.
 */
function cashPositionLockKey(businessId: string): string {
  return `owner_cash_position:${businessId}`;
}

type LockClient = { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> };

export async function lockCashPositionExclusive(tx: LockClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cashPositionLockKey(businessId)}))`;
}

export async function lockCashPositionShared(tx: LockClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${cashPositionLockKey(businessId)}))`;
}

/**
 * The DATABASE clock, read inside a transaction (UTC, millisecond precision like the columns). Every ordering that decides
 * "did the cash position change after this read was made" uses this clock on BOTH sides (Cashflow create/edit stamps and the
 * diagnosis' evidence stamp), never an application server's clock, so skew between serverless instances cannot reorder them.
 */
export async function databaseNow(tx: { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }): Promise<Date> {
  const rows = (await tx.$queryRaw`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS now`) as Array<{ now: Date }>;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("The database clock could not be read.");
  return new Date(Math.floor(now.getTime()));
}
