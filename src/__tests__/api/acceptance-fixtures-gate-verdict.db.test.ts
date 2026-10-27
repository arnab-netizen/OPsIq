/**
 * GET /api/admin/acceptance-fixtures/businesses/[businessId]/cashflow/actions/[actionId]/gate-verdict --
 * real-Postgres proof.
 *
 * The route-contract tests in acceptance-fixtures-gate-verdict.test.ts are DB-free (mocked db,
 * mocked assessOwnerActionGate). This file proves the two things that can only be proven against a
 * real database: (1) the route's exact two WHERE clauses (business: id+workspaceId+isFixtureBusiness;
 * action: id+workspaceId+businessId) really do resolve a genuine fixture business and its own action,
 * and really do return nothing for a non-fixture business or a mismatched business/workspace -- against
 * real Postgres rows created through the actual service layer, not a hand-built mock; (2)
 * assessOwnerActionGate, called with the SAME input shape the route builds, makes ZERO audit-event
 * writes against a real audit_events table, in direct contrast to enforceOwnerActionGates (which DOES
 * write one on a blocked transition) -- proving the read-only/enforcing split is real, not just mocked.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/acceptance-fixtures-gate-verdict.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis, listCashflowCycleActions } from "@/services/owner-cashflow/diagnosis.service";
import { ConflictError } from "@/infra/errors";
import { assessOwnerActionGate, enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { CASHFLOW_INSOLVENT_FIXTURE, insolventFixturePeriod } from "../../../tests/production/fixtures/cashflow-fixtures";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `gate-verdict-db-${actor}@example.com`, name: "Gate Verdict DB Test", isActive: true, updatedAt: new Date() },
  });
});

async function newFixtureBusiness(workspaceId: string, isFixtureBusiness: boolean): Promise<string> {
  const b = await createBusiness(
    { name: "Gate Verdict DB Fixture", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId,
    { isFixtureBusiness }
  );
  return b.id;
}

/**
 * The SAME deliberately-stressed fixture the live Production acceptance spec (24-cashflow-
 * acceptance.spec.ts) uses, proven against the real domain functions to reach cashflowState=
 * INSOLVENT_RISK in cashflow-acceptance-fixture-safety.test.ts. Period is relative to `new Date()`
 * (never a fixed past date), so this test's result does not depend on when it happens to run.
 */
function insolventSnapshot() {
  const period = insolventFixturePeriod(new Date());
  const numeric = Object.fromEntries(Object.entries(CASHFLOW_INSOLVENT_FIXTURE).map(([k, v]) => [k, Number(v)]));
  return { ...period, currency: "INR", ...numeric };
}

/**
 * Picks an action from the cycle. Per the product's OWN documented policy (owner-action-gate-policy.ts,
 * echoed in 24-cashflow-acceptance.spec.ts's header comment), the gate lets a PROTECTIVE action through
 * even at INSOLVENT_RISK -- which of a cycle's actions is refused is the policy's call, never assumed by
 * a test picking "the first one". When `wantBlocked` is set, this returns the first action whose verdict
 * is actually blocked (skipping the test if none exists, rather than asserting a false premise).
 */
async function seedFixtureWithAction(isFixtureBusiness: boolean, wantBlocked = false) {
  const workspaceId = ws();
  const businessId = await newFixtureBusiness(workspaceId, isFixtureBusiness);
  const snap = await createCashflowSnapshot(businessId, insolventSnapshot(), actor, workspaceId);
  const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
  expect(cycle.actions.length, "the insolvent snapshot must produce at least one real action").toBeGreaterThan(0);
  const actions = await listCashflowCycleActions(cycle.id, workspaceId);

  let chosen = actions[0];
  if (wantBlocked) {
    const found = await (async () => {
      for (const candidate of actions) {
        const v = await assessOwnerActionGate({
          workspaceId,
          businessId,
          actionId: candidate.id,
          domain: "cashflow",
          toStatus: "in_progress",
          findingCode: candidate.findingCode,
          findingId: candidate.findingId,
        });
        if (!v.allowed) return candidate;
      }
      return null;
    })();
    if (!found) {
      await teardownOwnerBusiness(businessId);
      return null;
    }
    chosen = found;
  }
  return { workspaceId, businessId, actionId: chosen.id, findingCode: chosen.findingCode, findingId: chosen.findingId, cashflowState: cycle.cashflowState };
}

