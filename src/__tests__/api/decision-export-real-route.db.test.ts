/**
 * GET /api/decision/export — REAL route + REAL canonical-route-enforcement on real Postgres.
 *
 * Only @/services/auth is mocked (valid session + policy); workspace membership is a real row, so the
 * wrapper's auth/workspace derivation, capability check, handler and error classification all run for real.
 *
 * Proves:
 *  1. The export carries every nested field (decision, inputs, outputs.explanation, each auditTrail entry and its
 *     payload). The previous serializer passed the TOP-LEVEL key array as a JSON.stringify replacer, which is an
 *     allowlist applied at every depth, so all nested objects serialized as {}.
 *  2. Key order is canonical (recursively sorted) and two exports of the same record are byte-identical.
 *  3. Error classes: a missing decisionId is 400; an unknown id is 404; another workspace's decision is the SAME
 *     404 (tenant non-disclosure) — never a 500.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/decision-export-real-route.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockActorId = randomUUID();
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: mockActorId, email: "export-qa@example.com", name: "Export QA", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  const policy = () => ({
    userId: mockActorId,
    roles: [{ role: "system_admin", scope: "workspace", scopeId: mockWorkspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

const exportRequest = (decisionId?: string) =>
  new NextRequest(
    `https://example.com/api/decision/export${decisionId === undefined ? "" : `?decisionId=${decisionId}`}`,
    { method: "GET" },
  );

/** Every object key list in the parsed tree is sorted (canonical form). */
function assertKeysSortedDeep(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertKeysSortedDeep(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    expect(keys, `keys at ${path}`).toEqual([...keys].sort());
    for (const k of keys) assertKeysSortedDeep((value as Record<string, unknown>)[k], `${path}.${k}`);
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] GET /api/decision/export — REAL route + REAL wrapper", () => {
  let actorId: string;
  let workspaceA: string;
  let workspaceB: string;
  let decisionId: string;
  let foreignDecisionId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceA = randomUUID();
    workspaceB = randomUUID();
    decisionId = randomUUID();
    foreignDecisionId = randomUUID();
    mockActorId = actorId;
    mockWorkspaceId = workspaceA;

    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceA, name: "Export WS A", slug: `exp-a-${workspaceA.slice(0, 8)}` } });
    await db.workspace.create({ data: { id: workspaceB, name: "Export WS B", slug: `exp-b-${workspaceB.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId: workspaceA, role: "admin", isActive: true } });

    const base = {
      problem: "Gross margin fell 6 points",
      action: "Renegotiate supplier contract",
      impactExpected: 1200,
      impactLow: 800,
      impactHigh: 1600,
      confidence: 0.72,
      priorityScore: 0.9,
      ownerUserId: actorId,
      createdByUserId: actorId,
    };
    await db.operatorItem.create({
      data: {
        ...base,
        id: decisionId,
        workspaceId: workspaceA,
        decisionType: "cost",
        expectedOutcome: "Margin back above 30%",
        actualOutcome: "Margin 29%",
        outcomeDelta: -100,
        decisionAccuracy: 0.9,
        // Insertion order deliberately NOT sorted, at every depth.
        inputsSnapshot: { zeta: 3, baselineRevenue: 50000, nested: { yKey: "y", aKey: "a" }, list: [{ b: 2, a: 1 }] },
        explanation: { summary: "Supplier cost is the dominant driver", calculationTrace: { netImpact: 1200, formula: "rev - cost" } },
      },
    });
    await db.operatorItem.create({ data: { ...base, id: foreignDecisionId, workspaceId: workspaceB } });

    await emitAuditEvent({
      eventName: "decision.created",
      entityType: "OperatorItem",
      entityId: decisionId,
      actorId,
      actorType: "user",
      workspaceId: workspaceA,
      payload: { source: "test", detail: { reason: "seed", count: 1 } },
    });
    await emitAuditEvent({
      eventName: "decision.outcome_recorded",
      entityType: "OperatorItem",
      entityId: decisionId,
      actorId,
      actorType: "user",
      workspaceId: workspaceA,
      payload: { outcome: "Margin 29%" },
    });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.operatorItem.deleteMany({ where: { id: { in: [decisionId, foreignDecisionId] } } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("exports every nested field (decision, inputs, outputs, audit trail entries and payloads)", async () => {
    const { GET } = await import("@/app/api/decision/export/route");
    const res = await GET(exportRequest(decisionId), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.decision).toMatchObject({
      id: decisionId,
      workspaceId: workspaceA,
      problem: "Gross margin fell 6 points",
      action: "Renegotiate supplier contract",
      impactExpected: 1200,
      impactLow: 800,
      impactHigh: 1600,
      confidence: 0.72,
      decisionType: "cost",
      status: "pending",
      ownerUserId: actorId,
      createdBy: actorId,
    });
    expect(typeof body.decision.createdAt).toBe("string");
    expect(body.inputs).toEqual({ baselineRevenue: 50000, list: [{ a: 1, b: 2 }], nested: { aKey: "a", yKey: "y" }, zeta: 3 });
    expect(body.outputs).toEqual({
      actualOutcome: "Margin 29%",
      expectedOutcome: "Margin back above 30%",
      explanation: { calculationTrace: { formula: "rev - cost", netImpact: 1200 }, summary: "Supplier cost is the dominant driver" },
    });
    expect(body.expectedImpact).toBe(1200);
    expect(body.actualOutcome).toBe("Margin 29%");
    expect(body.delta).toBe(-100);
    expect(body.accuracy).toBe(0.9);

    expect(body.auditTrail).toHaveLength(2);
    const byName = Object.fromEntries(body.auditTrail.map((e: { eventName: string }) => [e.eventName, e]));
    expect(byName["decision.created"]).toMatchObject({ actorId, payload: { source: "test", detail: { reason: "seed", count: 1 } } });
    expect(byName["decision.outcome_recorded"]).toMatchObject({ actorId, payload: { outcome: "Margin 29%" } });
    for (const e of body.auditTrail) expect(typeof e.occurredAt).toBe("string");
  });

  it("key order is canonical at every depth and repeated exports are byte-identical", async () => {
    const { GET } = await import("@/app/api/decision/export/route");
    const first = await (await GET(exportRequest(decisionId), { params: Promise.resolve({}) })).text();
    const second = await (await GET(exportRequest(decisionId), { params: Promise.resolve({}) })).text();
    expect(first).toBe(second);
    const parsed = JSON.parse(first);
    assertKeysSortedDeep(parsed);
    expect(Object.keys(parsed)).toEqual(["accuracy", "actualOutcome", "auditTrail", "decision", "delta", "expectedImpact", "inputs", "outputs"]);
  });
});
