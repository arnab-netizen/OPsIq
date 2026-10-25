/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows */
/**
 * Governed QuickBooks / Intuit User Data erasure — HOSTILE proof on a DISPOSABLE PostgreSQL (database name opsiq_erasure_test*).
 *
 *   OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/opsiq_erasure_test \
 *     npx vitest run src/__tests__/privacy-erasure/qbo-erasure.db.test.ts
 *
 * The test connects as three different database users: the superuser (seeding and assertions), `erasure_operator_t` (a member of
 * opsiq_privacy_eraser) and `app_runtime_t` (an ordinary non-member application login). Nothing here touches Production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks, type QboTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { amendFinancialSnapshot, createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { disconnectQboConnection } from "@/services/quickbooks/qbo-connection.service";
import { disconnectQuickBooks } from "@/services/quickbooks/qbo-lifecycle.service";
import { reactToQboWebhook } from "@/services/quickbooks/qbo-webhook.service";
import { TASK_NAME_QBO_SYNC, createQboSyncTaskHandler, enqueueDueQboSyncTasks, enqueueQboSync, qboSyncKey } from "@/services/quickbooks/qbo-sync-scheduling";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { applyRoleTopology, verifyRoleTopology } from "@/services/privacy-erasure/role-topology";
import {
  ErasureRefusedError, approveErasureRequest, assertExecutionTarget, createErasureRequest, executeQboErasure, recordDryRun, verifyQboErasure,
  type RevokeHook,
} from "@/services/privacy-erasure/qbo-erasure.service";

const BASE_URL = process.env.DATABASE_URL ?? "";
const urlFor = (user: string) => { const u = new URL(BASE_URL); u.username = user; u.password = "pw"; return u.toString(); };
const env = envFor("production");
const books = (n: number): MonthBooks => ({ income: 20_000 + n, cogs: 9_000, bank: 15_000, arTotal: 8_000, arCurrent: 3_000, apTotal: 6_000, apCurrent: 1_000 });
const allMonths = () => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

let admin: Client;
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  if (!/opsiq_erasure_test/.test(BASE_URL)) throw new Error("refusing to run: DATABASE_URL must be the disposable opsiq_erasure_test database");
  admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  // The REAL least-privilege topology (same code the operator runs): `admin` is the NON-superuser schema owner that applied the migrations;
  // the runtime and the two eraser logins are separate roles that own nothing.
  await applyRoleTopology(admin, { runtimeRole: "app_runtime_t", eraserLogins: ["erasure_operator_t", "erasure_operator_t2"] });
  for (const r of ["app_runtime_t", "erasure_operator_t", "erasure_operator_t2"]) await admin.query(`ALTER ROLE ${r} PASSWORD 'pw'`);
});
afterAll(async () => { await admin?.end(); });

const asUser = async (user: string) => { const c = new Client({ connectionString: urlFor(user) }); await c.connect(); return c; };
const approve2 = async (id: string, name: string) => { const a = await asUser("erasure_operator_t2"); try { return await approveErasureRequest(a, id, name); } finally { await a.end(); } };
const count = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);

async function seedHistory(opts: { diagnose?: boolean } = {}) {
  const t = await seedQboTenant();
  const conn = await connectQbo(t);
  const f = makeFakeIntuit(allMonths(), "Erasure Test Co");
  for (let i = 0; i < 4; i++) await runQboSync({ workspaceId: t.ws, connectionId: conn.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
  const latestKey = monthKeys(12)[0];
  const snap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latestKey), supersededById: null } });
  let cycle: any = null;
  if (opts.diagnose !== false) cycle = await runFinanceDiagnosis(t.biz, snap.id, t.actor, t.ws);
  return { t, ...conn, f, latestKey, snap, cycle };
}

/** Seed the soft-linked, append-only family that hangs off a diagnosis (decision -> 2 assessments, memory, assignment, approval, self-evaluation). */
async function seedSoftFamily(t: QboTenant, cycleId: string) {
  const action = await db.ownerFinanceAction.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, cycleId } });
  const decisionId = randomUUID();
  const candidate = `finance_action:${action.id}`;
  await admin.query(
    `INSERT INTO owner_decision_records (id, workspace_id, business_id, candidate_id, candidate_source, domain, source_id, decision_state, sequence, decided_by_id, decided_at, recommendation_snapshot, decision_contract_version, request_fingerprint)
     VALUES ($1,$2,$3,$4,'domain_action','finance',$5,'REJECTED',1,$6,now(),'{"note":"derived from QuickBooks-based diagnosis"}'::jsonb,'v1',$7)`,
    [decisionId, t.ws, t.biz, candidate, action.id, t.actor, randomUUID()]);
  const a1 = randomUUID();
  const a2 = randomUUID();
  const assess = (id: string, version: number, prev: string | null) => admin.query(
    `INSERT INTO owner_outcome_assessments (id, workspace_id, business_id, chain_key, version, previous_assessment_id, owner_decision_id, owner_decision_state, commitment_fidelity, decision_link_state, source_system, source_link_state, domain, canonical_action_id, system_a_action_id, policy_version, assessed_at, execution_status, observation_status, measurement_result, target_attainment, issue_resolution, causal_attribution, learning_eligibility, verification_status, evidence_quality, verifier_kind, independently_verified, self_verified, disputed, external_interference, learning_blockers, next_verification_action, input_snapshot, assessment_fingerprint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'REJECTED','AS_RECOMMENDED','LINKED','SYSTEM_A','LINKED','finance',$8,$9,'p1',now(),'NOT_STARTED','NOT_STARTED','NOT_MEASURABLE','UNKNOWN','NOT_YET_REASSESSED','NOT_ASSESSED','NOT_ELIGIBLE','UNVERIFIED','NONE','NONE',false,false,false,false,ARRAY[]::text[],'none','{"derived":"from QuickBooks diagnosis"}'::jsonb,$10)`,
    [id, t.ws, t.biz, candidate, version, prev, decisionId, candidate, action.id, randomUUID()]);
  await assess(a1, 1, null);
  await assess(a2, 2, a1);
  await admin.query(`INSERT INTO operating_memory_entries (workspace_id, memory_type, source_model, source_id, key, summary, data) VALUES ($1,'OUTCOME','OwnerDecisionRecord',$2,'k','derived from QuickBooks figures','{"v":1}'::jsonb)`, [t.ws, decisionId]);
  await admin.query(`INSERT INTO owner_action_assignments (workspace_id, business_id, idempotency_key, action_id, action_domain, assigned_to, assigned_by_id, created_by, updated_at) VALUES ($1,$2,$3,$4,'finance','someone',$5,$5,now())`, [t.ws, t.biz, randomUUID(), action.id, t.actor]);
  await admin.query(`INSERT INTO owner_approval_requests (workspace_id, idempotency_key, business_id, action_id, action_domain, requested_by, created_by, updated_at) VALUES ($1,$2,$3,$4,'finance',$5,$5,now())`, [t.ws, randomUUID(), t.biz, action.id, t.actor]);
  await admin.query(`INSERT INTO owner_self_evaluation (workspace_id, action_id, expected_outcome, result) VALUES ($1,$2,'x','pending')`, [t.ws, action.id]);
  // An unrelated assessment that merely POINTS at the erased cycle: the pointer is detached, the row is kept.
  const pointer = randomUUID();
  await admin.query(
    `INSERT INTO owner_outcome_assessments (id, workspace_id, business_id, chain_key, version, owner_decision_id, owner_decision_state, commitment_fidelity, decision_link_state, source_system, source_link_state, domain, canonical_action_id, newer_diagnosis_domain, newer_diagnosis_cycle_id, newer_diagnosis_evidence_as_of, policy_version, assessed_at, execution_status, observation_status, measurement_result, target_attainment, issue_resolution, causal_attribution, learning_eligibility, verification_status, evidence_quality, verifier_kind, independently_verified, self_verified, disputed, external_interference, learning_blockers, next_verification_action, input_snapshot, assessment_fingerprint)
     VALUES ($1,$2,$3,'sales_action:other',1,NULL,NULL,'NO_DECISION','UNLINKED_NO_DECISION','NONE','NO_EXECUTION_SOURCE_LINKED','sales','sales:other','finance',$4,now(),'p1',now(),'NOT_STARTED','NOT_STARTED','NOT_MEASURABLE','UNKNOWN','NOT_YET_REASSESSED','NOT_ASSESSED','NOT_ELIGIBLE','UNVERIFIED','NONE','NONE',false,false,false,false,ARRAY[]::text[],'none','{}'::jsonb,$5)`,
    [pointer, t.ws, t.biz, cycleId, randomUUID()]);
  return { actionId: action.id, decisionId, assessments: [a1, a2], pointer };
}

