/**
 * Owner Trust, Audit & Explainability (Module 11 Slice 2) — service-layer proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the proven owner-domain migrations applied. Proves that the trust service builds
 * credible §18 explanation cards over a real persisted finance diagnosis cycle
 * (every card carries the eight required fields and never invents values), and that
 * the entity audit trail surfaces the governed diagnosis-run event. Owns no table.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-trust/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getCycleExplanations, getEntityAuditTrail } from "@/services/owner-trust/trust.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `trust-test-${actor}@example.com`, name: "Trust Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Trust Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function leakySnapshot() {
  // Poor metrics → guarantees findings + actions (discount leakage + low margin).
  return {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    currency: "INR",
    revenue: 100000,
    fixedCosts: 40000,
    variableCosts: 40000,
    discountAmount: 15000,
    cashOnHand: 50000,
  };
}

describe("[db] Owner Trust service", () => {
  it("[db] builds credible §18 explanation cards over a real finance cycle and never invents values", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.findings.length).toBeGreaterThan(0);

    const result = await getCycleExplanations("finance", cycle.id, workspaceId);
    expect(result.domain).toBe("finance");
    expect(result.cycleId).toBe(cycle.id);
    expect(typeof result.generatedAt).toBe("string");
    expect(result.explanations.length).toBe(cycle.findings.length);

    for (const card of result.explanations) {
      // The eight §18 credibility fields are all present.
      expect(card.whatWasDetected).toBeTruthy();
      expect(card.whyItMatters).toBeTruthy();
      expect(card.sourceDataUsed.metric).toBeTruthy();
      expect(card.calculationUsed).toBeTruthy();
      expect(["low", "moderate", "high"]).toContain(card.confidence.label);
      expect(card.riskIfIgnored).toBeTruthy();
      expect(["low", "moderate", "high"]).toContain(card.expectedImpact.label);
      // verification carries a metric/method pair (may be null when none exists).
      expect(card.verification).toHaveProperty("metric");
      expect(card.verification).toHaveProperty("method");
      // Anti-hallucination invariant is structurally guaranteed.
      expect(card.hasInventedValues).toBe(false);
      // A missing source value is labeled "missing" and surfaced as a gap, never invented.
      if (card.sourceDataUsed.value === null) {
        expect(card.sourceDataUsed.valueLabel).toBe("missing");
        expect(card.dataGaps).toContain(card.sourceDataUsed.metric);
      }
    }

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] surfaces the governed diagnosis-run event in the entity audit trail", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    const events = await getEntityAuditTrail(cycle.id, workspaceId);
    expect(events.length).toBeGreaterThan(0);
    const names = events.map((e) => e.eventName);
    expect(names).toContain(AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN);
    for (const e of events) {
      expect(e.entityId).toBe(cycle.id);
      expect(typeof e.occurredAt).toBe("string");
    }

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] enforces workspace isolation (cross-workspace cycle read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    await expect(getCycleExplanations("finance", cycle.id, ws())).rejects.toThrow();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });
});
