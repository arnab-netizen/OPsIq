/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows are untyped by design */
/**
 * QuickBooks Online / Intuit User Data — GOVERNED PRIVACY ERASURE.
 *
 * Intuit Developer Terms: cease processing on revocation and, at the user's request (subject to legally required recordkeeping),
 * securely delete User Data. OpsIQ's QBO evidence tables are append-only on purpose; this module is the ONLY path that may remove
 * that evidence, and it is an operator tool — NO HTTP route and NO application code imports it.
 *
 * SECURITY BOUNDARY (all of it enforced in the database, see migration 20261025090000_qbo_governed_privacy_erasure):
 *   - the session user must be a member of role `opsiq_privacy_eraser`;
 *   - a privacy_erasure_requests row must be APPROVED by a second operator against the recorded dry-run manifest hash;
 *   - the erasing transaction flips it to EXECUTING and names it in `opsiq.erasure_request_id` (transaction-local);
 *   - the guard triggers then permit DELETE only on rows of exactly that workspace + business. Nothing else changes.
 *
 * Everything runs in ONE transaction: the deletions, the post-erasure verification and the tombstone. Any failure (a foreign key, a
 * drifted manifest, a failed verification) rolls the whole erasure back — it never half-erases.
 *
 * This module never logs, returns or stores a realm id, company name, report value or token. Counts and opaque ids only.
 */
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import {
  CASHFLOW_OWNER_NUMERIC_COLUMNS,
  CASHFLOW_QBO_COLUMNS,
  FINANCE_OWNER_NUMERIC_COLUMNS,
  FINANCE_QBO_COLUMNS,
  QBO_IMPORT_NOTE,
  classifyCashflowRow,
  classifyFinanceChain,
  type CashflowRowPlan,
  type FinanceChainPlan,
} from "./qbo-erasure-classify";

export type Sql = Pick<ClientBase, "query">;
export interface ErasureScope { workspaceId: string; businessId: string }

export const ERASURE_ROLE = "opsiq_privacy_eraser";
export const ERASURE_REASON_CODES = ["USER_DATA_ERASURE_REQUEST", "USER_REVOKED_CONSENT"] as const;
export type ErasureReasonCode = (typeof ERASURE_REASON_CODES)[number];

export class ErasureRefusedError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "ErasureRefusedError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (v: string, what: string) => { if (!UUID_RE.test(v)) throw new ErasureRefusedError("INVALID_ID", `${what} must be a UUID`); };

async function rows<T = Record<string, any>>(c: Sql, text: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(text, params as any[])).rows as T[];
}
async function ids(c: Sql, text: string, params: unknown[] = []): Promise<string[]> {
  return (await rows<{ id: string }>(c, text, params)).map((r) => String(r.id));
}
async function num(c: Sql, text: string, params: unknown[] = []): Promise<number> {
  const r = await rows<{ n: string | number }>(c, text, params);
  return Number(r[0]?.n ?? 0);
}
const uniq = (a: readonly string[]) => [...new Set(a)];
const sorted = (a: readonly string[]) => [...a].sort();

/** Tables this module deletes from / scrubs explicitly. A residue hit in any OTHER table is a BLOCKER (fail closed). */
export const HANDLED_TABLES: ReadonlySet<string> = new Set([
  "qbo_connections", "qbo_connection_tokens", "qbo_resource_locks", "qbo_sync_state", "qbo_oauth_states", "qbo_report_snapshots", "qbo_canonical_provenance",
  "owner_financial_snapshots", "owner_cashflow_snapshots",
  "owner_finance_cycles", "owner_finance_findings", "owner_finance_actions", "owner_finance_verifications", "owner_finance_outcome_signals",
  "owner_cashflow_cycles", "owner_cashflow_findings", "owner_cashflow_actions", "owner_cashflow_verifications",
  "owner_decision_records", "owner_outcome_assessments", "owner_action_assignments", "owner_approval_requests", "owner_approval_evidences",
  "owner_self_evaluation", "owner_action_outcomes", "controlled_learning_candidates", "operating_memory_entries", "owner_first_result_interactions",
  "scheduled_tasks", "audit_events", "privacy_erasure_requests",
]);

interface IdSets {
  connections: string[]; reportSnapshots: string[]; provenance: string[];
  financeAffected: string[]; financeDelete: string[]; cashflowAffected: string[]; cashflowDelete: string[];
  financeCycles: string[]; financeActions: string[]; financeVerifications: string[]; financeSignals: string[];
  cashflowCycles: string[]; cashflowActions: string[]; cashflowVerifications: string[];
  decisions: string[]; candidateKeys: string[]; assessments: string[]; pointerAssessments: string[];
  assignments: string[]; approvals: string[]; approvalEvidence: string[]; selfEvals: string[]; actionOutcomes: string[];
  learningCandidates: string[]; operatingMemory: string[]; firstResult: string[]; scheduledTasks: string[];
}

export interface Blocker { code: string; detail: string }
interface RetainedExpectation { table: "owner_financial_snapshots" | "owner_cashflow_snapshots"; id: string; keep: Record<string, number | null>; nulled: string[] }

export interface PlanInternals {
  connections: Array<{ id: string; environment: string; status: string }>;
  /** Realm ids + company names found for this business. NEVER printed, hashed or persisted. */
  needles: string[];
  ids: IdSets;
  finance: Array<{ plan: FinanceChainPlan; currentRow: Record<string, any> | null }>;
  cashflow: Array<{ plan: CashflowRowPlan; row: Record<string, any> }>;
  retained: RetainedExpectation[];
  learningChildTables: string[];
}

export interface ErasurePlan {
  scope: ErasureScope;
  counts: Record<string, number>;
  canonical: {
    financeChainsDeleted: number; financeChainsScrubbed: number; financeVersionsDeleted: number; financeFieldsNulled: number;
    cashflowRowsDeleted: number; cashflowRowsScrubbed: number; cashflowFieldsNulled: number; retainedOwnerRows: number;
  };
  blockers: Blocker[];
  manifestHash: string;
  internal: PlanInternals;
}

/* ───────────────────────────── planning (read-only) ───────────────────────────── */

const FIN_COLS = [...FINANCE_QBO_COLUMNS, ...FINANCE_OWNER_NUMERIC_COLUMNS];
const CF_COLS = [...CASHFLOW_QBO_COLUMNS, ...CASHFLOW_OWNER_NUMERIC_COLUMNS];