async function runErasure(t: Pick<QboTenant, "ws" | "biz">, o: { revoke?: RevokeHook; requestedBy?: string; approvedBy?: string } = {}) {
  const c = await asUser("erasure_operator_t");
  try {
    const { id } = await createErasureRequest(c, { scope: { workspaceId: t.ws, businessId: t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: o.requestedBy ?? "operator-a" });
    const dry = await recordDryRun(c, id);
    expect(dry.blockers, JSON.stringify(dry.blockers)).toEqual([]);
    await approve2(id, o.approvedBy ?? "operator-b");
    const res = await executeQboErasure(c, { requestId: id, confirmToken: dry.confirmToken, revoke: o.revoke });
    return { id, dry, res };
  } finally { await c.end(); }
}

const qboCounts = async (t: Pick<QboTenant, "ws" | "biz">) => ({
  connections: await count(`SELECT count(*)::int AS n FROM qbo_connections WHERE workspace_id=$1 AND business_id=$2`, [t.ws, t.biz]),
  tokens: await count(`SELECT count(*)::int AS n FROM qbo_connection_tokens WHERE workspace_id=$1`, [t.ws]),
  syncState: await count(`SELECT count(*)::int AS n FROM qbo_sync_state WHERE workspace_id=$1`, [t.ws]),
  observations: await count(`SELECT count(*)::int AS n FROM qbo_report_snapshots WHERE workspace_id=$1`, [t.ws]),
  provenance: await count(`SELECT count(*)::int AS n FROM qbo_canonical_provenance WHERE workspace_id=$1`, [t.ws]),
  financeSnapshots: await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots WHERE workspace_id=$1`, [t.ws]),
  cashflowSnapshots: await count(`SELECT count(*)::int AS n FROM owner_cashflow_snapshots WHERE workspace_id=$1`, [t.ws]),
  financeCycles: await count(`SELECT count(*)::int AS n FROM owner_finance_cycles WHERE workspace_id=$1`, [t.ws]),
  tasks: await count(`SELECT count(*)::int AS n FROM scheduled_tasks WHERE workspace_id=$1 AND task_name='qbo-sync'`, [t.ws]),
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] governed QuickBooks erasure — hostile", () => {
  it("connected business with FULL history + diagnosis + decision family: everything Intuit-derived is erased, other tenants and owner data untouched", async () => {
    const other = await seedHistory({ diagnose: true }); // a different tenant with the same shape: must be untouched
    const otherBefore = await qboCounts(other.t);
    expect(otherBefore.observations).toBeGreaterThan(0);

    const s = await seedHistory({ diagnose: true });
    const soft = await seedSoftFamily(s.t, s.cycle.id);
    // an owner-only period (no QuickBooks involvement) with its own diagnosis: must survive
    const ownerSnap: any = await createFinancialSnapshot(s.t.biz, { periodStart: "2024-01-01", periodEnd: "2024-01-31", currency: "USD", revenue: 777, evidenceQuality: "ACTUAL" } as any, s.t.actor, s.t.ws).catch(() => null);

    const before = await qboCounts(s.t);
    expect(before.connections).toBe(1); expect(before.tokens).toBe(1); expect(before.observations).toBeGreaterThan(0);
    expect(before.provenance).toBeGreaterThan(0); expect(before.financeCycles).toBe(1);
    const realmAudit = await count(`SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event_name LIKE 'qbo.%' AND payload ? 'realmId'`, [s.t.ws]);
    expect(realmAudit).toBeGreaterThan(0);
    const auditChain = (await admin.query(`SELECT id, previous_hash, event_name, occurred_at FROM audit_events WHERE workspace_id=$1 ORDER BY id`, [s.t.ws])).rows;

    const { id, res } = await runErasure(s.t, { revoke: async () => "REVOKED" });
    expect(res.status).toBe("ERASED");
    expect(res.revocation).toBe("REVOKED");
    expect(res.verification.result).toBe("PASS");

    const after = await qboCounts(s.t);
    expect(after).toMatchObject({ connections: 0, tokens: 0, syncState: 0, observations: 0, provenance: 0, financeSnapshots: ownerSnap ? 1 : 0, cashflowSnapshots: 0, financeCycles: 0, tasks: 0 });
    expect(await count(`SELECT count(*)::int AS n FROM owner_finance_actions WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_finance_findings WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_decision_records WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_outcome_assessments WHERE workspace_id=$1 AND id = ANY($2::uuid[])`, [s.t.ws, soft.assessments])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM operating_memory_entries WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_action_assignments WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_approval_requests WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_self_evaluation WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    // pointer-only assessment: kept, pointer detached
    const ptr = (await admin.query(`SELECT newer_diagnosis_cycle_id FROM owner_outcome_assessments WHERE id=$1`, [soft.pointer])).rows[0];
    expect(ptr.newer_diagnosis_cycle_id).toBeNull();
    // business, owner-only data and the audit chain survive; realm id is gone from audit payloads; chain columns identical
    expect(await count(`SELECT count(*)::int AS n FROM owner_businesses WHERE id=$1`, [s.t.biz])).toBe(1);
    if (ownerSnap) expect(await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots WHERE id=$1`, [ownerSnap.id])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event_name LIKE 'qbo.%' AND payload ? 'realmId'`, [s.t.ws])).toBe(0);
    expect((await admin.query(`SELECT id, previous_hash, event_name, occurred_at FROM audit_events WHERE workspace_id=$1 ORDER BY id`, [s.t.ws])).rows.filter((r: any) => auditChain.some((a: any) => a.id === r.id))).toEqual(auditChain);
    expect(await count(`SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND payload::text LIKE $2`, [s.t.ws, `%${s.realmId}%`])).toBe(0);
    // tombstone: counts only, never a realm id / company name
    const tomb = (await admin.query(`SELECT status, result_code, result_counts, approved_by, requested_by FROM privacy_erasure_requests WHERE id=$1`, [id])).rows[0];
    expect(tomb).toMatchObject({ status: "EXECUTED", result_code: "ERASED", approved_by: "operator-b", requested_by: "operator-a" });
    expect(JSON.stringify(tomb.result_counts)).not.toContain(s.realmId);
    expect(JSON.stringify(tomb.result_counts)).not.toContain("Erasure Test Co");
    // the other tenant is byte-for-byte unaffected
    expect(await qboCounts(other.t)).toEqual(otherBefore);
  }, 180_000);

  it("DISCONNECTED business with retained history (ordinary disconnect kept it) is erased on request", async () => {
    const s = await seedHistory({ diagnose: false });
    await disconnectQboConnection({ workspaceId: s.t.ws, actorId: s.t.actor, connectionId: s.connectionId });
    const mid = await qboCounts(s.t);
    expect(mid.observations).toBeGreaterThan(0); expect(mid.tokens).toBe(0); // disconnect retains history, drops tokens
    const { res } = await runErasure(s.t);
    expect(res.verification.result).toBe("PASS");
    expect(await qboCounts(s.t)).toMatchObject({ connections: 0, observations: 0, provenance: 0, financeSnapshots: 0, cashflowSnapshots: 0 });
  }, 120_000);

  it("owner-amended QuickBooks period: owner's re-stated figure kept, every other QuickBooks figure removed, history removed; manual-first period untouched", async () => {
    const t = await seedQboTenant();
    // manual-first month: the owner entered it BEFORE QuickBooks, so QuickBooks must treat it as owner-controlled
    const keys = monthKeys(12);
    const manualKey = keys[3];
    const [y, m] = manualKey.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const manual: any = await createFinancialSnapshot(t.biz, { periodStart: manualKey, periodEnd: end, currency: "USD", revenue: 12_345, evidenceQuality: "ACTUAL" } as any, t.actor, t.ws);
    const conn = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    for (let i = 0; i < 4; i++) await runQboSync({ workspaceId: t.ws, connectionId: conn.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
    expect(await count(`SELECT count(*)::int AS n FROM qbo_canonical_provenance WHERE financial_snapshot_id=$1`, [manual.id])).toBe(0); // owner-controlled
    const manualCycle = await runFinanceDiagnosis(t.biz, manual.id, t.actor, t.ws);

    const latest = keys[0];
    const qboSnap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latest), supersededById: null } });
    expect(qboSnap.costOfGoods).toBe(9_000);
    const amended = (await amendFinancialSnapshot(qboSnap.id, { amendmentReason: "owner restated revenue", revenue: 31_000 } as any, t.actor, t.ws)).snapshot as any;
    await runFinanceDiagnosis(t.biz, amended.id, t.actor, t.ws); // a diagnosis on the MIXED version: derived from QuickBooks figures too

    const { res } = await runErasure(t);
    expect(res.verification.result).toBe("PASS");
    const kept = (await admin.query(`SELECT * FROM owner_financial_snapshots WHERE id=$1`, [amended.id])).rows[0];
    expect(Number(kept.revenue)).toBe(31_000);            // the owner's own act
    expect(kept.cost_of_goods).toBeNull();                // QuickBooks' figure
    expect(kept.receivables).toBeNull();
    expect(kept.overdue_receivables).toBeNull();
    expect(kept.payables).toBeNull();
    expect(kept.overdue_payables).toBeNull();
    expect(kept.notes).toBeNull();                        // "Imported from QuickBooks Online."
    expect(await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots WHERE id=$1`, [qboSnap.id])).toBe(0); // superseded QuickBooks version gone
    expect(await count(`SELECT count(*)::int AS n FROM owner_finance_cycles WHERE snapshot_id=$1`, [amended.id])).toBe(0); // diagnosis on mixed values gone
    // manual-first period and its diagnosis are exactly as the owner left them
    const manualRow = (await admin.query(`SELECT revenue FROM owner_financial_snapshots WHERE id=$1`, [manual.id])).rows[0];
    expect(Number(manualRow.revenue)).toBe(12_345);
    expect(await count(`SELECT count(*)::int AS n FROM owner_finance_cycles WHERE id=$1`, [manualCycle.id])).toBe(1);
    // every other QuickBooks-only period is gone
    expect(await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots WHERE workspace_id=$1 AND id <> ALL($2::uuid[])`, [t.ws, [manual.id, amended.id]])).toBe(0);
  }, 180_000);

  it("pending webhook task + pending daily sync + stale token: all cancelled; nothing can recreate the data without a fresh OAuth connection", async () => {
    const s = await seedHistory({ diagnose: false });
    await db.qboConnection.update({ where: { id: s.connectionId }, data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date(), lastErrorCode: "REFRESH_INVALID" } });
    await db.qboConnection.update({ where: { id: s.connectionId }, data: { status: "ACTIVE", reauthRequiredAt: null, lastErrorCode: null } });
    await reactToQboWebhook({ realmIds: [s.realmId] }, { env });
    await enqueueQboSync({ workspaceId: s.t.ws, connectionId: s.connectionId, trigger: "SCHEDULED", key: qboSyncKey(s.connectionId, "daily", new Date()) });
    expect((await qboCounts(s.t)).tasks).toBeGreaterThan(0);
    expect(await count(`SELECT count(*)::int AS n FROM qbo_sync_state WHERE connection_id=$1 AND webhook_pending_at IS NOT NULL`, [s.connectionId])).toBe(1);

    const { res } = await runErasure(s.t, { revoke: async () => "FAILED" }); // Intuit unreachable: deletion still proceeds
    expect(res.revocation).toBe("FAILED");
    expect(res.verification.result).toBe("PASS");
    const after = await qboCounts(s.t);
    expect(after).toMatchObject({ tasks: 0, syncState: 0, tokens: 0, connections: 0 });

    // 1. a stale webhook for the erased company triggers nothing
    expect(await reactToQboWebhook({ realmIds: [s.realmId] }, { env })).toEqual({ realmsReceived: 1, connectionsTriggered: 0 });
    // 2. the daily producer enqueues nothing for the business
    await enqueueDueQboSyncTasks(new Date());
    expect(await count(`SELECT count(*)::int AS n FROM scheduled_tasks WHERE workspace_id=$1 AND task_name='qbo-sync'`, [s.t.ws])).toBe(0);
    // 3. a task for the erased connection id that somehow still arrives runs as a no-op: no provider call, nothing written
    const { taskId } = await enqueueQboSync({ workspaceId: s.t.ws, connectionId: s.connectionId, trigger: "SCHEDULED", key: qboSyncKey(s.connectionId, "ghost", new Date()) });
    await db.scheduledTask.update({ where: { id: taskId }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    const calls = s.f.calls.length;
    const handlers = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env, readClientFactory: () => s.f.reader }))]]);
    await new DatabaseSchedulerProvider().processTaskById(taskId, handlers);
    expect(s.f.calls.length).toBe(calls);
    const reappeared = await qboCounts(s.t);
    expect(reappeared).toMatchObject({ connections: 0, observations: 0, provenance: 0, financeSnapshots: 0, cashflowSnapshots: 0 });
    // QBO_ERASED_DATA_CAN_REAPPEAR_WITHOUT_NEW_OAUTH=NO
    await db.scheduledTask.deleteMany({ where: { id: taskId } });
  }, 180_000);

  it("idempotent: re-executing is a no-op, and a second request on the already-erased business verifies PASS with nothing to do", async () => {
    const s = await seedHistory({ diagnose: false });
    const first = await runErasure(s.t);
    const c = await asUser("erasure_operator_t");
    try {
      const again = await executeQboErasure(c, { requestId: first.id, confirmToken: first.dry.confirmToken });
      expect(again.status).toBe("ALREADY_EXECUTED");
      expect(again.verification.result).toBe("PASS");
    } finally { await c.end(); }
    const second = await runErasure(s.t);
    expect(second.res.verification.result).toBe("PASS");
    expect(Object.values(second.dry.counts).reduce((a, b) => a + b, 0)).toBe(0);
  }, 180_000);

  it("blockers: a table the registry does not know that references a QuickBooks-derived row blocks approval (fail closed)", async () => {
    const s = await seedHistory({ diagnose: true });
    await admin.query(`CREATE TABLE IF NOT EXISTS zz_unregistered_probe (workspace_id uuid, note text)`);
    await admin.query(`GRANT ALL ON zz_unregistered_probe TO erasure_operator_t`);
    await admin.query(`INSERT INTO zz_unregistered_probe VALUES ($1, $2)`, [s.t.ws, `see cycle ${s.cycle.id}`]);
    const c = await asUser("erasure_operator_t");
    try {
      const { id } = await createErasureRequest(c, { scope: { workspaceId: s.t.ws, businessId: s.t.biz }, reasonCode: "USER_REVOKED_CONSENT", requestedBy: "operator-a" });
      const dry = await recordDryRun(c, id);
      expect(dry.blockers.map((b) => b.code)).toContain("UNREGISTERED_REFERENCE");
      await expect(approve2(id, "operator-b")).rejects.toMatchObject({ code: "BLOCKERS_PRESENT" });
      expect(await count(`SELECT count(*)::int AS n FROM qbo_report_snapshots WHERE workspace_id=$1`, [s.t.ws])).toBeGreaterThan(0);
    } finally { await c.end(); await admin.query(`DROP TABLE IF EXISTS zz_unregistered_probe`); }
  }, 120_000);

  it("drift: data that changes between approval and execution is refused and nothing is erased", async () => {
    const s = await seedHistory({ diagnose: false });
    const c = await asUser("erasure_operator_t");
    try {
      const { id } = await createErasureRequest(c, { scope: { workspaceId: s.t.ws, businessId: s.t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: "operator-a" });
      const dry = await recordDryRun(c, id);
      await approve2(id, "operator-b");
      await new Promise((r) => setTimeout(r, 1100));
      s.f.books.set(s.latestKey, { ...books(0), income: 5_000 });
      await runQboSync({ workspaceId: s.t.ws, connectionId: s.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => s.f.reader });
      const before = await qboCounts(s.t);
      await expect(executeQboErasure(c, { requestId: id, confirmToken: dry.confirmToken })).rejects.toMatchObject({ code: "MANIFEST_DRIFT" });
      expect(await qboCounts(s.t)).toEqual(before);
    } finally { await c.end(); }
  }, 180_000);

  it("UNAUTHORIZED attempts all fail: wrong token, not approved, same-person approval, wrong role, wrong business, UPDATE, non-disposable target", async () => {
    const s = await seedHistory({ diagnose: false });
    const victim = await seedHistory({ diagnose: false });
    const before = await qboCounts(s.t);
    const op = await asUser("erasure_operator_t");
    const app = await asUser("app_runtime_t");
    try {
      const { id } = await createErasureRequest(op, { scope: { workspaceId: s.t.ws, businessId: s.t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: "operator-a" });
      // not approved / no dry-run
      await expect(executeQboErasure(op, { requestId: id, confirmToken: "x" })).rejects.toMatchObject({ code: "NOT_APPROVED" });
      await recordDryRun(op, id);
      await expect(approve2(id, "operator-a")).rejects.toMatchObject({ code: "TWO_PERSON_RULE" });
      await approve2(id, "operator-b");
      // wrong confirmation token
      await expect(executeQboErasure(op, { requestId: id, confirmToken: "0".repeat(24) })).rejects.toMatchObject({ code: "CONFIRMATION_TOKEN_MISMATCH" });
      // the database itself refuses a forged same-person approval
      await expect(admin.query(`UPDATE privacy_erasure_requests SET approved_by = requested_by WHERE id=$1`, [id])).rejects.toThrow();
      expect(await qboCounts(s.t)).toEqual(before);

      const probe = async (c: Client, sql: string, params: unknown[]) => { await c.query("SAVEPOINT p"); const r = await c.query(sql, params).then(() => "OK", (e) => String(e.message)); await c.query("ROLLBACK TO SAVEPOINT p"); return r; };
      // Raw SQL hostility. Each runs in its own transaction and is rolled back.
      const attempt = async (c: Client, sql: string, params: unknown[], setup?: string) => {
        await c.query("BEGIN");
        try { if (setup) await c.query(setup, [id]); return await c.query(sql, params).then(() => "OK", (e) => String(e.message)); } finally { await c.query("ROLLBACK"); }
      };
      const del = `DELETE FROM qbo_report_snapshots WHERE workspace_id=$1 AND business_id=$2`;
      const forge = `SELECT set_config('opsiq.erasure_request_id', $1, true)`;
      // 1. ordinary runtime session, no GUC
      expect(await attempt(app, del, [s.t.ws, s.t.biz])).toMatch(/immutable evidence/);
      // 2. ordinary runtime session that forges the GUC AND an EXECUTING row (it is not a member of the eraser role)
      await app.query("BEGIN");
      // The runtime login has NO privilege on the tombstone at all: it can neither forge an EXECUTING row nor read one.
      expect(await probe(app, `UPDATE privacy_erasure_requests SET status='EXECUTING' WHERE id=$1`, [id])).toMatch(/permission denied/);
      expect(await probe(app, `INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, status, requested_by, updated_at) VALUES (gen_random_uuid(), $1, $2, 'USER_DATA_ERASURE_REQUEST', 'REQUESTED', 'x', now())`, [s.t.ws, s.t.biz])).toMatch(/permission denied/);
      expect(await probe(app, `SELECT 1 FROM privacy_erasure_requests`, [])).toMatch(/permission denied/);
      await app.query(forge, [id]);
      expect(await app.query(del, [s.t.ws, s.t.biz]).then(() => "OK", (e) => String(e.message))).toMatch(/immutable evidence/);
      await app.query("ROLLBACK");
      // 3. eraser-role member with the GUC but the request merely APPROVED (not EXECUTING)
      expect(await attempt(op, del, [s.t.ws, s.t.biz], forge)).toMatch(/immutable evidence/);
      // 4. eraser-role member, request EXECUTING for business A, deleting business B's evidence
      await op.query("BEGIN");
      await op.query(`UPDATE privacy_erasure_requests SET status='EXECUTING' WHERE id=$1`, [id]);
      await op.query(forge, [id]);
      expect(await probe(op, del, [victim.t.ws, victim.t.biz])).toMatch(/immutable evidence/);
      // 5. ...and even authorized, UPDATE of provenance / observations stays impossible
      expect(await probe(op, `UPDATE qbo_canonical_provenance SET action='UPDATED' WHERE workspace_id=$1`, [s.t.ws])).toMatch(/append-only/);
      expect(await probe(op, `UPDATE qbo_report_snapshots SET content_hash='x' WHERE workspace_id=$1`, [s.t.ws])).toMatch(/immutable/);
      await op.query("ROLLBACK");
      expect(await qboCounts(s.t)).toEqual(before);
      expect(await qboCounts(victim.t)).toMatchObject({ connections: 1 });
    } finally { await op.end(); await app.end(); }

    // non-disposable target guard
    const fake = { query: async () => ({ rows: [{ db: "neondb" }] }) } as any;
    await expect(assertExecutionTarget(fake, "req-1")).rejects.toMatchObject({ code: "NON_DISPOSABLE_DATABASE" });
    await expect(assertExecutionTarget(fake, "req-1", "something-else")).rejects.toMatchObject({ code: "NON_DISPOSABLE_DATABASE" });
    await expect(assertExecutionTarget(fake, "req-1", "req-1")).resolves.toBeUndefined();
    expect(ErasureRefusedError).toBeDefined();
  }, 180_000);

  it("NORMAL runtime immutability is unchanged: ordinary sessions still cannot delete or rewrite QuickBooks evidence, decisions or assessments", async () => {
    const s = await seedHistory({ diagnose: true });
    const soft = await seedSoftFamily(s.t, s.cycle.id);
    // through the application's own Prisma client (superuser, no erasure authorization)
    await expect(db.qboReportSnapshot.deleteMany({ where: { workspaceId: s.t.ws } })).rejects.toThrow();
    await expect(db.qboCanonicalProvenance.deleteMany({ where: { workspaceId: s.t.ws } })).rejects.toThrow();
    await expect(db.qboCanonicalProvenance.updateMany({ where: { workspaceId: s.t.ws }, data: { action: "UPDATED" } })).rejects.toThrow();
    await expect(admin.query(`DELETE FROM owner_decision_records WHERE id=$1`, [soft.decisionId])).rejects.toThrow(/append-only/);
    await expect(admin.query(`UPDATE owner_decision_records SET decision_state='REJECTED' WHERE id=$1`, [soft.decisionId])).rejects.toThrow(/append-only/);
    await expect(admin.query(`DELETE FROM owner_outcome_assessments WHERE id=$1`, [soft.assessments[0]])).rejects.toThrow(/append-only/);
    await expect(admin.query(`UPDATE owner_outcome_assessments SET version=version WHERE id=$1`, [soft.assessments[0]])).rejects.toThrow(/append-only/);
    // and the superuser — a member of every role — still cannot bypass without an EXECUTING request naming this business
    await admin.query("BEGIN");
    await admin.query(`SELECT set_config('opsiq.erasure_request_id', $1, true)`, [randomUUID()]);
    await expect(admin.query(`DELETE FROM qbo_report_snapshots WHERE workspace_id=$1`, [s.t.ws])).rejects.toThrow(/immutable evidence/);
    await admin.query("ROLLBACK");
    expect((await qboCounts(s.t)).observations).toBeGreaterThan(0);
  }, 180_000);

  it("standalone verifier reports FAIL while QuickBooks data exists and PASS only after erasure", async () => {
    const s = await seedHistory({ diagnose: false });
    const pre = await verifyQboErasure(admin as any, { workspaceId: s.t.ws, businessId: s.t.biz });
    expect(pre.result).toBe("FAIL");
    expect(pre.checks.connections.pass).toBe(false);
    await runErasure(s.t);
    const post = await verifyQboErasure(admin as any, { workspaceId: s.t.ws, businessId: s.t.biz });
    expect(post.result).toBe("PASS");
  }, 120_000);
});

/* ───────────────────────────── least-privilege role model: hostile runtime + hostile operator ───────────────────────────── */
const NAMES = { runtimeRole: "app_runtime_t", eraserLogins: ["erasure_operator_t", "erasure_operator_t2"] } as const;
/** Run one statement inside its own transaction, ALWAYS rolled back; resolves to "OK" or the error message. */
async function attempt(c: Client, sql: string, params: unknown[] = [], pre: Array<[string, unknown[]?]> = []): Promise<string> {
  await c.query("BEGIN");
  try {
    for (const [p, a] of pre) await c.query(p, a ?? []);
    return await c.query(sql, params).then(() => "OK", (e) => String(e.message));
  } finally { await c.query("ROLLBACK"); }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] least-privilege role model — hostile runtime credential", () => {
  it("the verifier reports the runtime + eraser logins as least-privilege (catalog-only, safe against Production)", async () => {
    const r = await verifyRoleTopology(admin, NAMES);
    expect(r.checks.filter((x) => !x.ok)).toEqual([]);
    expect(r.result).toBe("PASS");
    // and it is not vacuous: the SCHEMA OWNER fails the very same checks when named as the runtime
    const bad = await verifyRoleTopology(admin, { runtimeRole: "opsiq_schema_owner", eraserLogins: NAMES.eraserLogins });
    expect(bad.result).toBe("FAIL");
    expect(bad.checks.filter((x) => !x.ok).length).toBeGreaterThanOrEqual(4);
  }, 60_000);

  it("a COMPROMISED runtime credential cannot delete evidence, disable or replace the guards, forge an approval, become the eraser or grant itself the role", async () => {
    const s = await seedHistory({ diagnose: true });
    const soft = await seedSoftFamily(s.t, s.cycle.id);
    const app = await asUser("app_runtime_t");
    try {
      const before = await qboCounts(s.t);
      const trg = (await admin.query(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'qbo_report_snapshots'::regclass AND NOT tgisinternal LIMIT 1`)).rows[0].tgname;
      // 1. deleting the evidence (guard raises) and the derived decision / assessment rows
      expect(await attempt(app, `DELETE FROM qbo_report_snapshots WHERE workspace_id=$1`, [s.t.ws])).toMatch(/immutable evidence/);
      expect(await attempt(app, `DELETE FROM qbo_canonical_provenance WHERE workspace_id=$1`, [s.t.ws])).toMatch(/append-only/);
      expect(await attempt(app, `DELETE FROM owner_decision_records WHERE id=$1`, [soft.decisionId])).toMatch(/append-only/);
      expect(await attempt(app, `DELETE FROM owner_outcome_assessments WHERE id=$1`, [soft.assessments[0]])).toMatch(/append-only/);
      expect(await attempt(app, `UPDATE owner_outcome_assessments SET version = version WHERE id=$1`, [soft.assessments[0]])).toMatch(/append-only/);
      // 2. TRUNCATE skips row triggers - the runtime has no TRUNCATE privilege
      for (const t of ["qbo_report_snapshots", "qbo_canonical_provenance", "owner_decision_records", "owner_outcome_assessments"]) {
        expect(await attempt(app, `TRUNCATE ${t} CASCADE`)).toMatch(/permission denied/);
      }
      // 3. switching the guards off / replacing them (all need OWNERSHIP, which the runtime does not have)
      expect(await attempt(app, `ALTER TABLE qbo_report_snapshots DISABLE TRIGGER USER`)).toMatch(/must be owner/);
      expect(await attempt(app, `ALTER TABLE qbo_report_snapshots DISABLE TRIGGER ${trg}`)).toMatch(/must be owner/);
      expect(await attempt(app, `DROP TRIGGER ${trg} ON qbo_report_snapshots`)).toMatch(/must be owner/);
      expect(await attempt(app, `DROP TABLE qbo_report_snapshots CASCADE`)).toMatch(/must be owner/);
      expect(await attempt(app, `CREATE OR REPLACE FUNCTION qbo_report_snapshots_guard() RETURNS trigger AS $f$ BEGIN RETURN COALESCE(NEW, OLD); END $f$ LANGUAGE plpgsql`)).toMatch(/must be owner|permission denied for schema public/);
      expect(await attempt(app, `CREATE OR REPLACE FUNCTION qbo_erasure_authorized(uuid, uuid) RETURNS boolean AS $f$ SELECT true $f$ LANGUAGE sql`)).toMatch(/must be owner|permission denied for schema public/);
      expect(await attempt(app, `CREATE FUNCTION public.zz_shadow() RETURNS int AS $f$ SELECT 1 $f$ LANGUAGE sql`)).toMatch(/permission denied for schema public/);
      expect(await attempt(app, `CREATE SCHEMA zz_evil`)).toMatch(/permission denied/);
      expect(await attempt(app, `SET session_replication_role = replica`)).toMatch(/permission denied to set parameter/);
      // 4. forging an approved erasure
      expect(await attempt(app, `INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, status, requested_by, updated_at) VALUES (gen_random_uuid(), $1, $2, 'USER_DATA_ERASURE_REQUEST', 'REQUESTED', 'x', now())`, [s.t.ws, s.t.biz])).toMatch(/permission denied/);
      expect(await attempt(app, `UPDATE privacy_erasure_requests SET status = 'EXECUTING'`)).toMatch(/permission denied/);
      // a TEMPORARY table of the same name must not shadow the real one inside the authorization function
      const shadow = await attempt(app, del(s.t), [], [
        [`CREATE TEMP TABLE privacy_erasure_requests (id uuid, workspace_id uuid, business_id uuid, status text, approved_by text, manifest_hash text, approved_db_user text, requested_db_user text, executing_xid text)`],
        [`INSERT INTO pg_temp.privacy_erasure_requests VALUES (gen_random_uuid(), '${s.t.ws}', '${s.t.biz}', 'EXECUTING', 'a', 'h', 'b', 'c', pg_current_xact_id()::text)`],
        [`SELECT set_config('opsiq.erasure_request_id', (SELECT id::text FROM pg_temp.privacy_erasure_requests LIMIT 1), true)`],
      ]);
      expect(shadow).toMatch(/immutable evidence/);
      // 5. becoming / granting the eraser role
      expect(await attempt(app, `SET ROLE opsiq_privacy_eraser`)).toMatch(/permission denied to set role/);
      expect(await attempt(app, `GRANT opsiq_privacy_eraser TO app_runtime_t`)).toMatch(/permission denied|must have admin option/);
      expect(await attempt(app, `ALTER ROLE app_runtime_t SUPERUSER`)).toMatch(/permission denied|must be superuser/);
      expect(await attempt(app, `ALTER ROLE app_runtime_t CREATEROLE`)).toMatch(/permission denied/);
      expect(await attempt(app, `CREATE ROLE zz_evil LOGIN`)).toMatch(/permission denied/);
      expect(await attempt(app, `SET ROLE opsiq_schema_owner`)).toMatch(/permission denied to set role/);
      expect(await attempt(app, `UPDATE _prisma_migrations SET logs = 'x'`)).toMatch(/permission denied/);
      // 6. nothing changed
      expect(await qboCounts(s.t)).toEqual(before);
      // 7. the ordinary application work the runtime exists for still works
      expect(await attempt(app, `SELECT count(*) FROM qbo_report_snapshots WHERE workspace_id=$1`, [s.t.ws])).toBe("OK");
      expect(await attempt(app, `UPDATE qbo_sync_state SET updated_at = now() WHERE workspace_id=$1`, [s.t.ws])).toBe("OK");
    } finally { await app.end(); }
  }, 180_000);
});

