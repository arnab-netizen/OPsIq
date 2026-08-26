/**
 * `[db]`-gated real-Postgres hostile reproduction for the deterministic-
 * action-ordering fix. See
 * owner-action-dashboard-ordering-governance.test.ts's header for the full
 * incident writeup (live-production acceptance run 32953759246).
 *
 * Directly seeds tied-priority action rows via raw Prisma writes rather than
 * running the full diagnosis engine -- this isolates the test to exactly the
 * layer under test (dashboard.service.ts's `actions` query), independent of
 * which real business-rule combination happens to produce a tie. Every
 * ranking field rankOwnerActions() tiebreaks on (priorityScore,
 * expectedImpactScore, confidence, findingCode, title) is made IDENTICAL
 * across the seeded actions -- only `id` differs -- so this is the
 * maximally-hostile fixture: it proves the ordering is not accidentally
 * stable because some other field happens to differ in practice.
 *
 * Run against 2 of the 7 affected domains directly (Sales -- the
 * originally-investigated domain -- and SOP -- the previously-untested
 * sibling this investigation newly discovered shares the same defect). The
 * fix is mechanically identical across all 7 domains (see the governance
 * test's static proof that every file has the exact same orderBy shape);
 * duplicating this exact scenario 5 more times would be redundant, not more
 * rigorous.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-action-ordering-determinism.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { getSopDashboard } from "@/services/owner-sop/dashboard.service";
import { updateSopAction } from "@/services/owner-sop/action.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `ordering-determinism-test-${actor}@example.com`,
      name: "Ordering Determinism Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string): Promise<string> {
  const b = await createBusiness(
    { name: "Ordering Determinism Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

interface TiedAction {
  id: string;
}

interface DomainHarness {
  name: string;
  createSnapshotAndCycle(businessId: string, workspaceId: string): Promise<string>; // returns cycleId
  createTiedActions(cycleId: string, businessId: string, workspaceId: string, count: number): Promise<TiedAction[]>;
  getDashboardActionIds(workspaceId: string, businessId: string): Promise<string[]>;
  assignAction(actionId: string, workspaceId: string): Promise<void>;
  getActionRow(id: string): Promise<{ status: string } | null>;
}

const salesHarness: DomainHarness = {
  name: "sales",
  async createSnapshotAndCycle(businessId, workspaceId) {
    const snap = await db.ownerSalesSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId,
        businessId,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
        currency: "INR",
        dataConfidenceScore: 100,
        missingCriticalData: [],
      },
    });
    const cycle = await db.ownerSalesCycle.create({
      data: {
        id: randomUUID(),
        workspaceId,
        businessId,
        snapshotId: snap.id,
        sequenceNumber: 1,
        healthScore: 50,
        riskScore: 50,
        opportunityScore: 50,
        dataConfidenceScore: 100,
        salesState: "stable",
        generatedAt: new Date(),
      },
    });
    return cycle.id;
  },
  async createTiedActions(cycleId, businessId, workspaceId, count) {
    const created: TiedAction[] = [];
    for (let i = 0; i < count; i++) {
      const a = await db.ownerSalesAction.create({
        data: {
          id: randomUUID(),
          workspaceId,
          businessId,
          cycleId,
          recommendationCode: "TIED_REC",
          findingCode: "TIED_FINDING",
          title: "Tied action",
          description: "Hostile tie-fixture action -- deliberately identical to its siblings",
          ownerRole: "owner",
          status: "proposed",
          priorityScore: 100,
          effortScore: 20,
          expectedImpactScore: 100,
          confidence: 1,
          verificationMetric: "tiedMetric",
          verificationMethod: "manual",
          expectedTimeframeDays: 30,
        },
      });
      created.push({ id: a.id });
    }
    return created;
  },
  async getDashboardActionIds(workspaceId, businessId) {
    const dash = await getSalesDashboard(workspaceId, businessId);
    return (dash.latestCycle?.actions ?? []).map((a: { id: string }) => a.id);
  },
  async assignAction(actionId, workspaceId) {
    await updateSalesAction(actionId, { status: "assigned" }, actor, workspaceId);
  },
  async getActionRow(id) {
    return db.ownerSalesAction.findUnique({ where: { id } });
  },
};

const sopHarness: DomainHarness = {
  name: "sop",
  async createSnapshotAndCycle(businessId, workspaceId) {
    const snap = await db.ownerSopSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId,
        businessId,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
        currency: "INR",
        dataConfidenceScore: 100,
        missingCriticalData: [],
      },
    });
    const cycle = await db.ownerSopCycle.create({
      data: {
        id: randomUUID(),
        workspaceId,
        businessId,
        snapshotId: snap.id,
        sequenceNumber: 1,
        healthScore: 50,
        riskScore: 50,
        opportunityScore: 50,
        dataConfidenceScore: 100,
        executionState: "stable",
        generatedAt: new Date(),
      },
    });
    return cycle.id;
  },
  async createTiedActions(cycleId, businessId, workspaceId, count) {
    const created: TiedAction[] = [];
    for (let i = 0; i < count; i++) {
      const a = await db.ownerSopAction.create({
        data: {
          id: randomUUID(),
          workspaceId,
          businessId,
          cycleId,
          recommendationCode: "TIED_REC",
          findingCode: "TIED_FINDING",
          title: "Tied action",
          description: "Hostile tie-fixture action -- deliberately identical to its siblings",
          ownerRole: "owner",
          status: "proposed",
          priorityScore: 100,
          effortScore: 20,
          expectedImpactScore: 100,
          confidence: 1,
          verificationMetric: "tiedMetric",
          verificationMethod: "manual",
          expectedTimeframeDays: 30,
        },
      });
      created.push({ id: a.id });
    }
    return created;
  },
  async getDashboardActionIds(workspaceId, businessId) {
    const dash = await getSopDashboard(workspaceId, businessId);
    return (dash.latestCycle?.actions ?? []).map((a: { id: string }) => a.id);
  },
  async assignAction(actionId, workspaceId) {
    await updateSopAction(actionId, { status: "assigned" }, actor, workspaceId);
  },
  async getActionRow(id) {
    return db.ownerSopAction.findUnique({ where: { id } });
  },
};

describe.each([salesHarness, sopHarness])("[db] $name — deterministic action ordering under a total tie", (h) => {
  it("[db] repeated dashboard reads return the exact same ordered action-id list when priority/impact/confidence/findingCode/title are ALL tied", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const cycleId = await h.createSnapshotAndCycle(businessId, workspaceId);
    const actions = await h.createTiedActions(cycleId, businessId, workspaceId, 5);
    expect(actions.length).toBe(5);

    const reads: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const ids = await h.getDashboardActionIds(workspaceId, businessId);
      expect(ids.length).toBe(5);
      reads.push(ids);
    }
    // Every read must be byte-identical to every other read -- a test that
    // only checked reads[0] once would tell us nothing about stability
    // across repeated reads, which is exactly the property that broke in
    // production.
    for (let i = 1; i < reads.length; i++) {
      expect(reads[i], `read #${i} must match read #0's order exactly`).toEqual(reads[0]);
    }
    // With every non-id ranking field tied, `id ASC` is the only thing that
    // can be determining the order -- confirm the returned order actually
    // matches ascending id, not merely "some" stable-but-arbitrary order.
    const expectedOrder = [...actions.map((a) => a.id)].sort();
    expect(reads[0]).toEqual(expectedOrder);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] assigning the top tied action leaves the other tied actions' relative order unchanged, and the assigned action remains addressable by id", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const cycleId = await h.createSnapshotAndCycle(businessId, workspaceId);
    const actions = await h.createTiedActions(cycleId, businessId, workspaceId, 3);
    expect(actions.length).toBe(3);

    const idsBefore = await h.getDashboardActionIds(workspaceId, businessId);
    const targetId = idsBefore[0]; // the deterministic "first"/recommended action

    await h.assignAction(targetId, workspaceId);

    const idsAfter = await h.getDashboardActionIds(workspaceId, businessId);

    // The exact same ordered id list -- an UPDATE to one tied row's
    // `status` (not a ranking field) must never perturb the tiebreak
    // order. This is the precise property whose absence caused the live
    // acceptance failure: a `.first()` locator silently resolving to a
    // DIFFERENT, untouched action after the Assign PATCH.
    expect(idsAfter, "ordering must be unaffected by an unrelated UPDATE to a tied row").toEqual(idsBefore);

    // The specific action that was assigned is still THAT SAME action, at
    // the SAME position, and genuinely "assigned" now -- both via the
    // dashboard read and via a direct row fetch.
    expect(idsAfter[0]).toBe(targetId);
    const directRow = await h.getActionRow(targetId);
    expect(directRow?.status).toBe("assigned");

    await teardownOwnerBusiness(businessId);
  });
});