export async function planQboErasure(c: Sql, scope: ErasureScope): Promise<ErasurePlan> {
  assertUuid(scope.workspaceId, "workspaceId");
  assertUuid(scope.businessId, "businessId");
  const ws = scope.workspaceId;
  const biz = scope.businessId;
  const blockers: Blocker[] = [];

  // ── QBO tables
  const connections = await rows<{ id: string; environment: string; status: string; realm_id: string }>(
    c, `SELECT id, environment, status, realm_id FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2 ORDER BY id`, [ws, biz]);
  const connIds = connections.map((r) => r.id);
  const names = await rows<{ company_name: string | null }>(c, `SELECT company_name FROM qbo_sync_state WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]);
  const needles = uniq([
    ...connections.map((r) => r.realm_id),
    ...names.map((r) => (r.company_name ?? "").trim()).filter((n) => n.length >= 3),
  ].filter((n) => n.length > 0));
  const reportSnapshots = await ids(c, `SELECT id FROM qbo_report_snapshots WHERE workspace_id = $1 AND business_id = $2 ORDER BY id`, [ws, biz]);
  const provenance = await ids(c, `SELECT id FROM qbo_canonical_provenance WHERE workspace_id = $1 AND business_id = $2 ORDER BY id`, [ws, biz]);
  const tokens = await num(c, `SELECT count(*)::int AS n FROM qbo_connection_tokens WHERE workspace_id = $1 AND connection_id = ANY($2::uuid[])`, [ws, connIds]);
  const locks = await num(c, `SELECT count(*)::int AS n FROM qbo_resource_locks WHERE workspace_id = $1 AND connection_id = ANY($2::uuid[])`, [ws, connIds]);
  const syncStates = await num(c, `SELECT count(*)::int AS n FROM qbo_sync_state WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]);
  const oauthStates = await num(c, `SELECT count(*)::int AS n FROM qbo_oauth_states WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]);

  // ── Finance: affected periods -> every version of each chain
  const finance: PlanInternals["finance"] = [];
  const retained: RetainedExpectation[] = [];
  const financeAffected: string[] = [];
  const financeDelete: string[] = [];
  const periods = await rows<{ period_start: Date; period_end: Date }>(
    c,
    `SELECT DISTINCT s.period_start, s.period_end
       FROM qbo_canonical_provenance p JOIN owner_financial_snapshots s ON s.id = p.financial_snapshot_id
      WHERE p.workspace_id = $1 AND p.business_id = $2 AND p.target_type = 'FINANCIAL_SNAPSHOT'
      ORDER BY s.period_start, s.period_end`,
    [ws, biz],
  );
  for (const per of periods) {
    const versions = await rows<Record<string, any>>(
      c, `SELECT * FROM owner_financial_snapshots WHERE workspace_id = $1 AND business_id = $2 AND period_start = $3 AND period_end = $4 ORDER BY version`,
      [ws, biz, per.period_start, per.period_end]);
    const withProv = new Set(await ids(c, `SELECT DISTINCT financial_snapshot_id AS id FROM qbo_canonical_provenance WHERE workspace_id = $1 AND financial_snapshot_id = ANY($2::uuid[])`, [ws, versions.map((v) => v.id)]));
    const plan = classifyFinanceChain(versions.map((v) => ({
      id: v.id, version: v.version, supersededById: v.superseded_by_id ?? null, changedFields: v.changed_fields,
      values: Object.fromEntries(FIN_COLS.map((k) => [k, v[k] === null || v[k] === undefined ? null : Number(v[k])])),
      notes: v.notes ?? null, hasProvenance: withProv.has(v.id),
    })));
    if (plan.mode === "ANOMALY") {
      blockers.push({ code: `FINANCE_CHAIN_${plan.code}`, detail: `period ${new Date(per.period_start).toISOString().slice(0, 10)}: ${plan.versionIds.length} version(s) need manual review` });
      financeAffected.push(...versions.map((v) => v.id));
      finance.push({ plan, currentRow: null });
      continue;
    }
    financeAffected.push(...versions.map((v) => v.id));
    const currentRow = versions.find((v) => v.id === plan.currentId) ?? null;
    if (plan.mode === "DELETE_CHAIN") financeDelete.push(...plan.deleteVersionIds);
    else {
      financeDelete.push(...plan.deleteVersionIds, ...(plan.deleteCurrent ? [plan.currentId] : []));
      if (!plan.deleteCurrent && currentRow) {
        retained.push({
          table: "owner_financial_snapshots", id: plan.currentId,
          keep: Object.fromEntries(plan.retainedOwnerColumns.map((k) => [k, currentRow[k] === null ? null : Number(currentRow[k])])),
          nulled: [...plan.nullColumns],
        });
      }
    }
    finance.push({ plan, currentRow });
  }

  // ── Cashflow
  const cashflow: PlanInternals["cashflow"] = [];
  const cashflowAffected: string[] = [];
  const cashflowDelete: string[] = [];
  const cfRows = await rows<Record<string, any>>(
    c,
    `SELECT s.*, (SELECT p2.target_updated_at FROM qbo_canonical_provenance p2 WHERE p2.cashflow_snapshot_id = s.id ORDER BY p2.materialized_at DESC, p2.id DESC LIMIT 1) AS latest_stamp
       FROM owner_cashflow_snapshots s
      WHERE s.workspace_id = $1 AND s.business_id = $2
        AND s.id IN (SELECT cashflow_snapshot_id FROM qbo_canonical_provenance WHERE workspace_id = $1 AND business_id = $2 AND cashflow_snapshot_id IS NOT NULL)
      ORDER BY s.period_start`,
    [ws, biz],
  );
  for (const r of cfRows) {
    const plan = classifyCashflowRow({
      id: r.id, updatedAtMs: new Date(r.updated_at).getTime(), latestStampMs: r.latest_stamp ? new Date(r.latest_stamp).getTime() : null,
      values: Object.fromEntries(CF_COLS.map((k) => [k, r[k] === null || r[k] === undefined ? null : Number(r[k])])), notes: r.notes ?? null,
    });
    cashflowAffected.push(r.id);
    if (plan.mode === "DELETE_ROW" || plan.deleteRow) cashflowDelete.push(r.id);
    else if (plan.mode === "SCRUB_ROW") {
      retained.push({ table: "owner_cashflow_snapshots", id: r.id, keep: Object.fromEntries(plan.retainedOwnerColumns.map((k) => [k, r[k] === null ? null : Number(r[k])])), nulled: [...plan.nullColumns] });
    }
    cashflow.push({ plan, row: r });
  }

  // ── Derived diagnosis family (anything computed from the affected snapshots)
  const financeCycles = await ids(c, `SELECT id FROM owner_finance_cycles WHERE workspace_id = $1 AND business_id = $2 AND snapshot_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, financeAffected]);
  const financeActions = await ids(c, `SELECT id FROM owner_finance_actions WHERE workspace_id = $1 AND business_id = $2 AND cycle_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, financeCycles]);
  const financeFindings = await ids(c, `SELECT id FROM owner_finance_findings WHERE workspace_id = $1 AND business_id = $2 AND cycle_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, financeCycles]);
  const financeVerifications = await ids(c, `SELECT id FROM owner_finance_verifications WHERE workspace_id = $1 AND business_id = $2 AND action_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, financeActions]);
  const financeSignals = await ids(c, `SELECT id FROM owner_finance_outcome_signals WHERE workspace_id = $1 AND business_id = $2 AND (action_id = ANY($3::uuid[]) OR verification_id = ANY($4::uuid[])) ORDER BY id`, [ws, biz, financeActions, financeVerifications]);
  const cashflowCycles = await ids(c, `SELECT id FROM owner_cashflow_cycles WHERE workspace_id = $1 AND business_id = $2 AND snapshot_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, cashflowAffected]);
  const cashflowActions = await ids(c, `SELECT id FROM owner_cashflow_actions WHERE workspace_id = $1 AND business_id = $2 AND cycle_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, cashflowCycles]);
  const cashflowFindings = await ids(c, `SELECT id FROM owner_cashflow_findings WHERE workspace_id = $1 AND business_id = $2 AND cycle_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, cashflowCycles]);
  const cashflowVerifications = await ids(c, `SELECT id FROM owner_cashflow_verifications WHERE workspace_id = $1 AND business_id = $2 AND action_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, cashflowActions]);

  const allActions = [...financeActions, ...cashflowActions];
  const allVerifications = [...financeVerifications, ...cashflowVerifications];
  const allCycles = [...financeCycles, ...cashflowCycles];

  // decisions (and every other sequence of the same candidate chain)
  let decisionRows = await rows<{ id: string; candidate_id: string }>(c, `SELECT id, candidate_id FROM owner_decision_records WHERE workspace_id = $1 AND business_id = $2 AND source_id = ANY($3::uuid[])`, [ws, biz, allActions]);
  const candidateKeys = uniq(decisionRows.map((r) => r.candidate_id));
  decisionRows = await rows(c, `SELECT id, candidate_id FROM owner_decision_records WHERE workspace_id = $1 AND business_id = $2 AND (source_id = ANY($3::uuid[]) OR candidate_id = ANY($4::text[]))`, [ws, biz, allActions, candidateKeys]);
  const decisions = sorted(decisionRows.map((r) => r.id));
  const assessments = await ids(c,
    `SELECT id FROM owner_outcome_assessments WHERE workspace_id = $1 AND business_id = $2
        AND (chain_key = ANY($3::text[]) OR owner_decision_id = ANY($4::uuid[]) OR system_a_action_id = ANY($5::uuid[]) OR system_a_verification_id = ANY($6::uuid[])) ORDER BY id`,
    [ws, biz, candidateKeys, decisions, allActions, allVerifications]);
  const pointerAssessments = await ids(c,
    `SELECT id FROM owner_outcome_assessments WHERE workspace_id = $1 AND business_id = $2 AND newer_diagnosis_cycle_id = ANY($3::uuid[]) AND NOT (id = ANY($4::uuid[])) ORDER BY id`,
    [ws, biz, allCycles, assessments]);
  const assignments = await ids(c, `SELECT id FROM owner_action_assignments WHERE workspace_id = $1 AND business_id = $2 AND action_id = ANY($3::text[]) ORDER BY id`, [ws, biz, allActions]);
  let approvals = await ids(c, `SELECT id FROM owner_approval_requests WHERE workspace_id = $1 AND business_id = $2 AND action_id = ANY($3::text[])`, [ws, biz, allActions]);
  for (let i = 0; i < 20; i++) { // appeal chains
    const more = await ids(c, `SELECT id FROM owner_approval_requests WHERE workspace_id = $1 AND business_id = $2 AND appeal_of_id = ANY($3::uuid[]) AND NOT (id = ANY($3::uuid[]))`, [ws, biz, approvals]);
    if (more.length === 0) break;
    approvals = uniq([...approvals, ...more]);
  }
  approvals = sorted(approvals);
  const approvalEvidence = await ids(c, `SELECT id FROM owner_approval_evidences WHERE workspace_id = $1 AND approval_id = ANY($2::uuid[]) ORDER BY id`, [ws, approvals]);
  const selfEvals = await ids(c, `SELECT id FROM owner_self_evaluation WHERE workspace_id = $1 AND action_id = ANY($2::uuid[]) ORDER BY id`, [ws, allActions]);
  const actionOutcomes = await ids(c, `SELECT id FROM owner_action_outcomes WHERE "workspaceId" = $1 AND "businessId" = $2 AND "actionId" = ANY($3::text[]) ORDER BY id`, [ws, biz, allActions]);
  const learningCandidates = await ids(c,
    `SELECT id FROM controlled_learning_candidates WHERE "workspaceId" = $1 AND "businessId" = $2
        AND ("sourceActionId" = ANY($3::text[]) OR "sourceOutcomeId" = ANY($4::text[]) OR "sourceOwnerDecisionId" = ANY($5::text[])) ORDER BY id`,
    [ws, biz, allActions, actionOutcomes, decisions]);
  const learningChildTables = (await rows<{ table_name: string }>(
    c, `SELECT DISTINCT c.relname AS table_name FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attname = 'candidateId' AND NOT a.attisdropped AND c.relname LIKE 'controlled_learning_%' AND c.relname <> 'controlled_learning_candidates' ORDER BY 1`,
  )).map((r) => r.table_name);
  if (learningCandidates.length > 0) {
    const promoted = await num(c, `SELECT count(*)::int AS n FROM controlled_learning_candidates WHERE id = ANY($1::text[]) AND ("promotedAt" IS NOT NULL OR "promotionLocked" = true)`, [learningCandidates]);
    const admitted = await num(c, `SELECT count(*)::int AS n FROM controlled_learning_admissions WHERE "candidateId" = ANY($1::text[])`, [learningCandidates]);
    if (promoted + admitted > 0) blockers.push({ code: "LEARNING_PROMOTED_REQUIRES_REVIEW", detail: `${promoted + admitted} learning record(s) derived from QuickBooks-based outcomes were promoted/admitted; manual review required before erasure` });
  }
  const sourceIds = uniq([...allActions, ...allVerifications, ...allCycles, ...decisions, ...assessments, ...approvals, ...assignments, ...selfEvals, ...actionOutcomes, ...learningCandidates, ...candidateKeys]);
  const operatingMemory = await ids(c, `SELECT id FROM operating_memory_entries WHERE workspace_id = $1 AND source_id = ANY($2::text[]) ORDER BY id`, [ws, sourceIds]);
  const firstResult = await ids(c, `SELECT id FROM owner_first_result_interactions WHERE workspace_id = $1 AND business_id = $2 AND snapshot_id = ANY($3::uuid[]) ORDER BY id`, [ws, biz, [...financeAffected, ...cashflowAffected]]);
  const scheduledTasks = await ids(c, `SELECT id FROM scheduled_tasks WHERE workspace_id = $1 AND task_name = 'qbo-sync' AND payload->>'connectionId' = ANY($2::text[]) ORDER BY id`, [ws, connIds]);

  const idSets: IdSets = {
    connections: connIds, reportSnapshots, provenance, financeAffected: sorted(financeAffected), financeDelete: sorted(financeDelete),
    cashflowAffected: sorted(cashflowAffected), cashflowDelete: sorted(cashflowDelete),
    financeCycles, financeActions, financeVerifications, financeSignals, cashflowCycles, cashflowActions, cashflowVerifications,
    decisions, candidateKeys, assessments, pointerAssessments, assignments, approvals, approvalEvidence, selfEvals, actionOutcomes,
    learningCandidates, operatingMemory, firstResult, scheduledTasks,
  };

  // ── Residue scan: anything else that mentions an id we are erasing, or this business's realm / company name
  const erasedRefs = uniq([
    ...connIds, ...financeAffected, ...cashflowAffected, ...financeCycles, ...financeFindings, ...financeActions, ...financeVerifications, ...financeSignals,
    ...cashflowCycles, ...cashflowFindings, ...cashflowActions, ...cashflowVerifications, ...decisions, ...assessments, ...approvals, ...assignments,
    ...selfEvals, ...actionOutcomes, ...learningCandidates, ...reportSnapshots, ...provenance,
  ]);
  const hits = await residueScan(c, ws, { ids: erasedRefs, needles }, HANDLED_TABLES);
  for (const h of hits) blockers.push({ code: "UNREGISTERED_REFERENCE", detail: `${h.table}.${h.column}: ${h.hits} row(s) reference QuickBooks-derived data and are not covered by the erasure registry` });

  const counts: Record<string, number> = {
    qbo_connections: connIds.length, qbo_connection_tokens: tokens, qbo_resource_locks: locks, qbo_sync_state: syncStates, qbo_oauth_states: oauthStates,
    qbo_report_snapshots: reportSnapshots.length, qbo_canonical_provenance: provenance.length,
    owner_financial_snapshots_deleted: financeDelete.length, owner_cashflow_snapshots_deleted: cashflowDelete.length,
    owner_finance_cycles: financeCycles.length, owner_finance_findings: financeFindings.length, owner_finance_actions: financeActions.length,
    owner_finance_verifications: financeVerifications.length, owner_finance_outcome_signals: financeSignals.length,
    owner_cashflow_cycles: cashflowCycles.length, owner_cashflow_findings: cashflowFindings.length, owner_cashflow_actions: cashflowActions.length,
    owner_cashflow_verifications: cashflowVerifications.length,
    owner_decision_records: decisions.length, owner_outcome_assessments_deleted: assessments.length, owner_outcome_assessments_detached: pointerAssessments.length,
    owner_action_assignments: assignments.length, owner_approval_requests: approvals.length, owner_approval_evidences: approvalEvidence.length,
    owner_self_evaluation: selfEvals.length, owner_action_outcomes: actionOutcomes.length, controlled_learning_candidates: learningCandidates.length,
    operating_memory_entries: operatingMemory.length, owner_first_result_interactions: firstResult.length, scheduled_tasks: scheduledTasks.length,
    audit_events_realm_scrubbed: await num(c, `SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1 AND event_name LIKE 'qbo.%' AND payload ? 'realmId'`, [ws]),
  };
  const canonical = {
    financeChainsDeleted: finance.filter((f) => f.plan.mode === "DELETE_CHAIN" || (f.plan.mode === "SCRUB_CURRENT" && f.plan.deleteCurrent)).length,
    financeChainsScrubbed: finance.filter((f) => f.plan.mode === "SCRUB_CURRENT" && !f.plan.deleteCurrent).length,
    financeVersionsDeleted: financeDelete.length,
    financeFieldsNulled: finance.reduce((n, f) => n + (f.plan.mode === "SCRUB_CURRENT" ? f.plan.nullColumns.length : 0), 0),
    cashflowRowsDeleted: cashflowDelete.length,
    cashflowRowsScrubbed: cashflow.filter((f) => f.plan.mode === "SCRUB_ROW" && !f.plan.deleteRow).length,
    cashflowFieldsNulled: cashflow.reduce((n, f) => n + (f.plan.mode === "SCRUB_ROW" ? f.plan.nullColumns.length : 0), 0),
    retainedOwnerRows: retained.length,
  };

  // Volatile facts (connection status, token presence, scheduled tasks, audit counts) are NOT part of the manifest, so the
  // mandatory "stop processing / revoke" step cannot invalidate an approved dry-run; the DATA being erased is.
  const manifest = {
    scope, connections: connIds, reportSnapshots, provenance,
    finance: finance.map((f) => ("currentId" in f.plan ? { ...f.plan } : { ...f.plan })),
    cashflow: cashflow.map((f) => ({ ...f.plan })),
    ids: { ...idSets, scheduledTasks: [] as string[] },
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return { scope, counts, canonical, blockers, manifestHash, internal: { connections: connections.map((r) => ({ id: r.id, environment: r.environment, status: r.status })), needles, ids: idSets, finance, cashflow, retained, learningChildTables } };
}

/** LIKE-escape a literal. */
const likeLiteral = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export async function residueScan(
  c: Sql, workspaceId: string, refs: { ids: readonly string[]; needles: readonly string[] }, skipTables: ReadonlySet<string>,
): Promise<Array<{ table: string; column: string; hits: number }>> {
  if (refs.ids.length === 0 && refs.needles.length === 0) return [];
  const cols = await rows<{ table_name: string; column_name: string; data_type: string }>(
    c,
    `SELECT c.relname AS table_name, a.attname AS column_name,
            CASE WHEN t.typcategory = 'A' THEN 'ARRAY' WHEN t.typname = 'varchar' THEN 'character varying' ELSE t.typname END AS data_type
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname, a.attnum`,
  );
  const byTable = new Map<string, Array<{ column_name: string; data_type: string }>>();
  for (const col of cols) {
    if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
    byTable.get(col.table_name)!.push(col);
  }
  const idPatterns = refs.ids.map(likeLiteral);
  const needlePatterns = refs.needles.map(likeLiteral);
  const hits: Array<{ table: string; column: string; hits: number }> = [];
  for (const [table, tcols] of byTable) {
    if (table === "_prisma_migrations") continue; // migration history (DDL names, timestamps): never user data; the eraser has no privilege on it
    // audit_events legitimately keeps opaque OpsIQ ids (no values); only realm ids / company names are residue there.
    const auditOnlyNeedles = table === "audit_events";
    if (skipTables.has(table) && !auditOnlyNeedles) continue;
    const scopeCol = tcols.find((x) => x.column_name === "workspace_id") ?? tcols.find((x) => x.column_name === "workspaceId");
    // A table with NO workspace column is scanned too, unscoped (fail closed): a reference there is a BLOCKER, never a skip.
    const usable = tcols.filter((x) => x.column_name !== scopeCol?.column_name && x.column_name !== "id" && ["uuid", "text", "character varying", "json", "jsonb", "ARRAY"].includes(x.data_type));
    const conds: Array<{ column: string; sql: string; params: unknown[] }> = [];
    for (const col of usable) {
      const q = `"${col.column_name}"`;
      if (col.data_type === "uuid") {
        if (!auditOnlyNeedles && refs.ids.length > 0) conds.push({ column: col.column_name, sql: `${q} = ANY($2::uuid[])`, params: [refs.ids] });
      } else {
        const pats = auditOnlyNeedles ? needlePatterns : [...idPatterns, ...needlePatterns];
        // audit_events: the realmId KEY is scrubbed by the erasure itself, so only residue AFTER that scrub counts.
        const expr = auditOnlyNeedles && col.column_name === "payload" && col.data_type === "jsonb" ? `(${q} - 'realmId')::text` : `${q}::text`;
        if (pats.length > 0) conds.push({ column: col.column_name, sql: `${expr} LIKE ANY($2::text[])`, params: [pats] });
      }
    }
    if (conds.length === 0) continue;
    const scopeSql = scopeCol ? `"${table}" WHERE "${scopeCol.column_name}"::text = $1` : `"${table}" WHERE $1::text IS NOT NULL`;
    // One probe per (table, bind-kind); drill into columns only on a hit.
    for (const kind of ["uuid", "text"] as const) {
      const group = conds.filter((x) => (kind === "uuid") === x.sql.includes("uuid[]"));
      if (group.length === 0) continue;
      const total = await num(c, `SELECT count(*)::int AS n FROM ${scopeSql} AND (${group.map((x) => x.sql).join(" OR ")})`, [workspaceId, group[0].params[0]]);
      if (total === 0) continue;
      for (const x of group) {
        const n = await num(c, `SELECT count(*)::int AS n FROM ${scopeSql} AND ${x.sql}`, [workspaceId, x.params[0]]);
        if (n > 0) hits.push({ table, column: x.column, hits: n });
      }
    }
  }
  return hits;
}

/* ───────────────────────────── request lifecycle ───────────────────────────── */

export function confirmTokenFor(requestId: string, manifestHash: string): string {
  return createHash("sha256").update(`opsiq-qbo-erasure|${requestId}|${manifestHash}`).digest("hex").slice(0, 24);
}

const cleanRef = (v: string, what: string) => {
  const t = (v ?? "").trim();
  if (t.length < 2 || t.length > 200 || /[\r\n\u0000]/.test(t)) throw new ErasureRefusedError("INVALID_OPERATOR_REF", `${what} must be a 2-200 character single-line operator reference`);
  return t;
};

export async function createErasureRequest(
  c: Sql, i: { scope: ErasureScope; reasonCode: ErasureReasonCode; requestedBy: string; privacyRequestId?: string | null },
): Promise<{ id: string }> {
  assertUuid(i.scope.workspaceId, "workspaceId");
  assertUuid(i.scope.businessId, "businessId");
  if (!ERASURE_REASON_CODES.includes(i.reasonCode)) throw new ErasureRefusedError("INVALID_REASON_CODE");
  if (i.privacyRequestId) assertUuid(i.privacyRequestId, "privacyRequestId");
  const id = randomUUID();
  await c.query(
    `INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, privacy_request_id, status, requested_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6, now())`,
    [id, i.scope.workspaceId, i.scope.businessId, i.reasonCode, i.privacyRequestId ?? null, cleanRef(i.requestedBy, "requestedBy")],
  );
  return { id };
}

async function loadRequest(c: Sql, requestId: string, forUpdate = false) {
  assertUuid(requestId, "requestId");
  const r = (await rows<Record<string, any>>(c, `SELECT * FROM privacy_erasure_requests WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [requestId]))[0];
  if (!r) throw new ErasureRefusedError("REQUEST_NOT_FOUND");
  return r;
}

