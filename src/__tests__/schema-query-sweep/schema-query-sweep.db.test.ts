/**
 * Wave 1 — RUNTIME_SCHEMA_QUERY_SWEEP. DB proof.
 *
 * Action/KPI/Finding have no workspaceId column; many services filtered them by a flat `workspaceId`,
 * throwing PrismaClientValidationError at runtime. This wave rescoped those queries via the `engagement`
 * relation. These tests drive representative fixed paths against a real DB and prove: the query no longer
 * throws, correct-workspace rows are returned, cross-workspace rows are excluded (isolation), legitimate
 * empty results return empty (not a 500), updateMany/snapshot writes succeed, and no static fallback is used.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/schema-query-sweep/schema-query-sweep.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getActionById } from "@/services/action";
import { getKPIsForEngagement, updateKPIValue } from "@/services/kpi";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface WS { actorId: string; workspaceId: string; clientId: string; engagementId: string; }

async function seedWorkspace(tag: string): Promise<WS> {
  const actorId = randomUUID(), workspaceId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `sweep-${tag}-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: `WS ${tag}`, slug: `sweep-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  await db.clientAccount.create({ data: { id: clientId, name: `Client ${tag}`, createdBy: actorId, updatedAt: new Date() } });
  await db.engagement.create({ data: { id: engagementId, code: `ENG-${engagementId.substring(0, 8)}`, title: `Eng ${tag}`, clientId, serviceTier: "diagnostic", engagementMode: "advisory", workspaceId, updatedAt: new Date() } });
  return { actorId, workspaceId, clientId, engagementId };
}

async function cleanup(ws: WS) {
  await db.kPISnapshot.deleteMany({ where: { kpi: { engagementId: ws.engagementId } } }).catch(() => undefined);
  await db.kPI.deleteMany({ where: { engagementId: ws.engagementId } }).catch(() => undefined);
  await db.action.deleteMany({ where: { engagementId: ws.engagementId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.engagement.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.clientAccount.delete({ where: { id: ws.clientId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: ws.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: ws.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: ws.actorId } }).catch(() => undefined);
}

function ctxFor(ws: WS): CanonicalAuthContext {
  return {
    verifiedActorId: ws.actorId, verifiedActorType: "user",
    verifiedActor: { id: ws.actorId, email: "sweep@example.com", name: "Sweep", isActive: true },
    verifiedWorkspaceId: ws.workspaceId, verifiedCapabilities: new Set<string>(),
    verifiedSessionSnapshot: { snapshotId: "s", snapshotTimestamp: new Date(), snapshotHash: "", actorId: ws.actorId, workspaceId: ws.workspaceId, capabilities: [] },
  } as CanonicalAuthContext;
}

async function seedAction(ws: WS): Promise<string> {
  const id = randomUUID();
  await db.action.create({ data: { id, engagementId: ws.engagementId, title: "Act", status: "open", updatedAt: new Date() } });
  return id;
}
async function seedKpi(ws: WS): Promise<string> {
  const id = randomUUID();
  await db.kPI.create({ data: { id, engagementId: ws.engagementId, name: "Revenue", direction: "up", currentValue: 10, target: 100, version: 1, updatedAt: new Date() } });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 1 schema-query sweep — engagement-relation workspace scoping", () => {
  let A: WS, B: WS;
  beforeEach(async () => { A = await seedWorkspace("A"); B = await seedWorkspace("B"); });
  afterEach(async () => { await cleanup(A); await cleanup(B); });

  it("[db] getActionById (findFirst) returns the action for its workspace and does not throw", async () => {
    const actionId = await seedAction(A);
    const action = await getActionById(actionId, A.workspaceId);
    expect(action.id).toBe(actionId);
  });

  it("[db] getActionById excludes cross-workspace (isolation) — foreign workspace gets NotFound", async () => {
    const actionId = await seedAction(A);
    await expect(getActionById(actionId, B.workspaceId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] getKPIsForEngagement (findMany) returns the engagement's KPIs without throwing", async () => {
    const kpiId = await seedKpi(A);
    const kpis = await getKPIsForEngagement(A.engagementId, A.workspaceId);
    expect(kpis.map((k) => k.id)).toContain(kpiId);
  });

  it("[db] getKPIsForEngagement returns an empty array for an engagement with no KPIs (not a 500)", async () => {
    const kpis = await getKPIsForEngagement(B.engagementId, B.workspaceId);
    expect(Array.isArray(kpis)).toBe(true);
    expect(kpis).toHaveLength(0);
  });

  it("[db] updateKPIValue (updateMany + snapshot create + re-read) succeeds and persists", async () => {
    const kpiId = await seedKpi(A);
    const updated = await updateKPIValue(kpiId, { currentValue: 42, version: 1 } as any, ctxFor(A), A.workspaceId);
    expect(updated.currentValue).toBe(42);
    const snaps = await db.kPISnapshot.findMany({ where: { kpiId } });
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    expect(snaps.some((s) => s.value === 42)).toBe(true);
  });

  it("[db] updateKPIValue is workspace-scoped — a foreign workspace cannot update the KPI", async () => {
    const kpiId = await seedKpi(A);
    await expect(updateKPIValue(kpiId, { currentValue: 99, version: 1 } as any, ctxFor(B), B.workspaceId)).rejects.toBeInstanceOf(NotFoundError);
    const kpi = await db.kPI.findUnique({ where: { id: kpiId }, select: { currentValue: true } });
    expect(kpi?.currentValue).toBe(10); // untouched
  });
});
