/**
 * Dynamic Budget cross-module signal router — DB-backed proof (Slice 6).
 *
 * `[db]`-gated. Proves, through the real service + audit ledger:
 * - every routed signal is recorded as an OWNER_BUDGET_SIGNAL_ROUTED audit event
 *   (correlationId = reassessmentId), with the correct consumption decision;
 * - a financially-material signal triggers a finance re-diagnosis (new
 *   OwnerFinanceCycle + OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED) when a
 *   finance snapshot exists;
 * - with no finance snapshot, no re-diagnosis runs but signals are still routed
 *   (gap-safe);
 * - routing is idempotent (re-invocation for the same reassessment does not
 *   duplicate audit events);
 * - non-financial signals route audit-only (no re-diagnosis);
 * - routing is workspace-scoped (no cross-workspace leak);
 * - a real reassessBudget routes its signals end-to-end.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/signal-router.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { routeReassessmentSignals } from "@/services/owner-budget/signal-router.service";
import { createBudgetPeriod, addBudgetLine } from "@/services/owner-budget/budget.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { BudgetSignal } from "@/domain/owner-budget/types";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `sigrouter-${actor}@example.com`, name: "Sig Router Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Sig Router Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor, workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}

const sig = (type: BudgetSignal["type"], severity: BudgetSignal["severity"] = "HIGH"): BudgetSignal =>
  ({ type, severity, message: `${type} message` });

const routedEvents = (workspaceId: string, reassessmentId: string) =>
  db.auditEvent.findMany({ where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_SIGNAL_ROUTED, correlationId: reassessmentId } });

const crossModuleEvents = (workspaceId: string, reassessmentId: string) =>
  db.auditEvent.findMany({ where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED, correlationId: reassessmentId } });

describe("[db] Dynamic Budget cross-module signal router", () => {
  it("[db] records one OWNER_BUDGET_SIGNAL_ROUTED audit event per signal", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const reassessmentId = randomUUID();
    const res = await routeReassessmentSignals({
      businessId, workspaceId, actorId: actor, reassessmentId,
      signals: [sig("vendor_pressure_risk"), sig("spend_proof_missing"), sig("revenue_leakage_risk")],
    });
    expect(res.routed).toBe(3);
    expect(res.alreadyRouted).toBe(false);
    const events = await routedEvents(workspaceId, reassessmentId);
    expect(events).toHaveLength(3);
    const byType = new Map(
      events.map((e) => {
        const p = e.payload as Record<string, unknown>;
        return [p.signalType as string, p] as const;
      })
    );
    expect(byType.get("vendor_pressure_risk")?.consumptionMode).toBe("AUDIT_SIGNAL_ONLY");
    expect(byType.get("vendor_pressure_risk")?.consumerExists).toBe(false);
    expect(byType.get("vendor_pressure_risk")?.gapReason).toBeTruthy();
    expect(byType.get("spend_proof_missing")?.consumerExists).toBe(true);
  });

  it("[db] a financial signal triggers finance re-diagnosis when a finance snapshot exists", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const reassessmentId = randomUUID();
    const res = await routeReassessmentSignals({
      businessId, workspaceId, actorId: actor, reassessmentId,
      signals: [sig("cash_runway_risk", "CRITICAL"), sig("vendor_pressure_risk")],
    });
    expect(res.reDiagnosisTriggered).toBe(true);
    expect(await crossModuleEvents(workspaceId, reassessmentId)).toHaveLength(1);
    // A finance cycle was created by the re-diagnosis.
    const cycles = await db.ownerFinanceCycle.findMany({ where: { workspaceId, businessId } });
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("[db] no finance snapshot ⇒ no re-diagnosis, signals still routed (gap-safe)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const reassessmentId = randomUUID();
    const res = await routeReassessmentSignals({
      businessId, workspaceId, actorId: actor, reassessmentId,
      signals: [sig("cash_runway_risk", "CRITICAL")],
    });
    expect(res.reDiagnosisTriggered).toBe(false);
    expect(await routedEvents(workspaceId, reassessmentId)).toHaveLength(1);
    expect(await crossModuleEvents(workspaceId, reassessmentId)).toHaveLength(0);
  });

  it("[db] routing is idempotent — re-invocation does not duplicate audit events", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const reassessmentId = randomUUID();
    const signals = [sig("vendor_pressure_risk"), sig("spend_proof_missing")];
    await routeReassessmentSignals({ businessId, workspaceId, actorId: actor, reassessmentId, signals });
    const second = await routeReassessmentSignals({ businessId, workspaceId, actorId: actor, reassessmentId, signals });
    expect(second.alreadyRouted).toBe(true);
    expect(await routedEvents(workspaceId, reassessmentId)).toHaveLength(2); // not 4
  });

  it("[db] non-financial signals route audit-only (no finance re-diagnosis)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const reassessmentId = randomUUID();
    const res = await routeReassessmentSignals({
      businessId, workspaceId, actorId: actor, reassessmentId,
      signals: [sig("vendor_pressure_risk"), sig("revenue_leakage_risk"), sig("laundry_consumable_leakage")],
    });
    expect(res.reDiagnosisTriggered).toBe(false);
    expect(await crossModuleEvents(workspaceId, reassessmentId)).toHaveLength(0);
    expect(res.gaps.length).toBeGreaterThan(0);
  });

  it("[db] routing is workspace-scoped (no cross-workspace event leak)", async () => {
    const workspaceId = ws(); const otherWs = ws();
    const businessId = await newBusiness(workspaceId);
    const reassessmentId = randomUUID();
    await routeReassessmentSignals({
      businessId, workspaceId, actorId: actor, reassessmentId, signals: [sig("vendor_pressure_risk")],
    });
    expect(await routedEvents(workspaceId, reassessmentId)).toHaveLength(1);
    expect(await routedEvents(otherWs, reassessmentId)).toHaveLength(0);
  });

  it("[db] a real reassessBudget routes its emitted signals end-to-end", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(
      businessId,
      { label: "May 2026", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
      actor, workspaceId
    );
    // Adding a budget line triggers a real reassessment, which routes its signals.
    await addBudgetLine(
      businessId,
      { periodId: period.id, label: "Referral campaign", category: "growth_roi", plannedAmount: 20000, ownerRole: "manager" },
      actor, workspaceId
    );
    const reassessments = await db.budgetReassessment.findMany({ where: { workspaceId, businessId } });
    expect(reassessments.length).toBeGreaterThan(0);
    // At least one reassessment routed its signals to the ledger.
    const anyRouted = await db.auditEvent.findMany({
      where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_SIGNAL_ROUTED },
    });
    expect(anyRouted.length).toBeGreaterThan(0);
  });
});