export interface DryRunReport {
  requestId: string; scope: ErasureScope; counts: Record<string, number>; canonical: ErasurePlan["canonical"];
  blockers: Blocker[]; manifestHash: string; confirmToken: string;
}

/** Read-only against business data. Records the manifest hash on the request so approval is bound to exactly what was shown. */
export async function recordDryRun(c: ClientBase, requestId: string): Promise<DryRunReport> {
  const req = await loadRequest(c, requestId);
  if (req.status === "EXECUTED" || req.status === "EXECUTING" || req.status === "REJECTED") throw new ErasureRefusedError("REQUEST_NOT_OPEN", `request is ${req.status}`);
  const scope = { workspaceId: req.workspace_id as string, businessId: req.business_id as string };
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let plan: ErasurePlan;
  try { plan = await planQboErasure(c, scope); } finally { await c.query("ROLLBACK"); }
  await c.query(`UPDATE privacy_erasure_requests SET status = 'DRY_RUN_RECORDED', manifest_hash = $2, dry_run_at = now(), approved_by = NULL, approved_at = NULL, updated_at = now() WHERE id = $1 AND status IN ('REQUESTED','DRY_RUN_RECORDED','APPROVED')`, [requestId, plan.manifestHash]);
  return { requestId, scope, counts: plan.counts, canonical: plan.canonical, blockers: plan.blockers, manifestHash: plan.manifestHash, confirmToken: confirmTokenFor(requestId, plan.manifestHash) };
}

