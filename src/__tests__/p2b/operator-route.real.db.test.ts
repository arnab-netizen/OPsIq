/**
 * P2B: POST /api/operator — real route, real canonical wrapper, real Postgres.
 *
 * What this file proves: each request is a real NextRequest handed to the REAL exported `POST` of
 * src/app/api/operator/route.ts, wrapped by the REAL `withCanonicalEnforcement`. The caller is a seeded User +
 * active WorkspaceMembership + workspace-scoped UserRoleAssignment + live Session row; the real getSession /
 * getPolicyContext / resolveServerRole resolve it. The plan gate (assertCapability "decision_engine") reads a
 * seeded Plan / BillingAccount / Subscription. The route then runs the real outcome classifier
 * (services/operator/outcome-classifier), the real verification capture (services/outcome/verification), the
 * real idempotency service and the real store write. Only the Next.js cookie jar is stubbed, to carry the
 * seeded session token. Every assertion reads the persisted rows back from the database.
 *
 * Requirements (from the five tests this file originally held as unconditionally skipped placeholders), against the
 * current code:
 *   1. SUCCESS — completing an in-progress item with 100% of expected impact persists status "done",
 *      actualOutcome "success", the reported value, verification metadata ("unverified",
 *      "customer_reported_unverified") and the operator_item.completed audit event. Still current.
 *   2. VALIDATION — an outcome that needs notes is rejected 400 and nothing is written. The original case
 *      (actualOutcome 0 => failure => "Outcome notes required") is no longer reachable on an item without a
 *      recorded outcome: the completion policy (services/policy/engine validateCompletion) rejects a 0 value
 *      first with "Cannot complete without actualOutcome". Both current contracts are pinned below: the 0
 *      rejection, and the notes rule on the reachable category (uncertain, >200% variance).
 *   3. UNCERTAIN — a >200% variance outcome WITH notes is accepted, classified "uncertain", stays
 *      "unverified" (medium fraud risk) and stores the trimmed notes. Still current.
 *   4. FRAUD — a high fraud-risk assessment marks the outcome "disputed". Still current. The original
 *      precondition (an in-progress row that already carries an outcome value: "retroactive modification")
 *      is not producible by any live writer (the route only writes a value on the terminal "done"
 *      transition; execution-service markSuccess is retired and throws), so the reachable high-risk input
 *      is pinned (exact match with expected + round number), and the retroactive indicator is pinned on a
 *      seeded pre-existing row.
 *   5. IDEMPOTENCY — the same idempotency key sent twice returns the same response and writes once (row
 *      unchanged, one audit event of each kind, one completed idempotency record); reusing the key with a
 *      different payload is refused 400 without a write. Still current.
 *
 * Lane: *.db.test.ts (CI "Run DB test suite"). Tests are tagged [db]; vitest.config.ts filters [db] tests out
 * of runs without TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "opsiq_session" && cookieJar.token ? { value: cookieJar.token } : undefined),
  }),
}));

import { db, getDbInstance } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { POST as operatorPost } from "@/app/api/operator/route";

const COMPLETED = "operator_item.completed";
const UPDATED = "operator_item.updated";

type Fixture = { workspaceId: string; userId: string; token: string };

async function seedCaller(): Promise<Fixture> {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const token = `p2b-op-${randomUUID()}`;
  await db.workspace.create({ data: { id: workspaceId, name: "P2B operator", slug: `p2b-op-${workspaceId}` } });
  await db.user.create({ data: { id: userId, email: `p2b-op-${userId}@example.com`, name: "P2B operator", isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({
    data: { id: randomUUID(), userId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId, isActive: true },
  });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });

  // Plan gate: the route calls assertCapability(workspaceId, "decision_engine").
  const planId = randomUUID();
  const billingAccountId = randomUUID();
  await db.plan.create({ data: { id: planId, name: `p2b-op-plan-${planId}`, priceMonthly: 0, priceYearly: 0 } });
  await db.planCapability.create({ data: { id: randomUUID(), planId, key: "decision_engine", limit: null } });
  await db.billingAccount.create({ data: { id: billingAccountId, workspaceId, providerCustomerId: `p2b-op-${billingAccountId}` } });
  await db.subscription.create({
    data: {
      id: randomUUID(),
      billingAccountId,
      planId,
      status: "active",
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000),
    },
  });
  return { workspaceId, userId, token };
}

async function seedItem(fx: Fixture, overrides: { impactExpected?: number; actualOutcomeValue?: number } = {}): Promise<string> {
  const id = randomUUID();
  const impactExpected = overrides.impactExpected ?? 50000;
  await db.operatorItem.create({
    data: {
      id,
      workspaceId: fx.workspaceId,
      createdByUserId: fx.userId,
      problem: "P2B problem",
      action: "P2B action",
      impactExpected,
      impactLow: impactExpected / 2,
      impactHigh: impactExpected * 1.5,
      confidence: 0.8,
      priorityScore: 5,
      status: "in_progress",
      executionStatus: "started",
      ...(overrides.actualOutcomeValue !== undefined ? { actualOutcomeValue: overrides.actualOutcomeValue } : {}),
      updatedAt: new Date(),
    },
  });
  return id;
}

async function post(token: string, body: Record<string, unknown>, idempotencyKey: string) {
  cookieJar.token = token;
  const req = new NextRequest("http://localhost/api/operator", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const res = await operatorPost(req, { params: Promise.resolve({}) });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown>, text };
}

const audits = (workspaceId: string, eventName: string, entityId: string) =>
  db.auditEvent.findMany({ where: { workspaceId, eventName, entityId } });

/** The row is exactly as seeded: no field the completion path writes has changed. */
async function expectUntouched(id: string, seededUpdatedAt: Date) {
  const row = await db.operatorItem.findUniqueOrThrow({ where: { id } });
  expect(row.status).toBe("in_progress");
  expect(row.executionStatus).toBe("started");
  expect(row.actualOutcome).toBeNull();
  expect(row.outcomeNotes).toBeNull();
  expect(row.completedAt).toBeNull();
  expect(row.completedBy).toBeNull();
  expect(row.verificationEvidence).toBeNull();
  expect(row.updatedAt.getTime()).toBe(seededUpdatedAt.getTime());
}

