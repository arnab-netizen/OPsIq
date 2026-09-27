/* eslint-disable @typescript-eslint/no-explicit-any -- route handlers are invoked with a mocked enforcement wrapper and return untyped JSON bodies */
/**
 * P1 — reading the owner decision performs no writes.
 *
 * Every SQL statement this process sends to Postgres goes through node-postgres `Client#query` (the
 * Prisma adapter and raw pool both use it). The test records each statement's text while a read runs
 * and classifies it: any INSERT / UPDATE / DELETE / MERGE / UPSERT / DDL / advisory lock is a write.
 * Proven on the real services and route handlers against real Postgres:
 *   - repeated getOwnerHome() → zero writes;
 *   - GET /api/owner/home → zero writes;
 *   - GET /api/owner/now-view → zero decision-history writes (no decision audit event, no advisory lock);
 *   - Portfolio (every business resolved at once) → zero decision-memory writes;
 *   - concurrent reads → zero audit events from the projection;
 *   - the workspace audit hash chain stays intact.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/owner-decision-read-only.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import pg from "pg";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown, params: Record<string, string>) => unknown) =>
    (ctx: unknown, params: Record<string, string>) =>
      handler(ctx, params),
}));

import { db } from "@/lib/db";
import { verifyAuditChainIntegrity } from "@/infra/audit";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getPortfolio } from "@/services/owner-portfolio/portfolio.service";
import { GET as homeGET } from "@/app/api/owner/home/route";
import { GET as nowViewGET } from "@/app/api/owner/now-view/route";

const actor = randomUUID();

/** Every SQL statement sent by this process while `capturing` is set. */
let captured: string[] | null = null;
const originalQuery = pg.Client.prototype.query;
function startCapture() {
  captured = [];
}
function stopCapture(): string[] {
  const out = captured ?? [];
  captured = null;
  return out;
}
const WRITE = /^\s*(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|copy)\b/i;
const LOCK = /pg_advisory(_xact)?_lock/i;
const writesOf = (sql: string[]) => sql.filter((s) => WRITE.test(s) || LOCK.test(s));

beforeAll(async () => {
  vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: any[]) {
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
    if (captured && typeof text === "string") captured.push(text);
    return (originalQuery as any).apply(this, args);
  });
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `readonly-${actor}@example.com`, name: "Read-only QA", isActive: true, updatedAt: new Date() },
  });
});

afterEach(() => {
  captured = null;
});

function period() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

async function seed(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  const sSnap = await createSalesSnapshot(b.id, {
    ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
    newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
  } as any, actor, workspaceId);
  await runSalesDiagnosis(b.id, sSnap.id, actor, workspaceId);
  const cf = await createCashflowSnapshot(b.id, {
    ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
    payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
  }, actor, workspaceId);
  await runCashflowDiagnosis(b.id, cf.id, actor, workspaceId);
  return b.id as string;
}

function ctx(workspaceId: string, path: string) {
  return { request: new Request(`http://localhost${path}`), verifiedWorkspaceId: workspaceId, verifiedActorId: actor } as any;
}

describe("[db] P1 — owner-decision reads perform zero persistence", () => {
  it("[db] repeated getOwnerHome(): zero write statements, zero audit events, identical decisions", async () => {
    const workspaceId = randomUUID();
    const businessId = await seed(workspaceId, "QA Read-only Home");
    const auditBefore = await db.auditEvent.count({ where: { workspaceId } });
    startCapture();
    const reads = [];
    for (let i = 0; i < 3; i++) reads.push((await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!);
    const sql = stopCapture();
    expect(sql.length).toBeGreaterThan(10); // the capture really saw the reads
    expect(writesOf(sql)).toEqual([]);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(auditBefore);
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: "owner.decision_changed" } })).toBe(0);
    // Deterministic without memory: every read gives the same decision and the same "what changed".
    for (const r of reads.slice(1)) {
      expect(r.primaryCandidateId).toBe(reads[0].primaryCandidateId);
      expect(r.whatChanged).toEqual(reads[0].whatChanged);
    }
    await teardownOwnerBusiness(businessId);
  });

  it("[db] GET /api/owner/home: zero write statements", async () => {
    const workspaceId = randomUUID();
    const businessId = await seed(workspaceId, "QA Read-only Home route");
    const auditBefore = await db.auditEvent.count({ where: { workspaceId } });
    startCapture();
    const body: any = await homeGET(ctx(workspaceId, `/api/owner/home?businessId=${businessId}`), {});
    const sql = stopCapture();
    expect(body.currentOwnerDecision.primaryTarget).not.toBeNull();
    expect(writesOf(sql)).toEqual([]);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(auditBefore);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] GET /api/owner/now-view: zero decision-history writes (no decision event, no advisory lock)", async () => {
    const workspaceId = randomUUID();
    const businessId = await seed(workspaceId, "QA Read-only Now View");
    const auditBefore = await db.auditEvent.count({ where: { workspaceId } });
    startCapture();
    const body: any = await nowViewGET(ctx(workspaceId, `/api/owner/now-view?businessId=${businessId}`), {});
    const sql = stopCapture();
    expect(body.ownerDecision.primaryTarget).not.toBeNull();
    expect(sql.filter((s) => LOCK.test(s))).toEqual([]);
    // Exact writes on this GET: only Now View's own guidance snapshot row (its pre-existing "what changed
    // since last check" history) — no decision memory, no audit event, nothing else.
    const writes = writesOf(sql);
    expect(writes.map((w) => w.replace(/\s+/g, " ").match(/^\s*insert into "?(?:public"?\.)?"?(\w+)"?/i)?.[1] ?? w.slice(0, 60))).toEqual(["owner_guidance_snapshots"]);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(auditBefore);
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: "owner.decision_changed" } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId, entityType: "OwnerDecision" } })).toBe(0);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] Portfolio (every business resolved at once): zero decision-memory writes", async () => {
    const workspaceId = randomUUID();
    const a = await seed(workspaceId, "QA Read-only Portfolio A");
    const b = await seed(workspaceId, "QA Read-only Portfolio B");
    const auditBefore = await db.auditEvent.count({ where: { workspaceId } });
    startCapture();
    await getPortfolio(workspaceId);
    const sql = stopCapture();
    expect(writesOf(sql)).toEqual([]);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(auditBefore);
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] concurrent reads: zero audit events from the projection, and the workspace audit chain stays intact", async () => {
    const workspaceId = randomUUID();
    const businessId = await seed(workspaceId, "QA Read-only Concurrency");
    const auditBefore = await db.auditEvent.count({ where: { workspaceId } });
    expect((await verifyAuditChainIntegrity(workspaceId)).isValid).toBe(true);
    startCapture();
    await Promise.all(Array.from({ length: 5 }, () => getOwnerHome(workspaceId, businessId)));
    const sql = stopCapture();
    expect(writesOf(sql)).toEqual([]);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(auditBefore);
    const chain = await verifyAuditChainIntegrity(workspaceId);
    expect(chain.isValid).toBe(true);
    expect(chain.eventsChecked).toBe(Math.max(0, auditBefore - 1));
    await teardownOwnerBusiness(businessId);
  });
});