const del = (t: Pick<QboTenant, "ws" | "biz">) => `DELETE FROM qbo_report_snapshots WHERE workspace_id='${t.ws}' AND business_id='${t.biz}'`;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] least-privilege role model — hostile OPERATOR login (the eraser can still only do the governed deletion)", () => {
  it("the eraser cannot do DDL, touch unrelated tables, skip a lifecycle step, approve its own request, or delete with a request that is not EXECUTING in the same transaction", async () => {
    const s = await seedHistory({ diagnose: false });
    const op = await asUser("erasure_operator_t");
    const op2 = await asUser("erasure_operator_t2");
    try {
      const before = await qboCounts(s.t);
      const forge = `SELECT set_config('opsiq.erasure_request_id', $1, true)`;
      // no DDL, no tables outside the registry, nothing on the migration history
      expect(await attempt(op, `ALTER TABLE qbo_report_snapshots DISABLE TRIGGER USER`)).toMatch(/must be owner/);
      expect(await attempt(op, `CREATE OR REPLACE FUNCTION qbo_erasure_authorized(uuid, uuid) RETURNS boolean AS $f$ SELECT true $f$ LANGUAGE sql`)).toMatch(/must be owner|permission denied for schema public/);
      expect(await attempt(op, `GRANT opsiq_privacy_eraser TO erasure_operator_t`)).toMatch(/permission denied|must have admin option/);
      expect(await attempt(op, `TRUNCATE qbo_report_snapshots`)).toMatch(/permission denied/);
      expect(await attempt(op, `DELETE FROM owner_businesses WHERE id=$1`, [s.t.biz])).toMatch(/permission denied/);
      expect(await attempt(op, `UPDATE owner_businesses SET name = 'x' WHERE id=$1`, [s.t.biz])).toMatch(/permission denied/);
      expect(await attempt(op, `SELECT 1 FROM _prisma_migrations`)).toMatch(/permission denied/);
      expect(await attempt(op, `DELETE FROM privacy_erasure_requests`)).toMatch(/tombstone|cannot be deleted|permission denied/);

      // lifecycle: a bare request cannot jump anywhere
      const { id } = await createErasureRequest(op, { scope: { workspaceId: s.t.ws, businessId: s.t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: "operator-a" });
      const row = async () => (await admin.query(`SELECT status, requested_db_user, approved_db_user, approved_by, manifest_hash, executing_xid FROM privacy_erasure_requests WHERE id=$1`, [id])).rows[0];
      expect(await row()).toMatchObject({ status: "REQUESTED", requested_db_user: "erasure_operator_t", approved_db_user: null });
      expect(await attempt(op, `UPDATE privacy_erasure_requests SET status='EXECUTING', approved_by='z', approved_at=now(), manifest_hash='h', updated_at=now() WHERE id=$1`, [id])).toMatch(/illegal privacy erasure transition/);
      expect(await attempt(op, `UPDATE privacy_erasure_requests SET status='APPROVED', approved_by='z', approved_at=now(), manifest_hash='h', updated_at=now() WHERE id=$1`, [id])).toMatch(/illegal privacy erasure transition/);
      // a forged INSERT can neither start in a later state nor claim another requester login
      expect(await attempt(op, `INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, status, requested_by, updated_at) VALUES (gen_random_uuid(), $1, $2, 'USER_DATA_ERASURE_REQUEST', 'EXECUTING', 'x', now())`, [s.t.ws, s.t.biz])).toMatch(/bare REQUESTED/);
      const forged = await op.query(`INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, status, requested_by, requested_db_user, updated_at) VALUES (gen_random_uuid(), $1, $2, 'USER_DATA_ERASURE_REQUEST', 'REQUESTED', 'x', 'somebody_else', now()) RETURNING requested_db_user`, [s.t.ws, s.t.biz]);
      expect(forged.rows[0].requested_db_user).toBe("erasure_operator_t");

      // dry run recorded: the SAME login cannot approve (the database stamps session_user itself), nor skip to EXECUTING
      const dry = await recordDryRun(op, id);
      expect(dry.blockers, JSON.stringify(dry.blockers)).toEqual([]);
      expect(await attempt(op, `UPDATE privacy_erasure_requests SET status='APPROVED', approved_by='operator-z', approved_at=now(), updated_at=now() WHERE id=$1`, [id])).toMatch(/must differ from the requesting login/);
      expect(await attempt(op, `UPDATE privacy_erasure_requests SET status='EXECUTING', updated_at=now() WHERE id=$1`, [id])).toMatch(/illegal privacy erasure transition/);
      await expect(approveErasureRequest(op, id, "operator-b")).rejects.toThrow(/different|login|two/i);
      // the approver cannot rewrite the recorded manifest while approving, and cannot choose which login is recorded
      expect(await attempt(op2, `UPDATE privacy_erasure_requests SET status='APPROVED', approved_by='operator-b', approved_at=now(), manifest_hash='0000', updated_at=now() WHERE id=$1`, [id])).toMatch(/binds to the recorded dry-run manifest/);
      await op2.query(`UPDATE privacy_erasure_requests SET status='APPROVED', approved_by='operator-b', approved_db_user='forged_login', approved_at=now(), updated_at=now() WHERE id=$1`, [id]);
      expect(await row()).toMatchObject({ status: "APPROVED", approved_db_user: "erasure_operator_t2", requested_db_user: "erasure_operator_t" });
      // approval and manifest are frozen from here on
      expect(await attempt(op2, `UPDATE privacy_erasure_requests SET manifest_hash='0000', updated_at=now() WHERE id=$1`, [id])).toMatch(/immutable once approved/);

      // APPROVED is not enough to delete, with or without the setting
      expect(await attempt(op, del(s.t), [], [[forge, [id]]])).toMatch(/immutable evidence/);
      // a COMMITTED EXECUTING row authorizes nothing in a later transaction (the claim is bound to the claiming transaction's xid)
      await op.query("BEGIN");
      await op.query(`UPDATE privacy_erasure_requests SET status='EXECUTING', updated_at=now() WHERE id=$1`, [id]);
      await op.query("COMMIT");
      expect((await row()).status).toBe("EXECUTING");
      expect(await attempt(op, del(s.t), [], [[forge, [id]]])).toMatch(/immutable evidence/);
      expect(await attempt(op2, del(s.t), [], [[forge, [id]]])).toMatch(/immutable evidence/);
      expect(await qboCounts(s.t)).toEqual(before);
    } finally { await op.end(); await op2.end(); }
  }, 180_000);
});