describe("[db] P2B: POST /api/operator through the real route and canonical wrapper", () => {
  let fx: Fixture;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    fx = await seedCaller();
  });

  describe("SUCCESS PATH: 100% achievement", () => {
    it("[db] completes the item: 200 {success:true}; row persisted as done/success with verification metadata; audit events written", async () => {
      const id = await seedItem(fx);
      const key = `p2b-op-${randomUUID()}`;

      const res = await post(fx.token, { id, status: "done", actualOutcome: 50000 }, key);

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ success: true });

      const row = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("done");
      expect(row.executionStatus).toBe("completed");
      expect(row.actualOutcome).toBe("success");
      expect(row.actualOutcomeValue).toBe(50000);
      expect(row.outcomeDelta).toBe(0);
      expect(row.decisionAccuracy).toBe(1);
      expect(row.decisionError).toBe(0);
      expect(row.outcomeNotes).toBeNull();
      expect(row.completedBy).toBe(fx.userId);
      expect(row.completedAt).toBeInstanceOf(Date);
      // An exact match with expected is one fraud indicator (score 1 => medium): stays unverified, not disputed.
      expect(row.verificationStatus).toBe("unverified");
      expect(row.verificationMethod).toBe("customer_reported_unverified");
      expect(row.verificationConfidence).toBe(0);
      const evidence = row.verificationEvidence as { fraudRiskAssessment: { riskLevel: string; indicators: string[] }; capturedBy: string };
      expect(evidence.fraudRiskAssessment.riskLevel).toBe("medium");
      expect(evidence.fraudRiskAssessment.indicators).toEqual(["Outcome exactly matches expected (suspiciously precise)"]);
      expect(evidence.capturedBy).toBe(fx.userId);
      const trail = row.auditTrail as Array<{ action: string; actorId: string; afterValue: number }>;
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({ action: "OUTCOME_RECORDED", actorId: fx.userId, afterValue: 50000 });

      const completed = await audits(fx.workspaceId, COMPLETED, id);
      expect(completed).toHaveLength(1);
      expect(completed[0].actorId).toBe(fx.userId);
      expect(completed[0].entityType).toBe("OperatorItem");
      const payload = completed[0].payload as { role: string; before: { status: string }; after: { status: string; actualOutcome: string } };
      expect(payload.role).toBe("admin");
      expect(payload.before.status).toBe("in_progress");
      expect(payload.after).toMatchObject({ status: "done", actualOutcome: "success" });
      expect(await audits(fx.workspaceId, UPDATED, id)).toHaveLength(1);

      const record = await db.idempotencyRecord.findUniqueOrThrow({ where: { idempotencyKey: key } });
      expect(record.status).toBe("completed");
      expect(record.responseCode).toBe(200);
      expect(record.responseBody).toEqual({ success: true });
    });
  });

  describe("VALIDATION PATH: outcome that cannot be accepted as reported", () => {
    it("[db] actualOutcome 0 on an item with no recorded outcome is rejected 400 by the completion policy; nothing is written", async () => {
      const id = await seedItem(fx);
      const seeded = await db.operatorItem.findUniqueOrThrow({ where: { id } });

      const res = await post(fx.token, { id, status: "done", actualOutcome: 0 }, `p2b-op-${randomUUID()}`);

      expect(res.status, res.text).toBe(400);
      expect(res.body.error).toBe("Cannot complete without actualOutcome");
      expect(res.body.classification).toBe("handler_invocation_validation_error");
      await expectUntouched(id, seeded.updatedAt);
      expect(await audits(fx.workspaceId, COMPLETED, id)).toHaveLength(0);
      expect(await audits(fx.workspaceId, UPDATED, id)).toHaveLength(0);
    });

    it("[db] an uncertain outcome (>200% variance) without outcomeNotes is rejected 400 'Outcome notes required'; nothing is written", async () => {
      const id = await seedItem(fx);
      const seeded = await db.operatorItem.findUniqueOrThrow({ where: { id } });

      const res = await post(fx.token, { id, status: "done", actualOutcome: 250000, outcomeNotes: "   " }, `p2b-op-${randomUUID()}`);

      expect(res.status, res.text).toBe(400);
      expect(res.body.error).toBe("Outcome notes required for uncertain outcome: Outcome variance >200% from expected (400%)");
      expect(res.body.classification).toBe("handler_invocation_validation_error");
      await expectUntouched(id, seeded.updatedAt);
      expect(await audits(fx.workspaceId, COMPLETED, id)).toHaveLength(0);
      expect(await audits(fx.workspaceId, UPDATED, id)).toHaveLength(0);
    });
  });

  describe("UNCERTAIN PATH: high variance with notes", () => {
    it("[db] accepts the outcome: classified uncertain, verificationStatus unverified (medium risk), trimmed notes persisted", async () => {
      const id = await seedItem(fx);

      const res = await post(
        fx.token,
        { id, status: "done", actualOutcome: 250000, outcomeNotes: "  Exceptional market condition  " },
        `p2b-op-${randomUUID()}`
      );

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ success: true });
      const row = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("done");
      expect(row.actualOutcome).toBe("uncertain");
      expect(row.actualOutcomeValue).toBe(250000);
      expect(row.outcomeNotes).toBe("Exceptional market condition");
      expect(row.outcomeDelta).toBe(200000);
      expect(row.decisionAccuracy).toBe(5);
      expect(row.verificationStatus).toBe("unverified");
      const evidence = row.verificationEvidence as { fraudRiskAssessment: { riskLevel: string; indicators: string[] }; verificationReason: string };
      expect(evidence.fraudRiskAssessment.riskLevel).toBe("medium");
      expect(evidence.fraudRiskAssessment.indicators).toEqual(["Extreme variance from expected (>=200%)"]);
      expect(evidence.verificationReason).toBe("Flagged for review: Outcome variance >200% from expected impact");
      expect(await audits(fx.workspaceId, COMPLETED, id)).toHaveLength(1);
    });
  });

  describe("FRAUD DETECTION PATH: high fraud risk marks the outcome disputed", () => {
    it("[db] an outcome exactly equal to a round expected impact (score 1.5 => high) is persisted as disputed", async () => {
      const id = await seedItem(fx, { impactExpected: 100000 });

      const res = await post(fx.token, { id, status: "done", actualOutcome: 100000 }, `p2b-op-${randomUUID()}`);

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({ success: true });
      const row = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("done");
      expect(row.actualOutcome).toBe("success");
      expect(row.verificationStatus).toBe("disputed");
      const evidence = row.verificationEvidence as { fraudRiskAssessment: { riskLevel: string; indicators: string[] } };
      expect(evidence.fraudRiskAssessment.riskLevel).toBe("high");
      expect(evidence.fraudRiskAssessment.indicators).toEqual([
        "Outcome exactly matches expected (suspiciously precise)",
        "Round number outcome (may indicate estimation rather than measurement)",
      ]);
      const completed = await audits(fx.workspaceId, COMPLETED, id);
      expect(completed).toHaveLength(1);
      expect((completed[0].payload as { after: { status: string } }).after.status).toBe("done");
    });

    it("[db] a pre-existing outcome value that the report changes (retroactive modification) is persisted as disputed", async () => {
      const id = await seedItem(fx, { actualOutcomeValue: 50000 });

      const res = await post(
        fx.token,
        { id, status: "done", actualOutcome: 60000, outcomeNotes: "Correction to previous" },
        `p2b-op-${randomUUID()}`
      );

      expect(res.status, res.text).toBe(200);
      const row = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(row.actualOutcome).toBe("success");
      expect(row.actualOutcomeValue).toBe(60000);
      expect(row.verificationStatus).toBe("disputed");
      const evidence = row.verificationEvidence as { fraudRiskAssessment: { riskLevel: string; indicators: string[] } };
      expect(evidence.fraudRiskAssessment.riskLevel).toBe("high");
      expect(evidence.fraudRiskAssessment.indicators).toEqual(["Retroactive modification of outcome value"]);
    });
  });

  describe("IDEMPOTENCY: same key twice produces the same result and one write", () => {
    it("[db] the second request with the same key and body replays the first response; the row, audit trail and record are unchanged", async () => {
      const id = await seedItem(fx);
      const key = `p2b-op-${randomUUID()}`;
      const body = { id, status: "done", actualOutcome: 50000 };

      const first = await post(fx.token, body, key);
      expect(first.status, first.text).toBe(200);
      const rowAfterFirst = await db.operatorItem.findUniqueOrThrow({ where: { id } });

      const second = await post(fx.token, body, key);

      expect(second.status, second.text).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(second.body).toEqual({ success: true });
      const rowAfterSecond = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(rowAfterSecond.updatedAt.getTime()).toBe(rowAfterFirst.updatedAt.getTime());
      expect(rowAfterSecond.completedAt?.getTime()).toBe(rowAfterFirst.completedAt?.getTime());
      expect(rowAfterSecond.auditTrail).toEqual(rowAfterFirst.auditTrail);
      expect(await audits(fx.workspaceId, COMPLETED, id)).toHaveLength(1);
      expect(await audits(fx.workspaceId, UPDATED, id)).toHaveLength(1);
      const records = await db.idempotencyRecord.findMany({ where: { idempotencyKey: key } });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ status: "completed", responseCode: 200, operationName: "updateOperatorItem" });
    });

    it("[db] reusing the key with a different body is refused 400 and writes nothing", async () => {
      const id = await seedItem(fx);
      const key = `p2b-op-${randomUUID()}`;

      const first = await post(fx.token, { id, status: "done", actualOutcome: 50000 }, key);
      expect(first.status, first.text).toBe(200);
      const rowAfterFirst = await db.operatorItem.findUniqueOrThrow({ where: { id } });

      const second = await post(fx.token, { id, status: "done", actualOutcome: 60000 }, key);

      expect(second.status, second.text).toBe(400);
      expect(second.body.error).toBe("Idempotency key reused with different payload. Cannot retry request with different parameters.");
      const rowAfterSecond = await db.operatorItem.findUniqueOrThrow({ where: { id } });
      expect(rowAfterSecond.actualOutcomeValue).toBe(50000);
      expect(rowAfterSecond.updatedAt.getTime()).toBe(rowAfterFirst.updatedAt.getTime());
      expect(await audits(fx.workspaceId, COMPLETED, id)).toHaveLength(1);
    });
  });
});