export async function approveErasureRequest(c: ClientBase, requestId: string, approvedBy: string): Promise<void> {
  const approver = cleanRef(approvedBy, "approvedBy");
  const req = await loadRequest(c, requestId);
  if (req.status !== "DRY_RUN_RECORDED" || !req.manifest_hash) throw new ErasureRefusedError("DRY_RUN_REQUIRED", "a recorded dry-run is required before approval");
  if (req.requested_by === approver) throw new ErasureRefusedError("TWO_PERSON_RULE", "the approver must differ from the requester");
  const scope = { workspaceId: req.workspace_id as string, businessId: req.business_id as string };
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let plan: ErasurePlan;
  try { plan = await planQboErasure(c, scope); } finally { await c.query("ROLLBACK"); }
  if (plan.manifestHash !== req.manifest_hash) throw new ErasureRefusedError("MANIFEST_DRIFT", "the data changed since the dry-run; run the dry-run again");
  if (plan.blockers.length > 0) throw new ErasureRefusedError("BLOCKERS_PRESENT", `${plan.blockers.length} blocker(s) must be resolved before approval`);
  await c.query(`UPDATE privacy_erasure_requests SET status = 'APPROVED', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1 AND status = 'DRY_RUN_RECORDED'`, [requestId, approver]);
}

