/**
 * Phase 7 — Cross-Domain Arbitration Adversarial Simulation (real-DB proof).
 *
 * Scenario: a business needs all three of the following, but can only safely pursue one:
 *   A. Cash injection (operations — must proceed to survive)
 *   B. Marketing expansion (growth — should be BLOCKED: capacity > 80% + cash risk)
 *   C. Key new hire (expenditure — should WARN: payback > threshold months)
 *
 * OpsIQ must:
 *   - Rank correctly (cash survival over growth over long-payback hire)
 *   - Block the infeasible actions with explanation
 *   - Allow the critical survival action (COMPLIANCE/OPERATIONS category bypasses growth gate)
 *   - Surface the override path so the owner can act if they disagree
 *
 * Additional adversarial assertions:
 *   - An override on one policy does NOT affect an unrelated policy
 *   - Workspace isolation: the same scenario in workspace B is independently evaluated
 *
 * DB-backed; gated by TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  ensureDefaultPolicies,
  evaluateCrossDomainConflicts,
  createOverride,
  revokeOverride,
  getPolicy,
  type RecommendationCandidate,
} from "@/services/governance/operating-policy.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 7 — Cross-domain arbitration adversarial simulation",
  () => {
    const workspaceId = randomUUID();
    const workspaceIdB = randomUUID();
    const ownerId = randomUUID();

    // Scenario: business at 90% capacity, cash critically low
    const CAPACITY_PCT = 90;

    const CANDIDATES: RecommendationCandidate[] = [
      {
        id: "cash-injection",
        category: "OPERATIONS",
        description: "Emergency working-capital injection — critical for survival",
        estimatedCostGbp: 30000,
        estimatedPaybackMonths: 2,
        isGrowthAction: false,
      },
      {
        id: "marketing-expansion",
        category: "GROWTH",
        description: "Launch paid acquisition campaign across three channels",
        estimatedCostGbp: 20000,
        isGrowthAction: true,
      },
      {
        id: "key-hire",
        category: "EXPENDITURE",
        description: "Hire senior operations manager",
        estimatedCostGbp: 60000,
        estimatedPaybackMonths: 10,
        isGrowthAction: false,
      },
    ];

    beforeAll(async () => {
      await db.$transaction([
        db.workspace.create({
          data: {
            id: workspaceId,
            name: "Adversarial Policy Workspace",
            slug: `adv-policy-${workspaceId.slice(0, 8)}`,
            updatedAt: new Date(),
          },
        }),
        db.workspace.create({
          data: {
            id: workspaceIdB,
            name: "Adversarial Policy Workspace B",
            slug: `adv-policy-b-${workspaceIdB.slice(0, 8)}`,
            updatedAt: new Date(),
          },
        }),
        db.user.create({
          data: {
            id: ownerId,
            email: `adv-policy-${ownerId.slice(0, 8)}@example.com`,
            hashedPassword: "x",
            isActive: true,
            updatedAt: new Date(),
          },
        }),
      ]);

      await ensureDefaultPolicies(workspaceId, ownerId);
      await ensureDefaultPolicies(workspaceIdB, ownerId);
    });

    afterAll(async () => {
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.operatingPolicyOverride.deleteMany({ where: { workspaceId } });
      await db.operatingPolicyOverride.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.operatingPolicy.deleteMany({ where: { workspaceId } });
      await db.operatingPolicy.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceId, workspaceIdB] } } });
      await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await db.user.delete({ where: { id: ownerId } });
    });

    it("the cash injection (OPERATIONS) is ALLOWED — survival action is never blocked", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      const cashResult = results.find((r) => r.candidateId === "cash-injection");
      expect(cashResult?.decision).toBe("ALLOW");
    });

    it("the marketing expansion (GROWTH at 90% capacity) is BLOCKED", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      const mktResult = results.find((r) => r.candidateId === "marketing-expansion");
      expect(mktResult?.decision).toBe("BLOCK");
      expect(mktResult?.policyKey).toBe("growth_before_capacity");
      expect(mktResult?.blockReason).toBeDefined();
      expect(mktResult?.overridePath).toBeDefined();
    });

    it("the key hire (EXPENDITURE, 10-month payback > 6-month threshold) is WARNED", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      const hireResult = results.find((r) => r.candidateId === "key-hire");
      expect(hireResult?.decision).toBe("WARN");
      expect(hireResult?.policyKey).toBe("high_cost_low_payback");
      expect(hireResult?.warningMessage).toBeDefined();
      expect(hireResult?.overridePath).toBeDefined();
    });

    it("all three decisions are returned — one per candidate", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      expect(results).toHaveLength(3);
    });

    it("override on growth_before_capacity allows marketing but does NOT affect high_cost_low_payback", async () => {
      const growthPolicy = await getPolicy(workspaceId, "growth_before_capacity");
      const overrideId = await createOverride({
        policyId: growthPolicy!.id,
        workspaceId,
        overriddenBy: ownerId,
        reason: "Owner approved one-off marketing despite capacity constraints",
      });

      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);

      // Growth is now ALLOW (override active)
      const mktResult = results.find((r) => r.candidateId === "marketing-expansion");
      expect(mktResult?.decision).toBe("ALLOW");
      expect(mktResult?.activeOverride?.overriddenBy).toBe(ownerId);

      // Hire is still WARN (high_cost_low_payback not overridden)
      const hireResult = results.find((r) => r.candidateId === "key-hire");
      expect(hireResult?.decision).toBe("WARN");

      // Cash is still ALLOW
      const cashResult = results.find((r) => r.candidateId === "cash-injection");
      expect(cashResult?.decision).toBe("ALLOW");

      await revokeOverride(overrideId, workspaceId, ownerId);
    });

    it("after revoking override, marketing is BLOCKED again", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      const mktResult = results.find((r) => r.candidateId === "marketing-expansion");
      expect(mktResult?.decision).toBe("BLOCK");
    });

    it("workspace isolation — same scenario evaluated independently in workspace B", async () => {
      // Add override to workspace B only
      const growthPolicyB = await getPolicy(workspaceIdB, "growth_before_capacity");
      const overrideIdB = await createOverride({
        policyId: growthPolicyB!.id,
        workspaceId: workspaceIdB,
        overriddenBy: ownerId,
        reason: "Workspace B specific override",
      });

      const resultsA = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, CAPACITY_PCT);
      const resultsB = await evaluateCrossDomainConflicts(workspaceIdB, CANDIDATES, CAPACITY_PCT);

      // Workspace A: marketing BLOCKED (no override in A)
      const mktA = resultsA.find((r) => r.candidateId === "marketing-expansion");
      expect(mktA?.decision).toBe("BLOCK");

      // Workspace B: marketing ALLOW (override active in B)
      const mktB = resultsB.find((r) => r.candidateId === "marketing-expansion");
      expect(mktB?.decision).toBe("ALLOW");

      await revokeOverride(overrideIdB, workspaceIdB, ownerId);
    });

    it("at under-threshold capacity (70%), growth is ALLOWED without override", async () => {
      const results = await evaluateCrossDomainConflicts(workspaceId, CANDIDATES, 70);
      const mktResult = results.find((r) => r.candidateId === "marketing-expansion");
      expect(mktResult?.decision).toBe("ALLOW");
    });
  },
);
