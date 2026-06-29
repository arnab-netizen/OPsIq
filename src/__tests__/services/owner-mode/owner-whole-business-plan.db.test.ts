/**
 * [db]-gated proof that the production whole-business plan SERVICE (the command-center integration
 * seam) reads REAL persisted records through the providers, derives a real context, applies the
 * workspace-private learning artifact with provenance, and is workspace-scoped (no cross-workspace
 * leakage). Requires TEST_WITH_DB=true with migrations applied + prisma generated; intended for CI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedOwnerDbCase, cleanupOwnerDbCase, type OwnerDbCaseIds } from "../../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const businessId = randomUUID();
const userId = randomUUID();
const ids: OwnerDbCaseIds = { workspaceId, businessId, userId, now: NOW };

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] whole-business plan service over real persisted state", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `wbp-${userId}@example.com`, name: "WBP", isActive: true, updatedAt: NOW } });
    for (const wid of [workspaceId, otherWorkspaceId]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({ where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: userId } });
    }
    await seedOwnerDbCase(prisma, ids);
  });
  afterAll(async () => {
    await cleanupOwnerDbCase(prisma, ids);
  });

  it("[db] generates a provider-backed whole-business view from the new runtime", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });
    expect(view.found).toBe(true);
    expect(view.generatedFromRuntime).toBe(true);
    expect(view.data.criticalDomainsRealProviderBacked).toBe(true);
    expect(view.data.realProviderDomains).toContain("finance_cash");
    expect(view.nextBestAction.length).toBeGreaterThan(0);
    expect(view.topPriority.label.length).toBeGreaterThan(0);
    expect(view.domainHealth.length).toBeGreaterThan(0);
    expect(view.unsafeCount).toBe(0);
  });

  it("[db] applies the workspace-private stored learning artifact with provenance", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });
    expect(view.learning.applied).toBe(true);
    expect(view.learning.artifactIds.length).toBeGreaterThan(0);
  });

  it("[db] dominant constraint reflects the persisted compliance/cash state", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });
    expect(view.dominantConstraint).toBe("compliance_block");
    expect(view.arbitration.ownerApprovalNeeded).toBe(true);
  });

  it("[db] cross-workspace isolation — another workspace sees no business and no learning", async () => {
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: otherWorkspaceId, businessId, now: NOW });
    expect(view.found).toBe(false);
    expect(view.data.criticalDomainsRealProviderBacked).toBe(false);
    expect(view.learning.applied).toBe(false);
  });
});
