/**
 * [db] Customer Records — cross-business context-isolation regression proof for
 * getCustomer/updateCustomer.
 *
 * Root cause this closes: getCustomer(workspaceId, customerId) and
 * updateCustomer(workspaceId, customerId, input, actorId) filtered CustomerRecord only by
 * workspaceId, never by businessId -- unlike createCustomer/listCustomers, which are both
 * businessId-scoped (see customer-ownership-guard.db.test.ts for createCustomer's guard). A
 * workspace can hold multiple real (non-fixture) businesses, each with its own CustomerRecord
 * rows carrying a distinct businessId. Because the two single-record functions never checked
 * businessId, any customerId belonging to the caller's own workspace was readable and mutable
 * regardless of which business the caller's request was scoped to -- a cross-business exposure
 * within one workspace, reachable via GET/PATCH /api/owner/sales/customers/[customerId].
 *
 * Fix: both functions now take an explicit businessId parameter and match it against the
 * record's own businessId in the same query that already scopes by workspaceId, mirroring the
 * ownership-guard idiom in createCustomer. No separate getBusiness()/isFixtureBusiness check is
 * needed here: createCustomer already refuses to attach a CustomerRecord to a fixture business,
 * so no real record can ever carry a fixture businessId for the match to succeed against --
 * case D below proves that directly.
 *
 * Cases:
 *  A. same workspace, same business                       -> read/update succeed
 *  B. same workspace, sibling business (different biz)     -> read/update refused (null),
 *                                                              nothing mutated
 *  C. foreign workspace                                    -> read/update refused (null),
 *                                                              nothing mutated
 *  D. same workspace, fixture business id supplied          -> read/update refused (null),
 *                                                              nothing mutated
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-sales/customer-context-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createCustomer, getCustomer, updateCustomer } from "@/services/owner-sales/customer.service";

const actorId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID(); // belongs to wsA
const bizA2 = randomUUID(); // belongs to wsA -- sibling business to bizA, same workspace
const bizB = randomUUID(); // belongs to wsB
const fixtureBizA = randomUUID(); // belongs to wsA, isFixtureBusiness=true

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Customer Records cross-business context isolation (getCustomer/updateCustomer)", () => {
  let customerInBizA: string;

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `customer-ctx-${actorId}@test.local`, name: "Customer Context Test", isActive: true, updatedAt: new Date() },
    });
    for (const [id, label] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `Customer Ctx WS ${label} ${id.slice(0, 8)}`, slug: `customer-ctx-ws-${label.toLowerCase()}-${id.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
      });
    }
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: wsA, name: "Customer Ctx Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizA2, workspaceId: wsA, name: "Customer Ctx Business A2 (sibling)", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: wsB, name: "Customer Ctx Business B (other workspace)", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: fixtureBizA, workspaceId: wsA, name: "Customer Ctx Fixture Business", businessType: "cafe", currency: "INR", createdBy: actorId, isFixtureBusiness: true },
    });

    const record = await createCustomer({ businessId: bizA, name: "Context isolation subject" }, actorId, wsA);
    customerInBizA = record.id;
  });

  afterAll(async () => {
    await db.customerRecord.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] A. same workspace + same business -> read succeeds", async () => {
    const found = await getCustomer(wsA, bizA, customerInBizA);
    expect(found?.id).toBe(customerInBizA);
    expect(found?.businessId).toBe(bizA);
  });

  it("[db] A. same workspace + same business -> update succeeds", async () => {
    const updated = await updateCustomer(wsA, bizA, customerInBizA, { name: "Updated in-business name" }, actorId);
    expect(updated?.name).toBe("Updated in-business name");
    const row = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    expect(row?.name).toBe("Updated in-business name");
  });

  it("[db] B. same workspace + sibling business -> read refused (null)", async () => {
    const found = await getCustomer(wsA, bizA2, customerInBizA);
    expect(found).toBeNull();
  });

  it("[db] B. same workspace + sibling business -> update refused, nothing mutated", async () => {
    const before = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    const updated = await updateCustomer(wsA, bizA2, customerInBizA, { name: "Should not apply" }, actorId);
    expect(updated).toBeNull();
    const after = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    expect(after?.name).toBe(before?.name);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("[db] C. foreign workspace -> read refused (null)", async () => {
    const found = await getCustomer(wsB, bizA, customerInBizA);
    expect(found).toBeNull();
  });

  it("[db] C. foreign workspace -> update refused, nothing mutated", async () => {
    const before = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    const updated = await updateCustomer(wsB, bizA, customerInBizA, { name: "Should not apply cross-workspace" }, actorId);
    expect(updated).toBeNull();
    const after = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    expect(after?.name).toBe(before?.name);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("[db] D. fixture business id supplied -> read refused (null)", async () => {
    const found = await getCustomer(wsA, fixtureBizA, customerInBizA);
    expect(found).toBeNull();
  });

  it("[db] D. fixture business id supplied -> update refused, nothing mutated", async () => {
    const before = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    const updated = await updateCustomer(wsA, fixtureBizA, customerInBizA, { name: "Should not apply fixture" }, actorId);
    expect(updated).toBeNull();
    const after = await db.customerRecord.findUnique({ where: { id: customerInBizA } });
    expect(after?.name).toBe(before?.name);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });
});