/* ───────────────────────────── verification ───────────────────────────── */

export interface VerificationCheck { pass: boolean; found: number }
export interface VerificationReport { result: "PASS" | "FAIL"; checks: Record<string, VerificationCheck>; notEvaluated: string[] }

export async function verifyQboErasure(
  c: Sql, scope: ErasureScope,
  ctx: { plan?: ErasurePlan } = {},
): Promise<VerificationReport> {
  const ws = scope.workspaceId;
  const biz = scope.businessId;
  const checks: Record<string, VerificationCheck> = {};
  const put = (k: string, found: number) => { checks[k] = { pass: found === 0, found }; };
  const p = ctx.plan?.internal;

  put("connections", await num(c, `SELECT count(*)::int AS n FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]));
  put("activeConnections", await num(c, `SELECT count(*)::int AS n FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2 AND status <> 'DISCONNECTED'`, [ws, biz]));
  put("tokens", await num(c, `SELECT count(*)::int AS n FROM qbo_connection_tokens t WHERE t.workspace_id = $1 AND (t.connection_id IN (SELECT id FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2) OR t.connection_id = ANY($3::uuid[]))`, [ws, biz, p?.ids.connections ?? []]));
  put("resourceLocks", await num(c, `SELECT count(*)::int AS n FROM qbo_resource_locks WHERE workspace_id = $1 AND connection_id = ANY($2::uuid[])`, [ws, p?.ids.connections ?? []]));
  put("syncStateAndWebhookMarkers", await num(c, `SELECT count(*)::int AS n FROM qbo_sync_state WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]));
  put("oauthStates", await num(c, `SELECT count(*)::int AS n FROM qbo_oauth_states WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]));
  put("reportSnapshotsAndProviderPayload", await num(c, `SELECT count(*)::int AS n FROM qbo_report_snapshots WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]));
  put("provenance", await num(c, `SELECT count(*)::int AS n FROM qbo_canonical_provenance WHERE workspace_id = $1 AND business_id = $2`, [ws, biz]));
  put("qboControlledCanonicalMarkers", await num(c,
    `SELECT ((SELECT count(*) FROM owner_financial_snapshots WHERE workspace_id = $1 AND business_id = $2 AND notes = $3)
           + (SELECT count(*) FROM owner_cashflow_snapshots WHERE workspace_id = $1 AND business_id = $2 AND notes = $3))::int AS n`, [ws, biz, QBO_IMPORT_NOTE]));
  put("qboScheduledTasksActive", await num(c,
    `SELECT count(*)::int AS n FROM scheduled_tasks WHERE workspace_id = $1 AND task_name = 'qbo-sync' AND status IN ('pending','running')
        AND (payload->>'connectionId' = ANY($2::text[]) OR NOT EXISTS (SELECT 1 FROM qbo_connections q WHERE q.id::text = payload->>'connectionId'))`, [ws, p?.ids.connections ?? []]));
  put("auditRealmIdentifiers", await num(c, `SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1 AND event_name LIKE 'qbo.%' AND payload ? 'realmId'`, [ws]));

  const notEvaluated: string[] = [];
  if (p) {
    // Planned-for-deletion canonical rows and the whole derived family must be gone.
    const gone = async (table: string, idCol: string, list: string[], cast = "uuid") =>
      list.length === 0 ? 0 : num(c, `SELECT count(*)::int AS n FROM "${table}" WHERE "${idCol}" = ANY($1::${cast}[])`, [list]);
    put("canonicalRowsDeleted", (await gone("owner_financial_snapshots", "id", p.ids.financeDelete)) + (await gone("owner_cashflow_snapshots", "id", p.ids.cashflowDelete)));
    put("diagnosisFamilyDeleted",
      (await gone("owner_finance_cycles", "id", p.ids.financeCycles)) + (await gone("owner_cashflow_cycles", "id", p.ids.cashflowCycles)) +
      (await gone("owner_finance_actions", "id", p.ids.financeActions)) + (await gone("owner_cashflow_actions", "id", p.ids.cashflowActions)) +
      (await gone("owner_finance_verifications", "id", p.ids.financeVerifications)) + (await gone("owner_cashflow_verifications", "id", p.ids.cashflowVerifications)) +
      (await gone("owner_finance_outcome_signals", "id", p.ids.financeSignals)));
    put("decisionAndMemoryFamilyDeleted",
      (await gone("owner_decision_records", "id", p.ids.decisions)) + (await gone("owner_outcome_assessments", "id", p.ids.assessments)) +
      (await gone("owner_action_assignments", "id", p.ids.assignments)) + (await gone("owner_approval_requests", "id", p.ids.approvals)) +
      (await gone("owner_self_evaluation", "id", p.ids.selfEvals)) + (await gone("owner_action_outcomes", "id", p.ids.actionOutcomes, "text")) +
      (await gone("controlled_learning_candidates", "id", p.ids.learningCandidates, "text")) + (await gone("operating_memory_entries", "id", p.ids.operatingMemory)) +
      (await gone("owner_first_result_interactions", "id", p.ids.firstResult)));
    put("detachedAssessmentPointers", p.ids.pointerAssessments.length === 0 ? 0 : await num(c, `SELECT count(*)::int AS n FROM owner_outcome_assessments WHERE id = ANY($1::uuid[]) AND newer_diagnosis_cycle_id IS NOT NULL`, [p.ids.pointerAssessments]));
    const erasedRefs = uniq([
      ...p.ids.connections, ...p.ids.financeAffected.filter((x) => p.ids.financeDelete.includes(x)), ...p.ids.cashflowDelete, ...p.ids.financeCycles, ...p.ids.financeActions,
      ...p.ids.financeVerifications, ...p.ids.financeSignals, ...p.ids.cashflowCycles, ...p.ids.cashflowActions, ...p.ids.cashflowVerifications, ...p.ids.decisions,
      ...p.ids.assessments, ...p.ids.approvals, ...p.ids.assignments, ...p.ids.selfEvals, ...p.ids.actionOutcomes, ...p.ids.learningCandidates, ...p.ids.reportSnapshots, ...p.ids.provenance,
    ]);
    // Generic residue scan over EVERY workspace-scoped table (not just ours). Only the tombstone is exempt; audit_events is checked for needles only.
    const residue = await residueScan(c, ws, { ids: erasedRefs, needles: p.needles }, new Set(["privacy_erasure_requests"]));
    // audit_events keeps opaque OpsIQ ids (no values); residueScan already limited it to realm / company needles.
    put("residualReferencesAnywhere", residue.reduce((n, h) => n + h.hits, 0));
    // Retained owner-authored rows: QuickBooks-attributed columns are NULL, the owner's columns are untouched.
    let drift = 0;
    for (const r of p.retained) {
      const row = (await rows<Record<string, any>>(c, `SELECT * FROM ${r.table} WHERE id = $1 AND workspace_id = $2 AND business_id = $3`, [r.id, ws, biz]))[0];
      if (!row) { drift++; continue; }
      for (const col of r.nulled) if (row[col] !== null) drift++;
      for (const [col, v] of Object.entries(r.keep)) if ((row[col] === null ? null : Number(row[col])) !== v) drift++;
    }
    put("retainedOwnerRecordsMatchPolicy", drift);
  } else {
    notEvaluated.push("canonicalRowsDeleted", "diagnosisFamilyDeleted", "decisionAndMemoryFamilyDeleted", "residualReferencesAnywhere", "retainedOwnerRecordsMatchPolicy");
  }
  return { result: Object.values(checks).every((x) => x.pass) ? "PASS" : "FAIL", checks, notEvaluated };
}

