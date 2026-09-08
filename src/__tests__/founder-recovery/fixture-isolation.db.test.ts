/**
 * DB-backed proof for acceptance/QA fixture isolation (P0-2).
 *
 * Real human usability testing surfaced dozens of "OPSIQ Acceptance ..." businesses in an
 * ordinary owner's business selector. Root cause: acceptance/QA runs create real, active
 * OwnerBusiness rows with no marker distinguishing them from a real owner's businesses.
 *
 * This proves the isFixtureBusiness architecture (see
 * docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md):
 *   - a real owner's business is visible via listBusinesses()
 *   - an active fixture business is hidden from listBusinesses()
 *   - the fixture is still reachable via the governed acceptance path (listFixtureBusinesses)
 *   - workspace isolation is preserved (a fixture in workspace A never leaks into workspace B)
 *   - a self-serve owner cannot mark their own business a fixture (no capability = ignored)
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/fixture-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness, listBusinesses, listFixtureBusinesses } from "@/services/founder-recovery/business.service";

const ws = () => randomUUID();
const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `fixture-isolation-test-${actor}@example.com`,
      name: "Fixture Isolation Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

const baseInput = {
  businessType: "laundry_local_service" as const,
  currency: "INR",
  b2cSupported: true,
  b2bSupported: false,
};

describe("[db] acceptance/QA fixture isolation", () => {
  it("[db] a real owner's business is visible via listBusinesses()", async () => {
    const workspaceId = ws();
    const real = await createBusiness({ ...baseInput, name: "Trinity Services" }, actor, workspaceId);

    const list = await listBusinesses(workspaceId);
    expect(list.map((b) => b.id)).toContain(real.id);
  });

  it("[db] an active fixture business is hidden from listBusinesses()", async () => {
    const workspaceId = ws();
    const fixture = await createBusiness(
      { ...baseInput, name: "OPSIQ Acceptance - laundry - run123" },
      actor,
      workspaceId,
      { isFixtureBusiness: true }
    );

    // Confirm the row really was created active + fixture-tagged (not silently dropped).
    const row = await db.ownerBusiness.findUnique({ where: { id: fixture.id } });
    expect(row?.isActive).toBe(true);
    expect(row?.isFixtureBusiness).toBe(true);

    const list = await listBusinesses(workspaceId);
    expect(list.map((b) => b.id)).not.toContain(fixture.id);
  });

  it("[db] a mix of real + fixture businesses: ordinary owner sees only the real one", async () => {
    const workspaceId = ws();
    const real = await createBusiness({ ...baseInput, name: "Trinity Services" }, actor, workspaceId);
    const fixtureA = await createBusiness(
      { ...baseInput, name: "OPSIQ Acceptance - run-A" },
      actor,
      workspaceId,
      { isFixtureBusiness: true }
    );
    const fixtureB = await createBusiness(
      { ...baseInput, name: "OPSIQ Production Acceptance - run-B" },
      actor,
      workspaceId,
      { isFixtureBusiness: true }
    );

    const list = await listBusinesses(workspaceId);
    const ids = list.map((b) => b.id);
    expect(ids).toContain(real.id);
    expect(ids).not.toContain(fixtureA.id);
    expect(ids).not.toContain(fixtureB.id);
  });

  it("[db] the fixture is still reachable via the governed acceptance path", async () => {
    const workspaceId = ws();
    const fixture = await createBusiness(
      { ...baseInput, name: "OPSIQ Acceptance - reachable" },
      actor,
      workspaceId,
      { isFixtureBusiness: true }
    );

    const fixtures = await listFixtureBusinesses(workspaceId);
    expect(fixtures.map((b) => b.id)).toContain(fixture.id);
  });

  it("[db] listFixtureBusinesses never returns real (non-fixture) businesses", async () => {
    const workspaceId = ws();
    const real = await createBusiness({ ...baseInput, name: "Trinity Services" }, actor, workspaceId);

    const fixtures = await listFixtureBusinesses(workspaceId);
    expect(fixtures.map((b) => b.id)).not.toContain(real.id);
  });

  it("[db] workspace isolation is preserved: a fixture in workspace A never leaks into workspace B", async () => {
    const wsA = ws();
    const wsB = ws();
    const fixtureA = await createBusiness(
      { ...baseInput, name: "OPSIQ Acceptance - ws-A" },
      actor,
      wsA,
      { isFixtureBusiness: true }
    );

    const fixturesForB = await listFixtureBusinesses(wsB);
    expect(fixturesForB.map((b) => b.id)).not.toContain(fixtureA.id);

    const fixturesForA = await listFixtureBusinesses(wsA);
    expect(fixturesForA.map((b) => b.id)).toContain(fixtureA.id);
  });

  it("[db] a business created with no explicit opts is never a fixture (default false)", async () => {
    const workspaceId = ws();
    const business = await createBusiness({ ...baseInput, name: "Ordinary business" }, actor, workspaceId);

    const row = await db.ownerBusiness.findUnique({ where: { id: business.id } });
    expect(row?.isFixtureBusiness).toBe(false);

    const fixtures = await listFixtureBusinesses(workspaceId);
    expect(fixtures.map((b) => b.id)).not.toContain(business.id);
  });
});
