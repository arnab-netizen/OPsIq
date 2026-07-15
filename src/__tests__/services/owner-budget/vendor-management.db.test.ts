/**
 * Vendor management DB proof — contract history, delivery tracking, performance summary,
 * and approved-vendor controls.
 *
 * `[db]`-gated. Proves: contracts are append-only; delivery records accumulate per vendor;
 * performance summary computes on-time rate and quality rate from persisted records;
 * approve/suspend transitions are correct; workspace isolation holds throughout.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/vendor-management.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createVendor,
  approveVendor,
  suspendVendor,
  recordVendorContract,
  listVendorContracts,
  recordVendorDelivery,
  getVendorPerformanceSummary,
} from "@/services/owner-budget/vendor.service";
import { NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
let bizId = "";
let vendorId = "";

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `vendor-mgmt-${actor}@example.com`, name: "Vendor Mgmt Test", isActive: true, updatedAt: new Date() },
  });

  const biz = await createBusiness(
    { name: "Vendor Mgmt Biz", businessType: "generic_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
    actor, wsA
  );
  bizId = biz.id;

  const vendor = await createVendor(bizId, {
    name: "Acme Raw Materials",
    paymentTermsDays: 30,
    switchingCostEstimate: 5000,
    replacementLeadTimeDays: 14,
  }, actor, wsA);
  vendorId = vendor.id;
});

afterAll(async () => {
  await db.vendorDeliveryRecord.deleteMany({ where: { vendorId } }).catch(() => undefined);
  await db.vendorContract.deleteMany({ where: { vendorId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { actorId: actor } }).catch(() => undefined);
  await db.vendorRecord.deleteMany({ where: { businessId: bizId } }).catch(() => undefined);
  await db.ownerBusiness.delete({ where: { id: bizId } }).catch(() => undefined);
  await db.user.delete({ where: { id: actor } }).catch(() => undefined);
});

describe("[db] Vendor management — approval controls", () => {
  it("[db] vendor starts as PENDING_REVIEW and can be approved", async () => {
    const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId } });
    expect(vendor?.approvalStatus).toBe("PENDING_REVIEW");

    const updated = await approveVendor(wsA, vendorId, actor);
    expect(updated.approvalStatus).toBe("APPROVED");
  });

  it("[db] approved vendor can be suspended", async () => {
    const updated = await suspendVendor(wsA, vendorId, actor, "Failed two quality checks");
    expect(updated.approvalStatus).toBe("SUSPENDED");
  });

  it("[db] approve rejects cross-workspace access", async () => {
    await expect(approveVendor(wsB, vendorId, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] payment terms and switching cost are persisted", async () => {
    const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId } });
    expect(vendor?.paymentTermsDays).toBe(30);
    expect(vendor?.switchingCostEstimate).toBe(5000);
    expect(vendor?.replacementLeadTimeDays).toBe(14);
  });
});

describe("[db] Vendor management — contract history", () => {
  it("[db] records a contract and persists all fields", async () => {
    const row = await recordVendorContract(wsA, actor, {
      vendorId,
      businessId: bizId,
      contractRef: "CTR-2026-001",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      pricePerUnit: 12.5,
      currency: "GBP",
      termsDaysNet: 30,
      scope: "Raw materials supply",
      notes: "Agreed at annual review",
    });

    expect(row.contractRef).toBe("CTR-2026-001");
    expect(row.pricePerUnit).toBe(12.5);
    expect(row.currency).toBe("GBP");
    expect(row.vendorId).toBe(vendorId);
    expect(row.workspaceId).toBe(wsA);
  });

  it("[db] second contract adds a new record without mutating the first", async () => {
    await recordVendorContract(wsA, actor, {
      vendorId,
      businessId: bizId,
      contractRef: "CTR-2027-001",
      startDate: new Date("2027-01-01"),
      pricePerUnit: 13.75,
      currency: "GBP",
    });

    const contracts = await listVendorContracts(wsA, vendorId);
    expect(contracts.length).toBeGreaterThanOrEqual(2);
    const refs = contracts.map((c) => c.contractRef);
    expect(refs).toContain("CTR-2026-001");
    expect(refs).toContain("CTR-2027-001");
    // Ordered by startDate desc — latest first
    expect(contracts[0].contractRef).toBe("CTR-2027-001");
  });

  it("[db] listVendorContracts rejects cross-workspace access", async () => {
    await expect(listVendorContracts(wsB, vendorId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("[db] Vendor management — delivery performance", () => {
  it("[db] records deliveries and computes correct performance summary", async () => {
    // Seed: 3 on-time, 1 late, 1 not recorded; 3 quality accepted, 1 rejected, 1 null
    await recordVendorDelivery(wsA, actor, {
      vendorId, businessId: bizId,
      expectedDate: new Date("2026-02-01"),
      actualDate: new Date("2026-02-01"),
      onTime: true, qualityAccepted: true,
    });
    await recordVendorDelivery(wsA, actor, {
      vendorId, businessId: bizId,
      expectedDate: new Date("2026-03-01"),
      actualDate: new Date("2026-03-01"),
      onTime: true, qualityAccepted: true,
    });
    await recordVendorDelivery(wsA, actor, {
      vendorId, businessId: bizId,
      expectedDate: new Date("2026-04-01"),
      actualDate: new Date("2026-04-03"),
      onTime: false, qualityAccepted: false,
    });
    await recordVendorDelivery(wsA, actor, {
      vendorId, businessId: bizId,
      expectedDate: new Date("2026-05-01"),
      actualDate: new Date("2026-04-30"),
      onTime: true, qualityAccepted: true,
    });
    // Delivery with no outcome recorded yet
    await recordVendorDelivery(wsA, actor, {
      vendorId, businessId: bizId,
      expectedDate: new Date("2026-06-01"),
      onTime: null, qualityAccepted: null,
    });

    const summary = await getVendorPerformanceSummary(wsA, vendorId);

    expect(summary.vendorId).toBe(vendorId);
    expect(summary.totalDeliveries).toBe(5);
    expect(summary.onTimeCount).toBe(3);
    expect(summary.lateCount).toBe(1);
    // onTime rate = 3 / 4 (4 records with non-null onTime)
    expect(summary.onTimeRate).toBeCloseTo(0.75);
    expect(summary.qualityAcceptedCount).toBe(3);
    expect(summary.qualityRejectedCount).toBe(1);
    // quality rate = 3 / 4
    expect(summary.qualityRate).toBeCloseTo(0.75);
  });

  it("[db] performance summary returns null rates when no outcome recorded", async () => {
    const vendor2 = await createVendor(bizId, { name: "Pending Vendor" }, actor, wsA);
    await recordVendorDelivery(wsA, actor, {
      vendorId: vendor2.id, businessId: bizId,
      expectedDate: new Date("2026-07-01"),
      onTime: null, qualityAccepted: null,
    });

    const summary = await getVendorPerformanceSummary(wsA, vendor2.id);
    expect(summary.totalDeliveries).toBe(1);
    expect(summary.onTimeRate).toBeNull();
    expect(summary.qualityRate).toBeNull();

    // cleanup
    await db.vendorDeliveryRecord.deleteMany({ where: { vendorId: vendor2.id } });
    await db.vendorRecord.delete({ where: { id: vendor2.id } });
  });

  it("[db] performance summary rejects cross-workspace access", async () => {
    await expect(getVendorPerformanceSummary(wsB, vendorId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] delivery records from workspace B do not appear in workspace A summary", async () => {
    // Create a separate vendor in wsB with different performance data
    const bizB = await createBusiness(
      { name: "WsB Biz", businessType: "generic_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      actor, wsB
    );
    const vendorB = await createVendor(bizB.id, { name: "Vendor B" }, actor, wsB);
    // Record a different delivery in wsB with onTime=false
    await recordVendorDelivery(wsB, actor, {
      vendorId: vendorB.id, businessId: bizB.id,
      expectedDate: new Date("2026-02-01"),
      onTime: false, qualityAccepted: false,
    });

    // wsA summary must not include wsB delivery
    const summaryA = await getVendorPerformanceSummary(wsA, vendorId);
    // onTimeRate should remain 0.75 (not affected by wsB delivery)
    expect(summaryA.onTimeRate).toBeCloseTo(0.75);

    // cleanup wsB data
    await db.vendorDeliveryRecord.deleteMany({ where: { vendorId: vendorB.id } });
    await db.vendorRecord.deleteMany({ where: { businessId: bizB.id } });
    await db.ownerBusiness.delete({ where: { id: bizB.id } }).catch(() => undefined);
  });
});