/* ───────────────────────────── execution ───────────────────────────── */

export type RevocationOutcome = "REVOKED" | "ALREADY_INVALID" | "FAILED" | "SKIPPED" | "NOT_NEEDED";
/** Stops processing and revokes the grant at Intuit (best effort). Supplied by the CLI; never required for the erasure to proceed. */
export type RevokeHook = (scope: ErasureScope, connections: ReadonlyArray<{ id: string; environment: string; status: string }>) => Promise<RevocationOutcome>;

export interface ExecuteInput {
  requestId: string;
  confirmToken: string;
  revoke?: RevokeHook;
  /** Required for any database whose name does not start with `opsiq_erasure_test`; must equal the request id. */
  productionAuthorization?: string;
}
export interface ExecuteResult {
  status: "ERASED" | "ALREADY_EXECUTED";
  requestId: string;
  revocation: RevocationOutcome;
  counts: Record<string, number>;
  verification: VerificationReport;
}

export async function assertExecutionTarget(c: Sql, requestId: string, productionAuthorization?: string): Promise<void> {
  const db = String((await rows<{ db: string }>(c, `SELECT current_database() AS db`))[0]?.db ?? "");
  if (/^opsiq_erasure_test/.test(db)) return;
  if (productionAuthorization && productionAuthorization === requestId) return;
  throw new ErasureRefusedError("NON_DISPOSABLE_DATABASE", "refusing to run against a non-disposable database without --production-authorization=<request id>");
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

async function deleteLeafFirst(c: Sql, table: string, selfCol: string, list: string[], cast: string): Promise<number> {
  let remaining = [...list];
  let total = 0;
  for (let i = 0; remaining.length > 0 && i < 10_000; i++) {
    const r = await c.query(
      `DELETE FROM "${table}" t WHERE t.id = ANY($1::${cast}[]) AND NOT EXISTS (SELECT 1 FROM "${table}" ch WHERE ch."${selfCol}" = t.id) RETURNING t.id`,
      [remaining],
    );
    if ((r.rowCount ?? 0) === 0) throw new ErasureRefusedError("SELF_REFERENCE_NOT_RESOLVABLE", `${table}: a row outside the erasure set still references the set`);
    total += r.rowCount ?? 0;
    const done = new Set(r.rows.map((x: any) => String(x.id)));
    remaining = remaining.filter((id) => !done.has(id));
  }
  return total;
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
function toCamelRow(r: Record<string, any>, overrides: Record<string, string> = {}): Record<string, any> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [overrides[k] ?? camel(k), v]));
}

