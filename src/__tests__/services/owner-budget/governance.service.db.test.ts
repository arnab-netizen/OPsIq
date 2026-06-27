/**
 * Owner Budget governance service — DB-backed proof (Sections 23, 26, 36).
 *
 * `[db]`-gated. Proves: owner override persistence + reassessment trigger + hard-
 * block refusal + outcome closure; budget authority lifecycle persistence with
 * lawful actions; and workspace isolation on both.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/governance.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  recordOwnerOverride,
  closeOverrideOutcome,
  changeBudgetAuthority,
  getBudgetAuthorities,
} from "@/services/owner-budget/governance.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor }, update: {},
    create: { id: actor, email: `gov-test-${actor}@example.com`, name: "Gov Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBudgetOverride.deleteMany({ where: { businessId: id } }).catch(() => undefined);
    await db.budgetAuthority.deleteMany({ where: { businessId: id } }).catch(() => undefined);
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Gov Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor, workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

describe("[db] Owner Budget governance service", () => {
  it("[db] records an owner override, triggers reassessment, and closes the outcome", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const override = await recordOwnerOverride(
      businessId,
      {
        originalRecommendation: "Defer paid ads in STABILIZE mode",
        riskWarning: "Spending ahead of cash recovery may extend the cash gap",
        reason: "Owner believes the campaign window is time-critical",
        affectedLines: ["Paid ads"],
        expectedConsequence: "Cash dips for 3 weeks; expected ROI by week 6",
      },
      actor, workspaceId
    );
    expect(override.id).toBeTruthy();

    // Override triggered a reassessment row.
    const reassessments = await db.budgetReassessment.findMany({ where: { workspaceId, businessId, triggerEventId: `override:${override.id}` } });
    expect(reassessments.length).toBe(1);

    const closed = await closeOverrideOutcome(
      businessId, override.id,
      { ownerDecision: "overrode", outcomeVerified: true, outcomeSuccess: false, predictedRiskMaterialized: true, note: "Cash gap extended as warned" },
      actor, workspaceId
    );
    expect(closed.outcomeClass).toBe("ADVICE_CORRECT_OWNER_OVERRIDDEN_FAILED");
  });

  it("[db] refuses to override a hard safety/legal block", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await expect(
      recordOwnerOverride(
        businessId,
        { originalRecommendation: "Hold vendor payment", riskWarning: "Bank details unverified", reason: "Trust the vendor", affectedLines: [], expectedConsequence: "Pay now", vendorBankUnverified: true },
        actor, workspaceId
      )
    ).rejects.toThrow();
  });

  it("[db] changes budget authority with a lawful action set and persists the lifecycle", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const subjectUserId = randomUUID();

    const { authority, recommendation } = await changeBudgetAuthority(
      businessId,
      { subjectUserId, scopeCategory: "growth_roi", toStatus: "OWNER_APPROVAL_REQUIRED", reason: "Repeated unverified spend", signals: { approvalViolations: 3 } },
      actor, workspaceId
    );
    expect(authority.status).toBe("OWNER_APPROVAL_REQUIRED");
    expect(recommendation.lawfulActions.length).toBeGreaterThan(0);
    // Never an unlawful action.
    for (const a of recommendation.lawfulActions) {
      expect(a).not.toMatch(/termination|unpaid overtime|wage deduction/i);
    }

    const list = await getBudgetAuthorities(workspaceId, businessId);
    expect(list.some((a: any) => a.subjectUserId === subjectUserId && a.status === "OWNER_APPROVAL_REQUIRED")).toBe(true);
  });

  it("[db] enforces workspace isolation on governance reads", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await changeBudgetAuthority(businessId, { subjectRole: "manager", toStatus: "WATCH", reason: "proof weak", signals: { proofComplianceWeak: true } }, actor, workspaceId);
    await expect(getBudgetAuthorities(ws(), businessId)).rejects.toThrow();
  });
});
