/**
 * OBQ boundary validation for financial snapshot writes.
 *
 * Root cause: the API accepted any non-empty string as a period boundary (new Date() silently re-interpreted
 * "2026-02-30" as 2 March, "March 5" as 2001, and "+275760-09-13" passed Zod then failed in Postgres as a 500), and
 * accepted any currency string (client-only guarantee) so figures could be stored under a code that is not the
 * business's currency.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { financialSnapshotCreateSchema, isValidPeriodDateString } from "@/domain/owner-finance/validation";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 1000 };

describe("period date boundary", () => {
  it.each(["2026-09-01", "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00Z", "2028-02-29"])("accepts %s", (v) => {
    expect(isValidPeriodDateString(v)).toBe(true);
  });
  it.each([
    "2026-02-30", "2027-02-29", "March 5", "1", "", "99999-01-01", "+275760-09-13", "1999-12-31", "2101-01-01",
    "2026-03-01T00:00:00+05:30", "2026-9-1", "2026-09-01 00:00", "2026-13-01",
  ])("refuses %s", (v) => {
    expect(isValidPeriodDateString(v)).toBe(false);
  });
  it("the create schema rejects a loose boundary with a field error and accepts a clean one", () => {
    expect(financialSnapshotCreateSchema.safeParse(base).success).toBe(true);
    const bad = financialSnapshotCreateSchema.safeParse({ ...base, periodStart: "+275760-09-13" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.some((i) => i.path[0] === "periodStart")).toBe(true);
    expect(financialSnapshotCreateSchema.safeParse({ ...base, periodEnd: "2026-08-31" }).success).toBe(false);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] snapshot currency is the business's currency", () => {
  it("[db] a mismatched or malformed currency is refused; the business currency is stored upper-case", async () => {
    const actorId = randomUUID();
    const workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Cur WS", slug: `cur-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const biz = await createBusiness(
      { name: "Currency QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actorId, workspaceId,
    );
    try {
      for (const currency of ["USD", "123", "₹"]) {
        await expect(createFinancialSnapshot(biz.id, financialSnapshotCreateSchema.parse({ ...base, currency }), actorId, workspaceId))
          .rejects.toMatchObject({ statusCode: 400 });
      }
      expect(await db.ownerFinancialSnapshot.count({ where: { businessId: biz.id } })).toBe(0);
      const ok = await createFinancialSnapshot(biz.id, financialSnapshotCreateSchema.parse({ ...base, currency: "inr" }), actorId, workspaceId);
      expect((ok as { currency: string }).currency).toBe("INR");
    } finally {
      const { teardownOwnerBusiness } = await import("../test-helpers/owner-business-teardown");
      await teardownOwnerBusiness(biz.id);
      await db.auditEvent.deleteMany({ where: { actorId } });
      await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: actorId } });
    }
  });
});