export async function executeQboErasure(c: ClientBase, input: ExecuteInput): Promise<ExecuteResult> {
  const req = await loadRequest(c, input.requestId);
  const scope: ErasureScope = { workspaceId: req.workspace_id, businessId: req.business_id };
  if (req.status === "EXECUTED") {
    return { status: "ALREADY_EXECUTED", requestId: input.requestId, revocation: "NOT_NEEDED", counts: (req.result_counts ?? {}) as Record<string, number>, verification: await verifyQboErasure(c, scope) };
  }
  await assertExecutionTarget(c, input.requestId, input.productionAuthorization);
  if (req.status !== "APPROVED" || !req.approved_by || !req.manifest_hash) throw new ErasureRefusedError("NOT_APPROVED", `request is ${req.status}`);
  if (!safeEq(input.confirmToken ?? "", confirmTokenFor(input.requestId, req.manifest_hash))) throw new ErasureRefusedError("CONFIRMATION_TOKEN_MISMATCH", "run the dry-run and pass the token it printed");

  // Stop processing + revoke the grant FIRST (best effort, outside the erasing transaction). Never blocks deletion.
  let revocation: RevocationOutcome = "NOT_NEEDED";
  const live = (await rows<{ id: string; environment: string; status: string }>(c, `SELECT id, environment, status FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2 AND status <> 'DISCONNECTED'`, [scope.workspaceId, scope.businessId]));
  if (live.length > 0) {
    try { revocation = input.revoke ? await input.revoke(scope, live) : "SKIPPED"; } catch { revocation = "FAILED"; }
  }

  const fail = async (code: string) => { try { await c.query(`UPDATE privacy_erasure_requests SET result_code = $2, updated_at = now() WHERE id = $1 AND status <> 'EXECUTED'`, [input.requestId, code]); } catch { /* best effort */ } };

  await c.query("BEGIN");
  try {
    await c.query(`SET LOCAL lock_timeout = '20s'`);
    // Serialization point: any concurrent connect / materialization / sync that takes an FK lock on the business or a connection waits.
    await c.query(`SELECT id FROM owner_businesses WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [scope.businessId, scope.workspaceId]);
    await c.query(`SELECT id FROM qbo_connections WHERE workspace_id = $1 AND business_id = $2 FOR UPDATE`, [scope.workspaceId, scope.businessId]);
    await c.query(`UPDATE qbo_connections SET status = 'DISCONNECTED', disconnected_at = COALESCE(disconnected_at, now()), updated_at = now() WHERE workspace_id = $1 AND business_id = $2 AND status <> 'DISCONNECTED'`, [scope.workspaceId, scope.businessId]);

    const plan = await planQboErasure(c, scope);
    if (plan.manifestHash !== req.manifest_hash) throw new ErasureRefusedError("MANIFEST_DRIFT", "the data changed since approval; nothing was erased");
    if (plan.blockers.length > 0) throw new ErasureRefusedError("BLOCKERS_PRESENT", `${plan.blockers.length} blocker(s)`);

    const claimed = await c.query(`UPDATE privacy_erasure_requests SET status = 'EXECUTING', updated_at = now() WHERE id = $1 AND status = 'APPROVED' AND manifest_hash = $2`, [input.requestId, req.manifest_hash]);
    if (claimed.rowCount !== 1) throw new ErasureRefusedError("NOT_APPROVED", "request could not be claimed");
    await c.query(`SELECT set_config('opsiq.erasure_request_id', $1, true)`, [input.requestId]);

    const done: Record<string, number> = {};
    const add = (k: string, n: number | null | undefined) => { done[k] = (done[k] ?? 0) + (n ?? 0); };
    const del = async (k: string, table: string, col: string, list: string[], cast = "uuid", extra = "") => {
      if (list.length === 0) return;
      add(k, (await c.query(`DELETE FROM "${table}" WHERE "${col}" = ANY($1::${cast}[])${extra}`, [list])).rowCount);
    };
    const { ids: s, internal } = { ids: plan.internal.ids, internal: plan.internal };
    const ws = scope.workspaceId;
    const biz = scope.businessId;

    await del("scheduled_tasks", "scheduled_tasks", "id", s.scheduledTasks);
    await del("owner_finance_outcome_signals", "owner_finance_outcome_signals", "id", s.financeSignals);
    await del("owner_finance_verifications", "owner_finance_verifications", "id", s.financeVerifications);
    await del("owner_cashflow_verifications", "owner_cashflow_verifications", "id", s.cashflowVerifications);
    for (const t of internal.learningChildTables) await del(t, t, "candidateId", s.learningCandidates, "text");
    await del("controlled_learning_candidates", "controlled_learning_candidates", "id", s.learningCandidates, "text");
    await del("operating_memory_entries", "operating_memory_entries", "id", s.operatingMemory);
    await del("owner_approval_evidences", "owner_approval_evidences", "id", s.approvalEvidence);
    add("owner_approval_requests", await deleteLeafFirst(c, "owner_approval_requests", "appeal_of_id", s.approvals, "uuid"));
    await del("owner_action_assignments", "owner_action_assignments", "id", s.assignments);
    await del("owner_self_evaluation", "owner_self_evaluation", "id", s.selfEvals);
    await del("owner_action_outcomes", "owner_action_outcomes", "id", s.actionOutcomes, "text");
    if (s.pointerAssessments.length > 0) {
      add("owner_outcome_assessments_detached", (await c.query(
        `UPDATE owner_outcome_assessments SET newer_diagnosis_cycle_id = NULL, newer_diagnosis_domain = NULL, newer_diagnosis_evidence_as_of = NULL WHERE id = ANY($1::uuid[])`, [s.pointerAssessments])).rowCount);
    }
    add("owner_outcome_assessments", await deleteLeafFirst(c, "owner_outcome_assessments", "previous_assessment_id", s.assessments, "uuid"));
    add("owner_decision_records", await deleteLeafFirst(c, "owner_decision_records", "supersedes_id", s.decisions, "uuid"));
    await del("owner_first_result_interactions", "owner_first_result_interactions", "id", s.firstResult);
    // Cycles cascade to their findings and actions (verifications / signals are already gone).
    await del("owner_finance_cycles", "owner_finance_cycles", "id", s.financeCycles);
    await del("owner_cashflow_cycles", "owner_cashflow_cycles", "id", s.cashflowCycles);

    // QuickBooks evidence: provenance -> observations -> locks / sync state / token -> connection -> oauth states
    await del("qbo_canonical_provenance", "qbo_canonical_provenance", "id", s.provenance);
    await del("qbo_report_snapshots", "qbo_report_snapshots", "id", s.reportSnapshots);
    await del("qbo_resource_locks", "qbo_resource_locks", "connection_id", s.connections, "uuid", ` AND workspace_id = '${ws}'`);
    await del("qbo_sync_state", "qbo_sync_state", "connection_id", s.connections, "uuid", ` AND workspace_id = '${ws}'`);
    await del("qbo_connection_tokens", "qbo_connection_tokens", "connection_id", s.connections, "uuid", ` AND workspace_id = '${ws}'`);
    await del("qbo_connections", "qbo_connections", "id", s.connections);
    add("qbo_oauth_states", (await c.query(`DELETE FROM qbo_oauth_states WHERE workspace_id = $1 AND business_id = $2`, [ws, biz])).rowCount);

    // Canonical snapshots: delete QuickBooks-controlled rows; scrub the QuickBooks-attributed figures of owner-amended ones.
    await del("owner_financial_snapshots", "owner_financial_snapshots", "id", s.financeDelete, "uuid", ` AND workspace_id = '${ws}' AND business_id = '${biz}'`);
    await del("owner_cashflow_snapshots", "owner_cashflow_snapshots", "id", s.cashflowDelete, "uuid", ` AND workspace_id = '${ws}' AND business_id = '${biz}'`);
    const { calculateDataConfidence: finConf } = await import("@/domain/owner-finance/data-confidence");
    const { rowToFinanceInput } = await import("@/services/owner-finance/snapshot.service");
    const { calculateDataConfidence: cfConf } = await import("@/domain/owner-cashflow/data-confidence");
    const { rowToCashflowInput } = await import("@/domain/owner-cashflow/row-input");
    for (const f of internal.finance) {
      if (f.plan.mode !== "SCRUB_CURRENT" || f.plan.deleteCurrent || !f.currentRow) continue;
      const next = { ...f.currentRow };
      for (const col of f.plan.nullColumns) next[col] = null;
      if (f.plan.clearNotes) next.notes = null;
      const conf = finConf(rowToFinanceInput(toCamelRow(next, { leakage_component_version: "leakageCompVersion" })));
      const sets = [...f.plan.nullColumns.map((col) => `"${col}" = NULL`), ...(f.plan.clearNotes ? [`notes = NULL`] : [])];
      await c.query(
        `UPDATE owner_financial_snapshots SET ${sets.length ? sets.join(", ") + "," : ""} data_confidence_score = $1, missing_critical_data = $2::jsonb, updated_at = now() WHERE id = $3 AND workspace_id = $4 AND business_id = $5`,
        [conf.dataConfidenceScore, JSON.stringify(conf.missingCritical), f.plan.currentId, ws, biz],
      );
      add("owner_financial_snapshots_scrubbed", 1);
    }
    for (const f of internal.cashflow) {
      if (f.plan.mode !== "SCRUB_ROW" || f.plan.deleteRow) continue;
      const next = { ...f.row };
      for (const col of f.plan.nullColumns) next[col] = null;
      if (f.plan.clearNotes) next.notes = null;
      const conf = cfConf(rowToCashflowInput(toCamelRow(next) as any));
      const sets = [...f.plan.nullColumns.map((col) => `"${col}" = NULL`), ...(f.plan.clearNotes ? [`notes = NULL`] : [])];
      await c.query(
        `UPDATE owner_cashflow_snapshots SET ${sets.length ? sets.join(", ") + "," : ""} data_confidence_score = $1, missing_critical_data = $2::jsonb, updated_at = now() WHERE id = $3 AND workspace_id = $4 AND business_id = $5`,
        [conf.dataConfidenceScore, JSON.stringify(conf.missingCritical), f.plan.id, ws, biz],
      );
      add("owner_cashflow_snapshots_scrubbed", 1);
    }

    // The only audit rows touched: remove the Intuit company identifier (realmId) from QuickBooks events. The production hash chain
    // covers id|workspace|event|timestamp only, so the chain is unaffected. No row is deleted.
    add("audit_events_realm_scrubbed", (await c.query(`UPDATE audit_events SET payload = payload - 'realmId' WHERE workspace_id = $1 AND event_name LIKE 'qbo.%' AND payload ? 'realmId'`, [ws])).rowCount);

    // Verify BEFORE committing: a failed verification rolls everything back.
    const verification = await verifyQboErasure(c, scope, { plan });
    if (verification.result !== "PASS") {
      const failed = Object.entries(verification.checks).filter(([, v]) => !v.pass).map(([k]) => k).join(",");
      throw new ErasureRefusedError("VERIFICATION_FAILED", `post-erasure verification failed: ${failed}`);
    }
    const tombstone = { ...done, revocation };
    await c.query(`UPDATE privacy_erasure_requests SET status = 'EXECUTED', executed_at = now(), result_code = 'ERASED', result_counts = $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'EXECUTING'`, [input.requestId, JSON.stringify(tombstone)]);
    await c.query("COMMIT");
    return { status: "ERASED", requestId: input.requestId, revocation, counts: done, verification };
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* connection already aborted */ }
    await fail(e instanceof ErasureRefusedError ? `FAILED_${e.code}` : "FAILED_ROLLED_BACK");
    throw e;
  }
}
