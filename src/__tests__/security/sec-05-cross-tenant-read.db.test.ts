/**
 * SEC-05 [db]: cross-tenant READ isolation with two POPULATED tenants (PASS 19 / H8).
 *
 * The PASS 18 execution-first audit found that workspace WRITE isolation was proven (sec-04 empty-WHERE
 * bulk-write backstop; sec-02 cross-tenant write → NotFoundError) but cross-tenant READ isolation was only
 * ever exercised against an EMPTY "clean" workspace (negative-existence). That does not prove a read path
 * FILTERS OUT a second tenant's real rows. This test seeds two populated workspaces — deliberately using the
 * SAME natural key (taskKey) in both, so the assertion proves workspace SCOPING rather than key uniqueness —
 * and confirms a representative workspace-scoped owner-mode read (getPersistedExecutionTasks) returns only the
 * caller's rows, never the other tenant's, in both directions.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getPersistedExecutionTasks } from "@/services/owner-mode/opportunity-execution.service";

const ownerA = randomUUID();
const ownerB = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const wsUnused = randomUUID();
const NOW = new Date("2026-07-06T00:00:00Z");

// Deliberately identical across tenants: proves scoping, not key uniqueness.
const SHARED_TASK_KEY = "shared:collect-cost-data";

async function seedTask(workspaceId: string, status: string, opportunityKey: string): Promise<void> {
  await db.opportunityExecutionTask.create({
    data: {
      id: randomUUID(),
      workspaceId,
      taskKey: SHARED_TASK_KEY,
      opportunityKey,
      sourceType: "OPPORTUNITY_SIGNAL",
      sourceKey: `${opportunityKey}:src`,
      taskType: "COLLECT_COST_DATA",
      nextActionOwner: "MANAGER",
      status,
      approvalLevel: "MANAGER",
      evidenceRefs: [],
      linkedProofIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SEC-05 cross-tenant READ isolation (two populated tenants)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: ownerA, email: `sec05-a-${ownerA}@example.com`, name: "Owner A", isActive: true, updatedAt: NOW } });
    await db.user.create({ data: { id: ownerB, email: `sec05-b-${ownerB}@example.com`, name: "Owner B", isActive: true, updatedAt: NOW } });
    await db.workspace.create({ data: { id: wsA, name: "WS A", slug: `sec05-a-${wsA.slice(0, 8)}`, createdBy: ownerA } });
    await db.workspace.create({ data: { id: wsB, name: "WS B", slug: `sec05-b-${wsB.slice(0, 8)}`, createdBy: ownerB } });
    await db.workspace.create({ data: { id: wsUnused, name: "WS Unused", slug: `sec05-u-${wsUnused.slice(0, 8)}`, createdBy: ownerA } });
    // Both tenants own a task under the SAME taskKey but with distinct status/opportunity.
    await seedTask(wsA, "IN_PROGRESS", "opp-A");
    await seedTask(wsB, "COMPLETED", "opp-B");
  });

  afterAll(async () => {
    await db.opportunityExecutionTask.deleteMany({ where: { workspaceId: { in: [wsA, wsB, wsUnused] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB, wsUnused] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  });

  it("a workspace-scoped read returns ONLY the caller's row, never the other populated tenant's", async () => {
    const a = await getPersistedExecutionTasks(wsA);
    const b = await getPersistedExecutionTasks(wsB);

    // Each tenant sees exactly its own single task under the shared key.
    expect(a.size).toBe(1);
    expect(b.size).toBe(1);
    expect(a.get(SHARED_TASK_KEY)?.status).toBe("IN_PROGRESS");
    expect(b.get(SHARED_TASK_KEY)?.status).toBe("COMPLETED");

    // The other tenant's distinct value never leaks across the boundary.
    expect(a.get(SHARED_TASK_KEY)?.status).not.toBe("COMPLETED");
    expect(b.get(SHARED_TASK_KEY)?.status).not.toBe("IN_PROGRESS");
  });

  it("a populated read boundary still returns empty for a third, unpopulated workspace", async () => {
    const unused = await getPersistedExecutionTasks(wsUnused);
    expect(unused.size).toBe(0);
  });
});
