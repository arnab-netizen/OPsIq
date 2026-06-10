/**
 * Phase D1-C: Admin Billing Diagnostics — Database-backed service tests
 *
 * Proves the admin billing diagnostics service runs against the REAL persisted
 * schema (BillingAccount / Subscription / Plan / PlanCapability / UsageEvent),
 * is strictly workspace-scoped, exposes only safe fields, and produces correct
 * entitlement decisions. These tests exercise the real Prisma query that the
 * prior (code-inspection / DTO-only) tests never executed.
 *
 * Read-only: the billing diagnostics service performs no writes.
 *
 * Requires a real database (PostgreSQL). Self-skips when no
 * DATABASE_URL/TEST_DATABASE_URL is configured; CI (phase-d-verification.yml)
 * provides PostgreSQL and is the canonical verification environment.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  getBillingDiagnostic,
  getBillingExportPacket,
} from "@/services/admin-billing-diagnostics.service";
import { BILLING_STATES } from "@/lib/billing/admin-billing-diagnostics.dto";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// Isolated identifiers for this test run.
const wsFull = randomUUID(); // has account + active subscription + plan + caps + usage
const wsB = randomUUID(); // separate workspace, must never leak into wsFull
const wsNoAccount = randomUUID(); // no billing account
const wsNoSub = randomUUID(); // account but no subscription

const baFull = randomUUID();
const baB = randomUUID();
const baNoSub = randomUUID();
const planA = randomUUID();
const planB = randomUUID();
const subFull = randomUUID();
const subB = randomUUID();

const periodStart = new Date("2026-01-01T00:00:00.000Z");
const periodEnd = new Date("2026-12-31T00:00:00.000Z");
const usageAt = new Date("2026-02-01T00:00:00.000Z");

const createdPlanIds = [planA, planB];
const createdBaIds = [baFull, baB, baNoSub];
const createdWorkspaceIds = [wsFull, wsB, wsNoAccount, wsNoSub];

describe.skipIf(!SHOULD_RUN_DB_TESTS)("Phase D1-C: admin billing diagnostics (DB-backed)", () => {
  beforeAll(async () => {
    // Plans (Plan.name is unique → suffix with id fragment).
    await db.plan.createMany({
      data: [
        {
          id: planA,
          name: `Phase D Plan A ${planA.substring(0, 8)}`,
          description: "Plan A",
          priceMonthly: 49,
          priceYearly: 490,
          updatedAt: new Date(),
        },
        {
          id: planB,
          name: `Phase D Plan B ${planB.substring(0, 8)}`,
          description: "Plan B",
          priceMonthly: 99,
          priceYearly: 990,
          updatedAt: new Date(),
        },
      ],
    });

    // Plan A capabilities: one limited (seats=5), one unlimited (api_calls=null).
    await db.planCapability.createMany({
      data: [
        { id: randomUUID(), planId: planA, key: "seats", limit: 5, description: "Seats" },
        { id: randomUUID(), planId: planA, key: "api_calls", limit: null, description: "API calls" },
      ],
    });
    // Plan B capability uses a distinct key so leakage would be detectable.
    await db.planCapability.createMany({
      data: [{ id: randomUUID(), planId: planB, key: "secret_b_capability", limit: 1 }],
    });

    // Billing accounts.
    await db.billingAccount.createMany({
      data: [
        {
          id: baFull,
          workspaceId: wsFull,
          providerCustomerId: "cus_fullA",
          status: "active",
          stripeCustomerId: `cus_${baFull.substring(0, 10)}`,
          updatedAt: new Date(),
        },
        {
          id: baB,
          workspaceId: wsB,
          providerCustomerId: "cus_B",
          status: "active",
          stripeCustomerId: `cus_${baB.substring(0, 10)}`,
          updatedAt: new Date(),
        },
        {
          id: baNoSub,
          workspaceId: wsNoSub,
          providerCustomerId: "cus_noSub",
          status: "active",
          updatedAt: new Date(),
        },
      ],
    });

    // Subscriptions (none for baNoSub).
    await db.subscription.createMany({
      data: [
        {
          id: subFull,
          billingAccountId: baFull,
          planId: planA,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: `sub_${subFull.substring(0, 10)}`,
          updatedAt: new Date(),
        },
        {
          id: subB,
          billingAccountId: baB,
          planId: planB,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: `sub_${subB.substring(0, 10)}`,
          updatedAt: new Date(),
        },
      ],
    });

    // Usage events (within the current period).
    await db.usageEvent.createMany({
      data: [
        { id: randomUUID(), workspaceId: wsFull, key: "seats", value: 1, timestamp: usageAt },
        { id: randomUUID(), workspaceId: wsFull, key: "seats", value: 2, timestamp: usageAt },
        { id: randomUUID(), workspaceId: wsFull, key: "api_calls", value: 100, timestamp: usageAt },
        // Workspace B usage with a distinct key — must never appear for wsFull.
        { id: randomUUID(), workspaceId: wsB, key: "secret_b_usage", value: 999, timestamp: usageAt },
      ],
    });
  });

  afterAll(async () => {
    if (!SHOULD_RUN_DB_TESTS) return;
    await db.usageEvent.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
    await db.subscription.deleteMany({ where: { id: { in: [subFull, subB] } } });
    await db.planCapability.deleteMany({ where: { planId: { in: createdPlanIds } } });
    await db.billingAccount.deleteMany({ where: { id: { in: createdBaIds } } });
    await db.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
  });

  it("returns a full diagnostic for a seeded workspace (account, subscription, plan, capabilities, usage, entitlements)", async () => {
    const d = await getBillingDiagnostic(wsFull);

    expect(d.workspaceId).toBe(wsFull);
    expect(d.account.billingAccountId).toBe(baFull);
    expect(d.account.status).toBe("active");
    expect(d.subscription.subscriptionId).toBe(subFull);
    expect(d.subscription.status).toBe("active");

    expect(d.plan).toBeDefined();
    expect(d.plan!.planId).toBe(planA);
    // Plan capabilities resolved from the REAL planCapabilities relation.
    const capKeys = d.plan!.capabilities.map((c) => c.key).sort();
    expect(capKeys).toEqual(["api_calls", "seats"]);

    // Usage aggregated per key (seats 1+2 = 3).
    const seatsUsage = d.usage.find((u) => u.key === "seats");
    expect(seatsUsage?.value).toBe(3);

    // Entitlement decisions: seats 3/5 allowed (60%); api_calls unlimited allowed.
    const seats = d.entitlementDecisions.find((e) => e.capability === "seats");
    expect(seats?.allowed).toBe(true);
    expect(seats?.limit).toBe(5);
    expect(seats?.usage).toBe(3);
    expect(seats?.percentageUsed).toBe(60);

    const api = d.entitlementDecisions.find((e) => e.capability === "api_calls");
    expect(api?.allowed).toBe(true);
    expect(api?.limit).toBeNull();

    expect(d.diagnostics.status).toBe("complete");
  });

  it("returns a NO_BILLING_ACCOUNT diagnostic (no throw) when the workspace has no billing account", async () => {
    const d = await getBillingDiagnostic(wsNoAccount);
    expect(d.workspaceId).toBe(wsNoAccount);
    expect(d.diagnostics.missingData).toContain(BILLING_STATES.NO_BILLING_ACCOUNT);
    expect(d.diagnostics.status).toBe("none");
    expect(d.entitlementDecisions).toEqual([]);
  });

  it("returns a NO_ACTIVE_SUBSCRIPTION diagnostic (no throw) when an account exists but has no subscription", async () => {
    const d = await getBillingDiagnostic(wsNoSub);
    expect(d.workspaceId).toBe(wsNoSub);
    expect(d.account.billingAccountId).toBe(baNoSub);
    expect(d.diagnostics.missingData).toContain(BILLING_STATES.NO_ACTIVE_SUBSCRIPTION);
    expect(d.entitlementDecisions).toEqual([]);
  });

  it("is workspace-scoped: querying one workspace never returns another workspace's billing data", async () => {
    const d = await getBillingDiagnostic(wsFull);

    expect(d.account.billingAccountId).toBe(baFull);
    expect(d.account.billingAccountId).not.toBe(baB);
    expect(d.plan!.planId).not.toBe(planB);
    // Workspace B's distinct capability/usage keys must not appear.
    expect(d.plan!.capabilities.some((c) => c.key === "secret_b_capability")).toBe(false);
    expect(d.usage.some((u) => u.key === "secret_b_usage")).toBe(false);
  });

  it("exposes only safe fields (no secret keys, webhook secrets, raw payloads, or tokens)", async () => {
    const d = await getBillingDiagnostic(wsFull);
    const serialized = JSON.stringify(d).toLowerCase();

    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("webhook");
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("payload");
    // Stripe IDs are an intentionally-exposed, non-secret identifier in the DTO.
    expect(d.account.stripeCustomerId).toBeDefined();
  });

  it("returns an export packet with generatedAt and supportMetadata (no secrets)", async () => {
    const p = await getBillingExportPacket(wsFull);

    expect(p.workspaceId).toBe(wsFull);
    expect(typeof p.generatedAt).toBe("string");
    expect(p.supportMetadata).toBeDefined();
    expect(p.supportMetadata.diagnosticStatus).toBe("complete");
    expect(Array.isArray(p.supportMetadata.missingData)).toBe(true);
    expect(p.plan!.planId).toBe(planA);

    const serialized = JSON.stringify(p).toLowerCase();
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token");
  });
});