/* ───────── P4: every classified derived family, seeded with real rows and checked directly ───────── */
const ins = (table: string, o: Record<string, unknown>) => {
  const keys = Object.keys(o);
  return admin.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map((k) => o[k]));
};
const LEARNING_CHILDREN = [
  "controlled_learning_candidate_audit_entries", "controlled_learning_consent_records", "controlled_learning_harm_events", "controlled_learning_privacy_controls",
  "controlled_learning_regression_results", "controlled_learning_rejections", "controlled_learning_reviews", "controlled_learning_rollback_events",
  "controlled_learning_rollout_flags", "controlled_learning_attribution_reviews",
] as const;

/** Learning candidate + ALL child rows hanging off a QuickBooks-derived action / outcome / decision. */
async function seedLearning(t: QboTenant, actionId: string, outcomeId: string, decisionId: string) {
  const now = new Date();
  const cand = `lc_${randomUUID()}`;
  await ins("controlled_learning_candidates", { id: cand, workspaceId: t.ws, businessId: t.biz, sourceOwnerDecisionId: decisionId, sourceActionId: actionId, sourceOutcomeId: outcomeId, eligibilityStatus: "ELIGIBLE", rejectionReasons: "[]", evidenceSourceType: "x", evidenceSummary: "derived from QuickBooks-based outcome", auditFingerprint: randomUUID(), metadata: "{}", updatedAt: now });
  const base = { workspaceId: t.ws, candidateId: cand, updatedAt: now };
  const harm = `h_${randomUUID()}`;
  await ins("controlled_learning_candidate_audit_entries", { id: `c_${randomUUID()}`, workspaceId: t.ws, candidateId: cand, action: "a", detail: "d", timestamp: now });
  await ins("controlled_learning_consent_records", { id: `c_${randomUUID()}`, ...base, consentGiven: true, consentBy: "u", consentAt: now, consentScope: "s", consentNotes: "n" });
  await ins("controlled_learning_harm_events", { id: harm, ...base, harmType: "x", severity: "LOW", detectedBy: "u", detectedAt: now, harmDescription: "d" });
  await ins("controlled_learning_privacy_controls", { id: `c_${randomUUID()}`, ...base, controlType: "x", appliedBy: "u", appliedAt: now, reason: "r" });
  await ins("controlled_learning_regression_results", { id: `c_${randomUUID()}`, ...base, testRunId: "t", testVerdict: "PASS", regressionScore: 1, testedBy: "u", testedAt: now, testNotes: "n" });
  await ins("controlled_learning_rejections", { id: `c_${randomUUID()}`, ...base, rejectedBy: "u", rejectedAt: now, rejectionReason: "r", rejectionCode: "c" });
  await ins("controlled_learning_reviews", { id: `c_${randomUUID()}`, ...base, reviewerId: "u", decision: "APPROVE", reviewNotes: "n", reviewedAt: now });
  await ins("controlled_learning_rollback_events", { id: `c_${randomUUID()}`, ...base, rolledBackBy: "u", rolledBackAt: now, rollbackReason: "r", rollbackCode: "c" });
  await ins("controlled_learning_rollout_flags", { id: `c_${randomUUID()}`, ...base, rolloutStage: "s", rolloutPct: 1, enabledBy: "u", enabledAt: now, flagNotes: "n" });
  await ins("controlled_learning_attribution_reviews", { id: `c_${randomUUID()}`, ...base, harmEventId: harm, reviewedBy: "u", reviewedAt: now, verdict: "v", confidenceScore: 0.5, reviewNotes: "n" });
  return cand;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] every derived family is erased, directly (P4)", () => {
  it("action outcomes, learning candidates + 10 child tables, approval evidence, first-result interactions, operating memory on every source id, budget plans", async () => {
    const s = await seedHistory({ diagnose: true });
    const other = await seedHistory({ diagnose: true });
    const soft = await seedSoftFamily(s.t, s.cycle.id);
    const oSoft = await seedSoftFamily(other.t, other.cycle.id);
    const now = new Date();
    const mk = async (t: QboTenant, sf: { actionId: string; decisionId: string }, tag: string) => {
      const outcomeId = `o_${randomUUID()}`;
      await ins("owner_action_outcomes", { id: outcomeId, workspaceId: t.ws, businessId: t.biz, actionId: sf.actionId, outcomeStatus: "x", updatedAt: now });
      const cand = await seedLearning(t, sf.actionId, outcomeId, sf.decisionId);
      const approval = (await admin.query(`SELECT id FROM owner_approval_requests WHERE workspace_id=$1 LIMIT 1`, [t.ws])).rows[0].id;
      await admin.query(`INSERT INTO owner_approval_evidences (workspace_id, approval_id, evidence_type, description, submitted_by) VALUES ($1,$2,'NOTE','derived',$3)`, [t.ws, approval, t.actor]);
      const snap = (await admin.query(`SELECT id FROM owner_financial_snapshots WHERE workspace_id=$1 LIMIT 1`, [t.ws])).rows[0].id;
      await ins("owner_first_result_interactions", { id: randomUUID(), workspace_id: t.ws, business_id: t.biz, snapshot_id: snap, kind: "RESULT_VIEWED", idempotency_key: `${tag}-${randomUUID()}`, created_by: t.actor });
      for (const src of [outcomeId, cand]) await admin.query(`INSERT INTO operating_memory_entries (workspace_id, memory_type, source_model, source_id, key, summary, data) VALUES ($1,'OUTCOME','X',$2,'k','derived from QuickBooks figures','{"v":1}'::jsonb)`, [t.ws, src]);
      // budget plans: one written after the first QuickBooks import (derived), one long before it (owner history), plus a plan linked to a derived reassessment
      const mkBudget = async (reId: string, planId: string, createdAt: Date | null) => {
        await ins("budget_reassessments", { id: reId, workspace_id: t.ws, business_id: t.biz, trigger_event_id: `ev-${reId}`, trigger_class: "x", mode: "m", confidence: "c", top_constraint: "t", next_best_action: "n", decision_type: "d", plan: JSON.stringify({ revenue: 20_000 }), ...(createdAt ? { created_at: createdAt } : {}) });
        await ins("budget_plan_snapshots", { id: planId, workspace_id: t.ws, business_id: t.biz, reassessment_id: reId, version: 1, mode: "m", confidence: "c", plan: JSON.stringify({ revenue: 20_000 }), ...(createdAt ? { created_at: createdAt } : {}) });
      };
      const derived = { re: randomUUID(), plan: randomUUID() };
      const old = { re: randomUUID(), plan: randomUUID() };
      await mkBudget(derived.re, derived.plan, null);
      await mkBudget(old.re, old.plan, new Date("2001-01-01T00:00:00Z"));
      return { outcomeId, cand, derived, old };
    };
    const mine = await mk(s.t, soft, "a");
    const theirs = await mk(other.t, oSoft, "b");

    const fam = async (t: QboTenant) => ({
      outcomes: await count(`SELECT count(*)::int AS n FROM owner_action_outcomes WHERE "workspaceId"=$1`, [t.ws]),
      candidates: await count(`SELECT count(*)::int AS n FROM controlled_learning_candidates WHERE "workspaceId"=$1`, [t.ws]),
      children: await count(LEARNING_CHILDREN.map((x) => `SELECT count(*) FROM "${x}" WHERE "workspaceId"='${t.ws}'`).join(" UNION ALL ").replace(/^/, "SELECT sum(count)::int AS n FROM (") + ") q"),
      evidence: await count(`SELECT count(*)::int AS n FROM owner_approval_evidences WHERE workspace_id=$1`, [t.ws]),
      firstResult: await count(`SELECT count(*)::int AS n FROM owner_first_result_interactions WHERE workspace_id=$1`, [t.ws]),
      memory: await count(`SELECT count(*)::int AS n FROM operating_memory_entries WHERE workspace_id=$1`, [t.ws]),
      assignments: await count(`SELECT count(*)::int AS n FROM owner_action_assignments WHERE workspace_id=$1`, [t.ws]),
      budgetRe: await count(`SELECT count(*)::int AS n FROM budget_reassessments WHERE workspace_id=$1`, [t.ws]),
      budgetPlans: await count(`SELECT count(*)::int AS n FROM budget_plan_snapshots WHERE workspace_id=$1`, [t.ws]),
    });
    const before = await fam(s.t);
    expect(before).toMatchObject({ outcomes: 1, candidates: 1, children: 10, evidence: 1, firstResult: 1, assignments: 1, budgetRe: 2, budgetPlans: 2 });
    expect(before.memory).toBe(3);
    const otherBefore = await fam(other.t);

    const { res } = await runErasure(s.t);
    expect(res.verification.result).toBe("PASS");
    expect(await fam(s.t)).toEqual({ outcomes: 0, candidates: 0, children: 0, evidence: 0, firstResult: 0, memory: 0, assignments: 0, budgetRe: 1, budgetPlans: 1 });
    // the pre-import budget history is the owner's and stays; only the post-import plan (and the plan linked to it) went
    expect(await count(`SELECT count(*)::int AS n FROM budget_reassessments WHERE id=$1`, [mine.old.re])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM budget_plan_snapshots WHERE id=$1`, [mine.old.plan])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM budget_plan_snapshots WHERE id=$1`, [mine.derived.plan])).toBe(0);
    expect(res.counts).toMatchObject({ owner_action_outcomes: 1, controlled_learning_candidates: 1, owner_first_result_interactions: 1, budget_reassessments: 1, budget_plan_snapshots: 1, operating_memory_entries: 3 });
    expect(await fam(other.t)).toEqual(otherBefore); // the other tenant: nothing touched
    expect(theirs.cand).toBeTruthy();
  }, 240_000);

  it("a PROMOTED / ADMITTED learning candidate derived from QuickBooks is a BLOCKER: nothing is erased", async () => {
    const s = await seedHistory({ diagnose: true });
    const soft = await seedSoftFamily(s.t, s.cycle.id);
    const outcomeId = `o_${randomUUID()}`;
    await ins("owner_action_outcomes", { id: outcomeId, workspaceId: s.t.ws, businessId: s.t.biz, actionId: soft.actionId, outcomeStatus: "x", updatedAt: new Date() });
    const cand = await seedLearning(s.t, soft.actionId, outcomeId, soft.decisionId);
    await ins("controlled_learning_admissions", { id: `a_${randomUUID()}`, workspaceId: s.t.ws, candidateId: cand, admittedBy: "u", admittedAt: new Date(), sourceLabel: "s", evidenceOrigin: "e", eligibilityStatus: "ELIGIBLE", admissionNotes: "n", updatedAt: new Date() });
    const before = await qboCounts(s.t);
    const c = await asUser("erasure_operator_t");
    try {
      const { id } = await createErasureRequest(c, { scope: { workspaceId: s.t.ws, businessId: s.t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: "operator-a" });
      const dry = await recordDryRun(c, id);
      expect(dry.blockers.map((b) => b.code)).toContain("LEARNING_PROMOTED_REQUIRES_REVIEW");
      await approve2(id, "operator-b").catch(() => undefined);
      await expect(executeQboErasure(c, { requestId: id, confirmToken: dry.confirmToken })).rejects.toThrow();
    } finally { await c.end(); }
    expect(await qboCounts(s.t)).toEqual(before);
    expect(await count(`SELECT count(*)::int AS n FROM controlled_learning_candidates WHERE "workspaceId"=$1`, [s.t.ws])).toBe(1);
  }, 240_000);
});

