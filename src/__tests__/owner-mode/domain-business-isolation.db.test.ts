/**
 * Owner-mode cross-domain acceptance-business isolation -- hostile proof
 * (DB-backed).
 *
 * `[db]`-gated -> runs only under TEST_WITH_DB=true against a real
 * PostgreSQL. Proves the fix for a real, empirically-confirmed defect: the
 * production-acceptance suite's mutating domain specs (finance/sales/
 * operations/strategy/cashflow) used to share ONE acceptance business.
 * enforceOwnerActionGates() reads that business's LATEST OwnerFinanceCycle/
 * OwnerCashflowCycle state regardless of which domain's diagnosis produced
 * it, so one domain's own valid, intentional AT_RISK/INSOLVENT_RISK state
 * silently blocked a DIFFERENT domain's action-lifecycle test (Finance's
 * own already-merged acceptance test leaves the shared business at
 * AT_RISK; Sales/Operations/Strategy are GROWTH_SENSITIVE and are blocked
 * by the safety gate at AT_RISK or worse).
 *
 * This file proves the fix -- giving each domain its OWN business (see
 * tests/production/helpers/domain-business.ts) -- actually eliminates the
 * cross-contamination, using the SAME real services and the SAME real gate
 * every production spec goes through, not a mock.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { createOperationsSnapshot } from "@/services/owner-operations/snapshot.service";
import { runOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { updateOperationsAction } from "@/services/owner-operations/action.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `domain-isolation-test-${actor}@example.com`,
      name: "Domain Isolation Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string, name: string) {
  const b = await createBusiness(
    { name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

// Finance snapshot values that empirically compute survivalState=AT_RISK
// (matching tests/production/20-existing-business-acceptance.spec.ts's own
// synthetic inputs -- confirmed via diagnoseFinanceSnapshot before writing
// this test, not assumed).
function atRiskFinanceSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    revenue: 50000, fixedCosts: 42000, cashOnHand: 2000,
  };
}

// Cashflow snapshot values that empirically compute cashflowState=
// INSOLVENT_RISK (matching tests/production/24-cashflow-acceptance.spec.ts's
// own synthetic inputs).
function insolventCashflowSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    cashInHand: 5000, bankBalance: 0, dailyCollections: 200,
    receivables: 20000, receivablesOverdue: 15000,
    payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000,
    vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
  };
}

function operationsSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    ordersReceived: 200, ordersCompleted: 130, ordersDelayed: 70,
    reworkCount: 30, complaints: 15, staffHours: 500,
    machineCapacityUnits: 150, idleHours: 150,
    deliveryAttempts: 100, deliveryFailures: 30,
    sopChecks: 100, sopMisses: 50,
  };
}

function salesSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000,
    averageOrderValue: 10000, newCustomers: 5, repeatCustomers: 0,
    lostCustomers: 10, complaints: 20, discountAmount: 30000,
    refundAmount: 5000, staffCount: 2,
  };
}

describe("[db] cross-domain acceptance-business isolation", () => {
  // Items 1-2 of the required hostile-recurrence proof: Finance can leave
  // its OWN business AT_RISK, and Sales can still complete an action on a
  // SEPARATE business, because enforceOwnerActionGates() only ever reads
  // finance/cashflow cycles for the business the action itself belongs to.
  it("[db] Finance leaving its business AT_RISK does not block Sales completing an action on a different business", async () => {
    const workspaceId = ws();
    const financeBusinessId = await newBusiness(workspaceId, "Isolation Finance Biz");
    const salesBusinessId = await newBusiness(workspaceId, "Isolation Sales Biz");

    const finSnap = await createFinancialSnapshot(financeBusinessId, atRiskFinanceSnapshot(), actor, workspaceId);
    const finCycle = await runFinanceDiagnosis(financeBusinessId, finSnap.id, actor, workspaceId);
    expect(finCycle.survivalState).toBe("AT_RISK");

    const salesSnap = await createSalesSnapshot(salesBusinessId, salesSnapshot(), actor, workspaceId);
    const salesCycle = await runSalesDiagnosis(salesBusinessId, salesSnap.id, actor, workspaceId);
    const action = salesCycle.actions[0];

    await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);
    // This is the exact transition that was proven BLOCKED before the fix
    // when Sales shared Finance's business (see PR #341's description).
    const started = await updateSalesAction(action.id, { status: "in_progress" }, actor, workspaceId);
    expect(started.status).toBe("in_progress");

    await teardownOwnerBusiness(financeBusinessId);
    await teardownOwnerBusiness(salesBusinessId);
  });

  // Item 3: Cashflow can use INSOLVENT_RISK test data (needed to guarantee
  // findings for its own diagnosis) without blocking Operations, a
  // different GROWTH_SENSITIVE domain, on its own separate business.
  it("[db] Cashflow using INSOLVENT_RISK test data does not block Operations completing an action on a different business", async () => {
    const workspaceId = ws();
    const cashflowBusinessId = await newBusiness(workspaceId, "Isolation Cashflow Biz");
    const opsBusinessId = await newBusiness(workspaceId, "Isolation Operations Biz");

    const cfSnap = await createCashflowSnapshot(cashflowBusinessId, insolventCashflowSnapshot(), actor, workspaceId);
    const cfCycle = await runCashflowDiagnosis(cashflowBusinessId, cfSnap.id, actor, workspaceId);
    expect(cfCycle.cashflowState).toBe("INSOLVENT_RISK");

    const opsSnap = await createOperationsSnapshot(opsBusinessId, operationsSnapshot(), actor, workspaceId);
    const opsCycle = await runOperationsDiagnosis(opsBusinessId, opsSnap.id, actor, workspaceId);
    const action = opsCycle.actions[0];

    await updateOperationsAction(action.id, { status: "assigned" }, actor, workspaceId);
    const started = await updateOperationsAction(action.id, { status: "in_progress" }, actor, workspaceId);
    expect(started.status).toBe("in_progress");

    await teardownOwnerBusiness(cashflowBusinessId);
    await teardownOwnerBusiness(opsBusinessId);
  });

  // Item 7: resolveOrCreateDomainBusiness() is idempotent within a single
  // run -- a second call for the same domain in the same run reuses the
  // cached business id instead of creating a duplicate. Exercises the real
  // helper (not a reimplementation), using a fake Playwright context/page
  // whose request.post() is a call-counted stub, and a throwaway domain
  // name so this test never collides with a real run's cache files.
  it("[db] resolveOrCreateDomainBusiness is idempotent within a single run (no duplicate business created)", async () => {
    const { resolveOrCreateDomainBusiness } = await import(
      "../../../tests/production/helpers/domain-business"
    );
    const cacheFile = join(
      process.cwd(),
      "production-test-results/evidence/domain-business-__idempotency_test__.json"
    );
    if (existsSync(cacheFile)) unlinkSync(cacheFile);

    let postCallCount = 0;
    const fakeBusinessId = randomUUID();
    const fakePage = {
      request: {
        post: async () => {
          postCallCount++;
          return { ok: () => true, status: () => 201, json: async () => ({ id: fakeBusinessId }) };
        },
      },
    } as unknown as Page;
    const testDomain = "__idempotency_test__" as unknown as Parameters<typeof resolveOrCreateDomainBusiness>[2];

    try {
      const first = await resolveOrCreateDomainBusiness(undefined, fakePage, testDomain);
      const second = await resolveOrCreateDomainBusiness(undefined, fakePage, testDomain);
      expect(first).toBe(fakeBusinessId);
      expect(second).toBe(fakeBusinessId);
      expect(postCallCount).toBe(1);

      const record = JSON.parse(readFileSync(cacheFile, "utf-8"));
      expect(record.businessId).toBe(fakeBusinessId);
    } finally {
      if (existsSync(cacheFile)) unlinkSync(cacheFile);
    }
  });
});
