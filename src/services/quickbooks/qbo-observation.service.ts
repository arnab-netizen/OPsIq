/**
 * QuickBooks Online V1 — versioned report observations (qbo_report_snapshots).
 *
 * An observation is the minimized, parsed result of ONE report read for ONE identity
 * (connection, report type, period, accounting basis). It answers, later, "why did January change from X to Y?":
 *   - an unchanged re-read does NOT create a row; it only advances the confirmation counters (the sole mutable columns,
 *     enforced by a database trigger);
 *   - a changed re-read appends version N+1; version N is kept forever (the trigger also forbids deleting evidence).
 * Only allowlisted totals are stored (see qbo-report-parser) — never the provider body, never customer rows.
 */
import { createHash, randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { canonicalObservationJson, type QboParsedReport } from "@/domain/quickbooks/qbo-report-parser";
import {
  QBO_PARSER_VERSION,
  fromIsoDate,
  toIsoDate,
  type QboAccountingBasis,
  type QboReportType,
} from "@/domain/quickbooks/qbo-report-model";
import type { MonthObservations, QboObservationView } from "@/domain/quickbooks/qbo-derivation";
import type { MonthPeriod } from "@/domain/quickbooks/qbo-report-model";

type Tx = Prisma.TransactionClient;

export interface QboConnectionIdentity {
  id: string;
  workspaceId: string;
  businessId: string;
  environment: "sandbox" | "production";
  realmId: string;
}

export interface RecordObservationInput {
  connection: QboConnectionIdentity;
  parsed: QboParsedReport;
  requestedBasis: QboAccountingBasis;
  providerTid: string | null;
  now: Date;
}

export interface RecordObservationResult {
  id: string;
  version: number;
  outcome: "CREATED" | "CONFIRMED";
  /** Version this one replaced (the "from" of "why did it change"); null for a first observation or a confirmation. */
  previousVersion: number | null;
}

/** Record (or confirm) an observation. Runs on the caller's transaction so a month's four reads can commit together. */
export async function recordQboObservation(tx: Tx, input: RecordObservationInput): Promise<RecordObservationResult> {
  const { connection: c, parsed, now } = input;
  const basis: QboAccountingBasis = parsed.basis ?? input.requestedBasis;
  const basisSource = parsed.basis ? "REPORT_HEADER" : "REQUESTED";
  const contentHash = createHash("sha256")
    .update(canonicalObservationJson({ ...parsed, basis }, QBO_PARSER_VERSION))
    .digest("hex");
  const periodStart = fromIsoDate(parsed.periodStart);
  const periodEnd = fromIsoDate(parsed.periodEnd);

  // Two concurrent syncs of one identity (cannot normally happen: one sync per connection) still serialise here.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`qbo_observation:${c.id}:${parsed.reportType}:${parsed.periodStart}:${parsed.periodEnd}:${basis}`}, 0))`;

  const identity = { connectionId: c.id, workspaceId: c.workspaceId, reportType: parsed.reportType, periodStart, periodEnd, accountingBasis: basis };
  const latest = await tx.qboReportSnapshot.findFirst({ where: identity, orderBy: { version: "desc" }, select: { id: true, version: true, contentHash: true } });

  if (latest && latest.contentHash === contentHash) {
    await tx.qboReportSnapshot.update({
      where: { id: latest.id },
      data: { lastConfirmedAt: now, confirmCount: { increment: 1 } },
    });
    return { id: latest.id, version: latest.version, outcome: "CONFIRMED", previousVersion: null };
  }

  const version = (latest?.version ?? 0) + 1;
  const row = await tx.qboReportSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId: c.workspaceId,
      businessId: c.businessId,
      connectionId: c.id,
      environment: c.environment,
      realmId: c.realmId,
      reportType: parsed.reportType,
      periodStart,
      periodEnd,
      accountingBasis: basis,
      basisSource,
      currency: parsed.currency,
      version,
      contentHash,
      parserVersion: QBO_PARSER_VERSION,
      noReportData: parsed.noReportData,
      values: { v: parsed.values, buckets: parsed.buckets } as unknown as Prisma.InputJsonValue,
      providerTid: input.providerTid,
      acquiredAt: now,
      lastConfirmedAt: now,
      confirmCount: 0,
    },
    select: { id: true, version: true },
  });
  return { id: row.id, version: row.version, outcome: "CREATED", previousVersion: latest ? latest.version : null };
}

type ObservationRow = {
  id: string; reportType: string; periodStart: Date; periodEnd: Date; accountingBasis: string; currency: string | null;
  noReportData: boolean; values: unknown; version: number;
};

export function toObservationView(r: ObservationRow): QboObservationView {
  const json = (r.values ?? {}) as { v?: Record<string, number | null> };
  return {
    id: r.id,
    reportType: r.reportType as QboReportType,
    periodStart: toIsoDate(r.periodStart),
    periodEnd: toIsoDate(r.periodEnd),
    basis: r.accountingBasis as QboAccountingBasis,
    currency: r.currency,
    noReportData: r.noReportData,
    values: json.v ?? {},
    version: r.version,
  };
}

/**
 * The CURRENT observation (most recently acquired, then highest version) of each of the four reports for one closed month,
 * scoped by workspace + connection. Whatever basis the latest read carried is returned as-is: a basis disagreement between
 * reports is detected by deriveMonthlyFigures (BASIS_MISMATCH), never papered over here.
 */
export async function loadMonthObservations(
  client: Pick<Tx, "qboReportSnapshot">,
  scope: { workspaceId: string; connectionId: string },
  month: MonthPeriod,
): Promise<MonthObservations> {
  const start = fromIsoDate(month.start);
  const end = fromIsoDate(month.end);
  const pick = async (reportType: QboReportType, periodStart: Date) => {
    const row = await client.qboReportSnapshot.findFirst({
      where: { workspaceId: scope.workspaceId, connectionId: scope.connectionId, reportType, periodStart, periodEnd: end },
      orderBy: [{ acquiredAt: "desc" }, { version: "desc" }],
    });
    return row ? toObservationView(row as unknown as ObservationRow) : null;
  };
  const [pl, bs, ar, ap] = await Promise.all([
    pick("PROFIT_AND_LOSS", start),
    pick("BALANCE_SHEET", end),
    pick("AGED_RECEIVABLES", end),
    pick("AGED_PAYABLES", end),
  ]);
  return { pl, bs, ar, ap };
}