/**
 * Schema-wide drift guard. Every public table that carries a soft-link-looking column (…action/cycle/snapshot/decision/… id) must be either
 * HANDLED by the erasure or in this REVIEWED list. The reviewed tables are not erased by id, but they are NOT unprotected: the dry-run
 * residue scan inspects every column of every table, so any row that actually references an erased id / realm id / company name is a
 * BLOCKER. A NEW table with such a column fails this test until a human classifies it (handle it, or add it here with that reasoning).
 */
const REVIEWED_NOT_HANDLED = [
  "business_condition_profiles", "case_benchmark_results", "delegated_tasks", "external_connection_consents", "external_oauth_tokens", "external_sync_jobs",
  "goal_arbitration_records", "operational_events", "owner_budget_overrides", "owner_marketing_actions", "owner_marketing_cycles",
  "owner_marketing_findings", "owner_marketing_verifications", "owner_operations_actions", "owner_operations_cycles", "owner_operations_findings",
  "owner_operations_verifications", "owner_reassessment_events", "owner_sales_actions", "owner_sales_cycles", "owner_sales_findings", "owner_sales_verifications",
  "owner_sop_actions", "owner_sop_cycles", "owner_sop_findings", "owner_sop_verifications", "owner_startup_session", "owner_strategy_actions",
  "owner_strategy_cycles", "owner_strategy_findings", "owner_strategy_verifications", "process_execution_tasks", "recommendations", "recommendations_legacy",
  "recovery_actions", "recovery_cycles", "recovery_findings", "recovery_verifications", "startup_execution_blueprint", "startup_execution_plans",
  "startup_initiatives", "startup_owner_decision",
];
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] schema-wide soft-link coverage", () => {
  it("every table with a soft-link-looking column is handled or explicitly reviewed (a new one fails until classified)", async () => {
    const { HANDLED_TABLES } = await import("@/services/privacy-erasure/qbo-erasure.service");
    const r = await admin.query(
      `SELECT DISTINCT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped JOIN pg_type ty ON ty.oid=a.atttypid
       WHERE n.nspname='public' AND c.relkind='r' AND ty.typname IN ('uuid','text','varchar','jsonb','json')
       AND a.attname ~* '(action|cycle|snapshot|decision|assessment|outcome|candidate|verification|finding|approval|diagnosis|connection|reassessment|signal|source)_?id'
       AND c.relname NOT LIKE 'controlled_learning_%' ORDER BY 1`);
    const unclassified = r.rows.map((x: any) => x.t as string).filter((t) => !HANDLED_TABLES.has(t) && !REVIEWED_NOT_HANDLED.includes(t) && !t.startsWith("qbo_"));
    expect(unclassified).toEqual([]);
    // the reviewed list must not rot: every entry still exists
    const existing = new Set(r.rows.map((x: any) => x.t as string));
    expect(REVIEWED_NOT_HANDLED.filter((t) => !existing.has(t))).toEqual([]);
  });
  async function budgetActionFor(t: QboTenant, re: string, extra: Record<string, unknown>) {
    const cols = (await admin.query(`SELECT a.attname AS n, ty.typname AS ty, a.attnotnull AS nn, a.atthasdef AS hd FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type ty ON ty.oid=a.atttypid WHERE c.relname='owner_budget_actions' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
    const row: Record<string, unknown> = {};
    for (const c of cols) {
      if (!c.nn || c.hd) continue;
      row[c.n] = c.n === "workspace_id" ? t.ws : c.n === "business_id" ? t.biz : c.ty === "uuid" ? randomUUID() : c.ty === "int4" ? 1 : c.ty === "timestamp" || c.ty === "timestamptz" ? new Date() : c.ty === "bool" ? false : c.ty === "jsonb" ? "{}" : `x-${randomUUID()}`;
    }
    await ins("owner_budget_actions", { ...row, reassessment_id: re, ...extra });
  }
  const seedReassessment = async (t: QboTenant) => {
    const re = randomUUID();
    await ins("budget_reassessments", { id: re, workspace_id: t.ws, business_id: t.biz, trigger_event_id: `ev-${re}`, trigger_class: "x", mode: "m", confidence: "c", top_constraint: "t", next_best_action: "n", decision_type: "d", plan: "{}" });
    return re;
  };
  it("budget actions: a system-authored one is erased with its plan; one carrying an owner-recorded completion is a BLOCKER (never silently destroyed)", async () => {
    const a = await seedHistory({ diagnose: false });
    const reA = await seedReassessment(a.t);
    await budgetActionFor(a.t, reA, {});
    const { res } = await runErasure(a.t);
    expect(res.verification.result).toBe("PASS");
    expect(await count(`SELECT count(*)::int AS n FROM owner_budget_actions WHERE workspace_id=$1`, [a.t.ws])).toBe(0);
    expect(res.counts).toMatchObject({ owner_budget_actions: 1, budget_reassessments: 1 });

    const b = await seedHistory({ diagnose: false });
    const reB = await seedReassessment(b.t);
    await budgetActionFor(b.t, reB, { completion_notes: "I did this myself and wrote it down" });
    const c = await asUser("erasure_operator_t");
    try {
      const { id } = await createErasureRequest(c, { scope: { workspaceId: b.t.ws, businessId: b.t.biz }, reasonCode: "USER_DATA_ERASURE_REQUEST", requestedBy: "operator-a" });
      const dry = await recordDryRun(c, id);
      expect(dry.blockers.map((x) => x.code)).toContain("BUDGET_ACTION_OWNER_COMPLETION_REQUIRES_REVIEW");
    } finally { await c.end(); }
    expect(await count(`SELECT count(*)::int AS n FROM owner_budget_actions WHERE workspace_id=$1`, [b.t.ws])).toBe(1);
  }, 240_000);
});

/* ───────── P5: mixed authorship, hostile ───────── */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] mixed authorship (P5)", () => {
  const QBO_FIN_COLS = ["cost_of_goods", "overdue_receivables", "payables", "overdue_payables"] as const;

  it("FINANCE: QuickBooks fills the six fields, the owner amends one, later a second, QuickBooks syncs the others, then erasure: only the owner's two figures survive", async () => {
    const s = await seedHistory({ diagnose: false });
    const period = D(s.latestKey);
    const head = async () => (await admin.query(`SELECT * FROM owner_financial_snapshots WHERE workspace_id=$1 AND business_id=$2 AND period_start=$3 AND superseded_by_id IS NULL`, [s.t.ws, s.t.biz, period])).rows[0];
    const v1 = await head();
    expect(Number(v1.revenue)).toBeGreaterThan(0);
    for (const col of ["revenue", "cost_of_goods", "receivables", "overdue_receivables", "payables", "overdue_payables"]) expect(v1[col], col).not.toBeNull();

    const a1 = (await amendFinancialSnapshot(v1.id, { amendmentReason: "owner restated revenue", revenue: 31_000 } as any, s.t.actor, s.t.ws)).snapshot as any;
    const a2 = (await amendFinancialSnapshot(a1.id, { amendmentReason: "owner corrected receivables", receivables: 9_500 } as any, s.t.actor, s.t.ws)).snapshot as any;
    // QuickBooks later reports different values for the OTHER fields
    s.f.books.set(s.latestKey, { ...books(0), cogs: 9_500, arTotal: 8_500, apTotal: 6_500 });
    await new Promise((r) => setTimeout(r, 1100));
    await runQboSync({ workspaceId: s.t.ws, connectionId: s.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => s.f.reader });
    const before = await head();
    expect(Number(before.revenue)).toBe(31_000); // owner-controlled figures are never overwritten by QuickBooks
    expect(Number(before.receivables)).toBe(9_500);
    const chainBefore = await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots WHERE workspace_id=$1 AND business_id=$2 AND period_start=$3`, [s.t.ws, s.t.biz, period]);
    expect(chainBefore).toBeGreaterThanOrEqual(3);

    const { res } = await runErasure(s.t);
    expect(res.verification.result).toBe("PASS");
    const rows = (await admin.query(`SELECT * FROM owner_financial_snapshots WHERE workspace_id=$1 AND business_id=$2 AND period_start=$3`, [s.t.ws, s.t.biz, period])).rows;
    expect(rows).toHaveLength(1); // every superseded QuickBooks-touched version is gone
    const kept = rows[0];
    expect(kept.superseded_by_id).toBeNull();
    expect(Number(kept.revenue)).toBe(31_000);
    expect(Number(kept.receivables)).toBe(9_500);
    for (const col of QBO_FIN_COLS) expect(kept[col], col).toBeNull();
    expect(kept.notes).toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM qbo_canonical_provenance WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
    // the remaining chain is valid: no dangling pointer, exactly one head
    expect(await count(`SELECT count(*)::int AS n FROM owner_financial_snapshots x WHERE x.workspace_id=$1 AND x.superseded_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM owner_financial_snapshots y WHERE y.id = x.superseded_by_id)`, [s.t.ws])).toBe(0);
    expect(a2.id).toBeTruthy();
    // the erased-away confidence is recomputed from what is actually left (never from the deleted QuickBooks figures)
    expect(kept.missing_critical_data).toBeTruthy();
  }, 240_000);

  it("CASHFLOW fails closed: an owner write after QuickBooks keeps only the owner's untouched columns; an owner edit of a QuickBooks-attributed column cannot be told apart, so it is cleared", async () => {
    const s = await seedHistory({ diagnose: false });
    const row = (await admin.query(`SELECT id FROM owner_cashflow_snapshots WHERE workspace_id=$1 AND business_id=$2 ORDER BY period_start DESC LIMIT 1`, [s.t.ws, s.t.biz])).rows[0];
    await new Promise((r) => setTimeout(r, 50));
    await admin.query(`UPDATE owner_cashflow_snapshots SET rent_due = 900, bank_balance = 777, updated_at = now() WHERE id = $1`, [row.id]);
    const other = (await admin.query(`SELECT id FROM owner_cashflow_snapshots WHERE workspace_id=$1 AND business_id=$2 AND id <> $3 ORDER BY period_start DESC LIMIT 1`, [s.t.ws, s.t.biz, row.id])).rows[0];
    const otherBefore = (await admin.query(`SELECT bank_balance FROM owner_cashflow_snapshots WHERE id=$1`, [other.id])).rows[0];
    expect(otherBefore.bank_balance).not.toBeNull();

    const { res } = await runErasure(s.t);
    expect(res.verification.result).toBe("PASS");
    const kept = (await admin.query(`SELECT rent_due, bank_balance, receivables, notes FROM owner_cashflow_snapshots WHERE id=$1`, [row.id])).rows[0];
    expect(Number(kept.rent_due)).toBe(900); // owner-only column survives
    expect(kept.bank_balance).toBeNull(); // QuickBooks-attributed column: authorship per field is unknowable, so FAIL CLOSED
    expect(kept.receivables).toBeNull();
    expect(kept.notes).toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM owner_cashflow_snapshots WHERE id=$1`, [other.id])).toBe(0); // untouched since QuickBooks: whole row deleted
    expect(res.counts).toMatchObject({ owner_cashflow_snapshots_scrubbed: 1 });
  }, 240_000);
});

/* ───────── P6: revocation-failure semantics, through the REAL disconnect path (policy B) ───────── */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] revocation outcomes never block erasure and never leave a way to keep processing (P6)", () => {
  type Scenario = { name: string; expect: string; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; preDisconnect?: boolean; hookThrows?: boolean; maxMs?: number };
  const hang = (url: string, init?: RequestInit) => new Promise<Response>((_, rej) => { init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); });
  const SCENARIOS: Scenario[] = [
    { name: "revoke succeeds", expect: "REVOKED", fetchImpl: async () => new Response("{}", { status: 200 }) },
    { name: "provider error (503)", expect: "FAILED", fetchImpl: async () => new Response("{}", { status: 503 }) },
    { name: "network failure", expect: "FAILED", fetchImpl: async () => { throw new TypeError("fetch failed"); } },
    { name: "Intuit hangs until the client timeout", expect: "FAILED", fetchImpl: hang, maxMs: 60_000 },
    { name: "token already invalid at Intuit (invalid_grant)", expect: "ALREADY_INVALID", fetchImpl: async () => new Response('{"error":"invalid_grant"}', { status: 400 }) },
    { name: "connection already disconnected by the owner", expect: "NOT_NEEDED", preDisconnect: true, fetchImpl: async () => new Response("{}", { status: 200 }) },
    { name: "the revoke hook itself blows up", expect: "FAILED", hookThrows: true },
  ];
  for (const sc of SCENARIOS) {
    it(`${sc.name}: erasure completes, no token material remains, nothing can process the business afterwards (${sc.expect})`, async () => {
      const s = await seedHistory({ diagnose: false });
      const calls: string[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => { calls.push(url); return (sc.fetchImpl ?? (async () => new Response("{}", { status: 200 })))(url, init); }) as never;
      if (sc.preDisconnect) await disconnectQuickBooks({ workspaceId: s.t.ws, businessId: s.t.biz, actorId: s.t.actor }, { env, fetchImpl });
      const callsBeforeErasure = calls.length;
      const revoke: RevokeHook = async (scope) => {
        if (sc.hookThrows) throw new Error("db hiccup");
        return (await disconnectQuickBooks({ workspaceId: scope.workspaceId, businessId: scope.businessId, actorId: s.t.actor }, { env, fetchImpl })).revocation as never;
      };
      const { id, res } = await runErasure(s.t, { revoke });
      expect(res.revocation).toBe(sc.expect);
      expect(res.verification.result).toBe("PASS");
      // local erasure never depends on Intuit: no credential, connection, sync marker or history remains
      expect(await qboCounts(s.t)).toMatchObject({ connections: 0, tokens: 0, syncState: 0, observations: 0, provenance: 0, tasks: 0 });
      expect(await count(`SELECT count(*)::int AS n FROM qbo_connection_tokens WHERE workspace_id=$1`, [s.t.ws])).toBe(0);
      // the revocation attempt happened at most once (no retry loop that would need the token kept) and never for a connection that was already gone
      expect(calls.length - callsBeforeErasure).toBe(sc.hookThrows || sc.preDisconnect ? 0 : 1);
      // the tombstone records the outcome code only (no token, realm, company or provider text)
      const tomb = (await admin.query(`SELECT result_counts FROM privacy_erasure_requests WHERE id=$1`, [id])).rows[0].result_counts;
      expect(tomb.revocation).toBe(sc.expect);
      expect(JSON.stringify(tomb)).not.toMatch(new RegExp(`${s.realmId}|Erasure Test Co|refresh|access_token|intuit_tid`, "i"));
      // PROCESSING STOPS EVEN IF INTUIT STILL TRUSTS THE GRANT: a late webhook, the daily producer and a ghost sync task do nothing and make no provider call
      const total = calls.length;
      expect(await reactToQboWebhook({ realmIds: [s.realmId] }, { env })).toEqual({ realmsReceived: 1, connectionsTriggered: 0 });
      await enqueueDueQboSyncTasks(new Date());
      expect(await count(`SELECT count(*)::int AS n FROM scheduled_tasks WHERE workspace_id=$1 AND task_name='qbo-sync'`, [s.t.ws])).toBe(0);
      const { taskId } = await enqueueQboSync({ workspaceId: s.t.ws, connectionId: s.connectionId, trigger: "SCHEDULED", key: qboSyncKey(s.connectionId, "ghost-p6", new Date()) });
      await db.scheduledTask.update({ where: { id: taskId }, data: { scheduledFor: new Date(Date.now() - 1000) } });
      const readerCalls = s.f.calls.length;
      const handlers = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env, readClientFactory: () => s.f.reader }))]]);
      await new DatabaseSchedulerProvider().processTaskById(taskId, handlers);
      expect(s.f.calls.length).toBe(readerCalls);
      expect(calls.length).toBe(total);
      expect(await qboCounts(s.t)).toMatchObject({ connections: 0, observations: 0, provenance: 0, financeSnapshots: 0, cashflowSnapshots: 0 });
      await db.scheduledTask.deleteMany({ where: { id: taskId } });
    }, sc.maxMs ?? 180_000);
  }
});

/* ───────── P9: the tombstone is minimal ───────── */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] erasure tombstone minimisation (P9)", () => {
  it("only opaque ids, operator refs, timestamps, status and counts can be stored; nothing Intuit-derived, after a real erasure either", async () => {
    const cols = (await admin.query(`SELECT column_name FROM information_schema.columns WHERE table_name='privacy_erasure_requests' ORDER BY 1`)).rows.map((r: any) => r.column_name);
    expect(cols).toEqual([
      "approved_at", "approved_by", "approved_db_user", "business_id", "created_at", "dry_run_at", "executed_at", "executing_xid", "id", "manifest_hash",
      "privacy_request_id", "reason_code", "requested_by", "requested_db_user", "result_code", "result_counts", "scope", "status", "updated_at", "workspace_id",
    ]);
    const s = await seedHistory({ diagnose: true });
    const { id } = await runErasure(s.t, { revoke: async () => "REVOKED" });
    const row = (await admin.query(`SELECT * FROM privacy_erasure_requests WHERE id=$1`, [id])).rows[0];
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(s.realmId);
    expect(dump).not.toContain("Erasure Test Co");
    expect(dump).not.toMatch(/refresh_token|access_token|intuit_tid|company_name|realm_id|realmId/i);
    for (const v of Object.values(row.result_counts as Record<string, unknown>)) expect(["number", "string"]).toContain(typeof v); // counts and the revocation code only
  }, 240_000);
});
