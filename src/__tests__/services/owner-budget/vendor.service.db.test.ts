/**
 * Owner Budget vendor master + invoice-hash duplicate detection + funded-initiative
 * outcome persistence — DB-backed proof (Sections 20, 44).
 *
 * `[db]`-gated. Proves: vendor bank verification clears the payment-hold signal;
 * duplicate invoice hashes surface vendor_control_risk in the persisted plan;
 * funded-initiative outcomes persist with a learning-safe classification; and
 * workspace isolation holds.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/vendor.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createBudgetPeriod, recordSpendEntry, reassessBudget, getBudgetGuidance } from "@/services/owner-budget/budget.service";
import { createVendor, verifyVendorBank, closeFundedInitiative, getInitiativeOutcomes } from "@/services/owner-budget/vendor.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor }, update: {},
    create: { id: actor, email: `vendor-test-${actor}@example.com`, name: "Vendor Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.spendEntry.deleteMany({ where: { businessId: id } }).catch(() => undefined);
    await db.vendorRecord.deleteMany({ where: { businessId: id } }).catch(() => undefined);
    await db.fundedInitiativeOutcome.deleteMany({ where: { businessId: id } }).catch(() => undefined);
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function setup(workspaceId: string) {
  const b = await createBusiness(
    { name: "Vendor Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor, workspaceId
  );
  businessIds.push(b.id);
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId: b.id,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
  const period = await createBudgetPeriod(b.id, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
  return { businessId: b.id, periodId: period.id };
}

describe("[db] Owner Budget vendor master + duplicate invoice + initiative", () => {
  it("[db] vendor bank verification clears the payment-hold vendor_control_risk", async () => {
    const workspaceId = ws();
    const { businessId, periodId } = await setup(workspaceId);
    const vendor = await createVendor(businessId, { name: "Acme Supplies", bankAccountRef: "ref-1" }, actor, workspaceId);

    // Spend linked to an unverified vendor with a bank change → hold.
    const { plan } = await recordSpendEntry(
      businessId,
      { periodId, label: "Vendor payment", category: "essential_operations", amount: 8000, state: "committed", requestedByUserId: actor, ownerApprovalThreshold: 50000, vendorBankChanged: true, vendorId: vendor.id },
      actor, workspaceId
    );
    expect(plan.signals.some((s) => s.type === "vendor_control_risk")).toBe(true);
    expect(plan.spendRestrictions.some((r) => r.toLowerCase().includes("hold vendor payment"))).toBe(true);

    // Independently verify the bank → reassess → hold cleared.
    await verifyVendorBank(businessId, vendor.id, actor, workspaceId);
    const after = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "spend_entry_edited", triggerEventId: `verify:${vendor.id}` });
    expect(after.spendRestrictions.some((r) => r.toLowerCase().includes("hold vendor payment"))).toBe(false);
  });

  it("[db] duplicate invoice hashes surface vendor_control_risk in the persisted plan", async () => {
    const workspaceId = ws();
    const { businessId, periodId } = await setup(workspaceId);
    await recordSpendEntry(businessId, { periodId, label: "Invoice A", category: "essential_operations", amount: 5000, state: "committed", requestedByUserId: actor, ownerApprovalThreshold: 50000, invoiceHash: "HASH-DUP" }, actor, workspaceId);
    const { plan } = await recordSpendEntry(businessId, { periodId, label: "Invoice A (dup)", category: "essential_operations", amount: 5000, state: "committed", requestedByUserId: actor, ownerApprovalThreshold: 50000, invoiceHash: "HASH-DUP" }, actor, workspaceId);
    expect(plan.signals.some((s) => s.type === "vendor_control_risk")).toBe(true);
  });

  it("[db] persists a funded-initiative outcome with a learning-safe classification", async () => {
    const workspaceId = ws();
    const { businessId } = await setup(workspaceId);
    const { record, classification } = await closeFundedInitiative(
      businessId, "Referral campaign",
      { outcomeVerified: true, expectedImpact: 100000, actualImpact: 30000, note: "Underperformed" },
      actor, workspaceId
    );
    expect(classification.outcome).toBe("FAILED");
    expect(record.safeForLearning).toBe(true);

    const list = await getInitiativeOutcomes(workspaceId, businessId);
    expect(list.some((o: any) => o.initiativeLabel === "Referral campaign" && o.outcome === "FAILED")).toBe(true);

    // Workspace isolation.
    await expect(getInitiativeOutcomes(ws(), businessId)).rejects.toThrow();
  });

  it("[db] unverified initiative outcome is never learning-safe", async () => {
    const workspaceId = ws();
    const { businessId } = await setup(workspaceId);
    const { classification } = await closeFundedInitiative(businessId, "Unverified test", { outcomeVerified: false }, actor, workspaceId);
    expect(classification.outcome).toBe("UNVERIFIED");
    expect(classification.safeForLearning).toBe(false);
    void getBudgetGuidance; // (guidance adapter covered elsewhere)
  });
});