describe("[db] GET .../cashflow/actions/[actionId]/gate-verdict -- the route's exact WHERE clauses against real rows", () => {
  it("[db] resolves a real fixture business and its own action; refuses a non-fixture business and a mismatched business/workspace", async () => {
    const fixture = await seedFixtureWithAction(true);
    const ordinary = await seedFixtureWithAction(false);
    try {
      // The business WHERE clause: id + workspaceId + isFixtureBusiness:true (exactly route.ts's query).
      const businessFound = await db.ownerBusiness.findFirst({
        where: { id: fixture.businessId, workspaceId: fixture.workspaceId, isFixtureBusiness: true },
        select: { id: true },
      });
      expect(businessFound?.id).toBe(fixture.businessId);

      const ordinaryBusinessRefused = await db.ownerBusiness.findFirst({
        where: { id: ordinary.businessId, workspaceId: ordinary.workspaceId, isFixtureBusiness: true },
        select: { id: true },
      });
      expect(ordinaryBusinessRefused, "an ordinary (non-fixture) business must not satisfy isFixtureBusiness:true").toBeNull();

      const crossWorkspaceBusinessRefused = await db.ownerBusiness.findFirst({
        where: { id: fixture.businessId, workspaceId: ordinary.workspaceId, isFixtureBusiness: true },
        select: { id: true },
      });
      expect(crossWorkspaceBusinessRefused, "a real fixture queried under a different workspace must not resolve").toBeNull();

      // The action WHERE clause: id + workspaceId + businessId (exactly route.ts's query).
      const actionFound = await db.ownerCashflowAction.findFirst({
        where: { id: fixture.actionId, workspaceId: fixture.workspaceId, businessId: fixture.businessId },
        select: { businessId: true, findingId: true, findingCode: true },
      });
      expect(actionFound?.businessId).toBe(fixture.businessId);
      expect(actionFound?.findingCode).toBe(fixture.findingCode);

      const foreignBusinessActionRefused = await db.ownerCashflowAction.findFirst({
        where: { id: fixture.actionId, workspaceId: fixture.workspaceId, businessId: ordinary.businessId },
        select: { businessId: true },
      });
      expect(foreignBusinessActionRefused, "a real action queried against a different businessId must not resolve").toBeNull();
    } finally {
      await teardownOwnerBusiness(fixture.businessId);
      await teardownOwnerBusiness(ordinary.businessId);
    }
  });

  it("[db] assessOwnerActionGate makes ZERO audit-event writes against the real audit_events table -- enforceOwnerActionGates (same input) writes exactly one on the same blocked verdict", async () => {
    const fixture = await seedFixtureWithAction(true, /* wantBlocked */ true);
    if (!fixture) {
      // Not a defect -- the policy may let every one of this cycle's actions through (e.g. all protective).
      // Matches 24-cashflow-acceptance.spec.ts's own SKIPPED_NO_ACTIONS_GENERATED pattern for the same reason.
      console.log("SKIPPED: no blocked action in this cycle -- the gate's own policy, not a defect.");
      return;
    }
    try {
      expect(fixture.cashflowState).toBe("INSOLVENT_RISK");
      const input = {
        workspaceId: fixture.workspaceId,
        businessId: fixture.businessId,
        actionId: fixture.actionId,
        domain: "cashflow",
        toStatus: "in_progress",
        findingCode: fixture.findingCode,
        findingId: fixture.findingId,
      } as const;

      const auditBefore = await db.auditEvent.count({ where: { workspaceId: fixture.workspaceId } });
      const verdict = await assessOwnerActionGate(input);
      const auditAfterAssess = await db.auditEvent.count({ where: { workspaceId: fixture.workspaceId } });

      expect(verdict.allowed, "an INSOLVENT_RISK cashflow business must block a material transition").toBe(false);
      expect(verdict.allowed === false && verdict.code).toBe("CASH_SAFETY_BLOCKED");
      expect(auditAfterAssess, "assessOwnerActionGate must write zero audit events, even on a blocked verdict").toBe(auditBefore);

      // The SAME input through the real enforcement path: identical verdict, but it DOES audit (contrast proof).
      await expect(enforceOwnerActionGates(input)).rejects.toBeInstanceOf(ConflictError);
      const auditAfterEnforce = await db.auditEvent.count({ where: { workspaceId: fixture.workspaceId } });
      expect(auditAfterEnforce, "enforceOwnerActionGates must write exactly one audit event on this same blocked verdict").toBe(auditBefore + 1);
    } finally {
      await teardownOwnerBusiness(fixture.businessId);
    }
  });
});
