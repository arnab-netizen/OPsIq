/**
 * [db] Customer Records — cross-business write-isolation ownership guard regression proof.
 *
 * Root cause this closes: createCustomer accepted a client-supplied businessId and persisted it
 * verbatim with no ownership check -- the same bug class already fixed once for
 * BusinessObjective.businessId (commit 3bf4ca8e) and again for CustomerComplaint/
 * OwnerComplianceItem/OwnerEquipment/OwnerSopDocument (see
 * write-isolation-ownership-guard.db.test.ts, the precedent this file mirrors). CustomerRecord's
 * businessId has no Prisma @relation / DB-level foreign key (see prisma/schema.prisma), matching
 * this app's existing soft-FK convention -- nothing stopped a caller from attaching a customer
 * record to a business belonging to a DIFFERENT workspace, to a fixture business, or to a
 * nonexistent id.
 *
 * Fix: createCustomer now calls getBusiness(businessId, workspaceId) before insert -- the same
 * function every Sales/Finance write path already uses -- fails closed with NotFoundError on any
 * businessId that isn't a real, non-fixture business in the caller's own workspace.
 * businessId is a required field on CustomerRecord (unlike the soft-FK models above), so there is
 * no "omitted" case to cover.
 *
 * Cases (A-D, matching the write-isolation-ownership-guard precedent):
 *  A. workspace A + business A (same workspace)          -> PASS
 *  B. workspace A + nonexistent businessId                -> REFUSE, zero rows written
 *  C. workspace A + business belonging to workspace B     -> REFUSE, zero rows written anywhere
 *  D. workspace A + fixture business (same workspace)     -> REFUSE, zero rows written
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-sales/customer-ownership-guard.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createCustomer } from "@/services/owner-sales/customer.service";
import { NotFoundError } from "@/infra/errors";

const actorId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID(); // belongs to wsB
const fixtureBizA = randomUUID(); // belongs to wsA, but isFixtureBusiness=true

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Customer Records cross-business write-isolation ownership guard", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `customer-guard-${actorId}@test.local`, name: "Customer Guard Test", isActive: true, updatedAt: new Date() },
    });
    for (const [id, label] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `Customer Guard WS ${label} ${id.slice(0, 8)}`, slug: `customer-guard-ws-${label.toLowerCase()}-${id.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
      });
    }
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: wsA, name: "Customer Guard Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: wsB, name: "Customer Guard Business B (other workspace)", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: fixtureBizA, workspaceId: wsA, name: "Customer Guard Fixture Business", businessType: "cafe", currency: "INR", createdBy: actorId, isFixtureBusiness: true },
    });
  });

  afterAll(async () => {
    await db.customerRecord.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] A. same-workspace business -> creates successfully", async () => {
    const record = await createCustomer({ businessId: bizA, name: "Guard case A" }, actorId, wsA);
    expect(record.businessId).toBe(bizA);
  });

  it("[db] B. nonexistent businessId -> refused, nothing written", async () => {
    const bogus = randomUUID();
    const before = await db.customerRecord.count({ where: { workspaceId: wsA } });
    await expect(
      createCustomer({ businessId: bogus, name: "Guard case B" }, actorId, wsA)
    ).rejects.toThrow(NotFoundError);
    expect(await db.customerRecord.count({ where: { workspaceId: wsA } })).toBe(before);
  });

  it("[db] C. cross-workspace business -> refused, no row written in either workspace", async () => {
    const before = await db.customerRecord.count({ where: { workspaceId: wsA } });
    await expect(
      createCustomer({ businessId: bizB, name: "Guard case C" }, actorId, wsA)
    ).rejects.toThrow(NotFoundError);
    expect(await db.customerRecord.count({ where: { workspaceId: wsA } })).toBe(before);
    expect(await db.customerRecord.count({ where: { businessId: bizB } })).toBe(0);
  });

  it("[db] D. fixture business -> refused, nothing written", async () => {
    const before = await db.customerRecord.count({ where: { workspaceId: wsA } });
    await expect(
      createCustomer({ businessId: fixtureBizA, name: "Guard case D" }, actorId, wsA)
    ).rejects.toThrow(NotFoundError);
    expect(await db.customerRecord.count({ where: { workspaceId: wsA } })).toBe(before);
    expect(await db.customerRecord.count({ where: { businessId: fixtureBizA } })).toBe(0);
  });
});
