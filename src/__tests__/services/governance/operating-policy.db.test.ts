/**
 * Phase 7 — Governed Operating Policy Registry (real-DB proof).
 *
 * Tests the full operating-policy lifecycle against a real PostgreSQL database:
 *   - Default policy seeding (idempotent)
 *   - CRUD: get, list, update with audit event
 *   - Policy evaluation: ALLOW / WARN / BLOCK paths, active override → ALLOW
 *   - Override lifecycle: create, expiry computation, revoke (idempotent)
 *   - Workspace isolation: workspace A cannot see workspace B policies
 *   - Cross-domain conflict detection: growth gating + high-cost payback
 *
 * All tests run against the REAL Postgres database (no mocks). Gated by TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  ensureDefaultPolicies,
  getPolicy,
  listPolicies,
  updatePolicy,
  createOverride,
  revokeOverride,
  evaluatePolicy,
  evaluateCrossDomainConflicts,
  type RecommendationCandidate,
} from "@/services/governance/operating-policy.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 7 — Governed Operating Policy Registry",
  () => {
    const workspaceId = randomUUID();
    const workspaceIdB = randomUUID();
    const userId = randomUUID();

    beforeAll(async () => {
      await db.$transaction([
        db.workspace.create({
          data: {
            id: workspaceId,
            name: "Policy Test Workspace",
            slug: `policy-test-${workspaceId.slice(0, 8)}`,
            updatedAt: new Date(),
          },
        }),
        db.workspace.create({
          data: {
            id: workspaceIdB,
            name: "Policy Test Workspace B",
            slug: `policy-test-b-${workspaceIdB.slice(0, 8)}`,
            updatedAt: new Date(),
          },
        }),
        db.user.create({
          data: {
            id: userId,
            email: `policy-test-${userId.slice(0, 8)}@example.com`,
            hashedPassword: "x",
            isActive: true,
            updatedAt: new Date(),
          },
        }),
      ]);
    });

    afterAll(async () => {
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.operatingPolicyOverride.deleteMany({ where: { workspaceId } });
      await db.operatingPolicyOverride.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.operatingPolicy.deleteMany({ where: { workspaceId } });
      await db.operatingPolicy.deleteMany({ where: { workspaceId: workspaceIdB } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceId, workspaceIdB] } } });
      await db.auditEvent.deleteMany({ where: { actorId: userId } });
      await db.user.delete({ where: { id: userId } });
    });

    // ─── Default policy seeding ────────────────────────────────────────────

    it("seeds default policies for a new workspace", async () => {
      await ensureDefaultPolicies(workspaceId, userId);
      const policies = await listPolicies(workspaceId);
      expect(policies).toHaveLength(2);
      const keys = policies.map((p) => p.policyKey).sort();
      expect(keys).toEqual(["growth_before_capacity", "high_cost_low_payback"]);
    });

    it("seeding is idempotent — running again creates no duplicates", async () => {
      await ensureDefaultPolicies(workspaceId, userId);
      await ensureDefaultPolicies(workspaceId, userId);
      const policies = await listPolicies(workspaceId);
      expect(policies).toHaveLength(2);
    });

    it("seeding emits audit events for each created policy", async () => {
      const events = await db.auditEvent.findMany({
        where: { workspaceId, eventName: AUDIT_EVENTS.OPERATING_POLICY_CREATED },
        orderBy: { occurredAt: "asc" },
      });
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.actorId === userId)).toBe(true);
    });

    // ─── CRUD ────────────────────────────────────────────────────────────────

    it("getPolicy returns the correct record", async () => {
      const policy = await getPolicy(workspaceId, "high_cost_low_payback");
      expect(policy).not.toBeNull();
      expect(policy?.threshold).toBe(6);
      expect(policy?.thresholdUnit).toBe("MONTHS");
      expect(policy?.hardBlock).toBe(false);
      expect(policy?.isActive).toBe(true);
    });

    it("getPolicy returns null for unknown policy key", async () => {
      const policy = await getPolicy(workspaceId, "nonexistent_policy");
      expect(policy).toBeNull();
    });

    it("listPolicies returns all workspace policies ordered by policyKey", async () => {
      const policies = await listPolicies(workspaceId);
      expect(policies.length).toBe(2);
      expect(policies[0].policyKey).toBe("growth_before_capacity");
      expect(policies[1].policyKey).toBe("high_cost_low_payback");
    });

    it("updatePolicy changes threshold and emits audit event", async () => {
      const updated = await updatePolicy(workspaceId, "high_cost_low_payback", { threshold: 9 }, userId);
      expect(updated.threshold).toBe(9);

      const event = await db.auditEvent.findFirst({
        where: { workspaceId, eventName: AUDIT_EVENTS.OPERATING_POLICY_UPDATED },
        orderBy: { occurredAt: "desc" },
      });
      expect(event).not.toBeNull();
      expect(event?.actorId).toBe(userId);

      // restore for later tests
      await updatePolicy(workspaceId, "high_cost_low_payback", { threshold: 6 }, userId);
    });

    it("updatePolicy can toggle hardBlock and isActive", async () => {
      const updated = await updatePolicy(workspaceId, "growth_before_capacity", { hardBlock: false, isActive: false }, userId);
      expect(updated.hardBlock).toBe(false);
      expect(updated.isActive).toBe(false);

      // restore
      await updatePolicy(workspaceId, "growth_before_capacity", { hardBlock: true, isActive: true }, userId);
    });

    // ─── Policy evaluation — ALLOW path ────────────────────────────────────

    it("evaluatePolicy returns ALLOW when value is under threshold", async () => {
      const result = await evaluatePolicy(workspaceId, "high_cost_low_payback", 5, " months");
      expect(result.decision).toBe("ALLOW");
      expect(result.policyKey).toBe("high_cost_low_payback");
    });

    it("evaluatePolicy returns ALLOW for inactive policy (growth_before_capacity disabled)", async () => {
      await updatePolicy(workspaceId, "growth_before_capacity", { isActive: false }, userId);
      const result = await evaluatePolicy(workspaceId, "growth_before_capacity", 95, "%");
      expect(result.decision).toBe("ALLOW");
      expect(result.message).toContain("Policy not configured");
      await updatePolicy(workspaceId, "growth_before_capacity", { isActive: true }, userId);
    });

    it("evaluatePolicy returns ALLOW for unknown policy key", async () => {
      const result = await evaluatePolicy(workspaceId, "nonexistent_policy", 999, "units");
      expect(result.decision).toBe("ALLOW");
    });

    // ─── Policy evaluation — WARN path ────────────────────────────────────

    it("evaluatePolicy returns WARN when value exceeds threshold on soft-block policy", async () => {
      const result = await evaluatePolicy(workspaceId, "high_cost_low_payback", 8, " months");
      expect(result.decision).toBe("WARN");
      expect(result.message).toBeDefined();
      expect(result.overridePath).toBeDefined();
    });

    // ─── Policy evaluation — BLOCK path ───────────────────────────────────

    it("evaluatePolicy returns BLOCK when value exceeds threshold on hard-block policy", async () => {
      const result = await evaluatePolicy(workspaceId, "growth_before_capacity", 85, "%");
      expect(result.decision).toBe("BLOCK");
      expect(result.blockReason).toBeDefined();
      expect(result.overridePath).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    // ─── Override lifecycle ───────────────────────────────────────────────

    it("createOverride allows a blocked policy to return ALLOW", async () => {
      const policy = await getPolicy(workspaceId, "growth_before_capacity");
      expect(policy).not.toBeNull();

      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "Emergency marketing campaign approved by owner",
        context: { approvedAt: "2026-07-15" },
      });
      expect(typeof overrideId).toBe("string");

      const result = await evaluatePolicy(workspaceId, "growth_before_capacity", 95, "%");
      expect(result.decision).toBe("ALLOW");
      expect(result.activeOverride).toBeDefined();
      expect(result.activeOverride?.overriddenBy).toBe(userId);
      expect(result.activeOverride?.reason).toBe("Emergency marketing campaign approved by owner");

      // Audit event created
      const event = await db.auditEvent.findFirst({
        where: { workspaceId, eventName: AUDIT_EVENTS.OPERATING_POLICY_OVERRIDE_CREATED },
        orderBy: { occurredAt: "desc" },
      });
      expect(event).not.toBeNull();
      expect(event?.actorId).toBe(userId);

      // Revoke so later tests work correctly
      await revokeOverride(overrideId, workspaceId, userId);
    });

    it("createOverride computes expiresAt from policy.expiryAfterOverrideMinutes", async () => {
      const policy = await getPolicy(workspaceId, "growth_before_capacity");
      // expiryAfterOverrideMinutes = 2880 (48 hours)
      const before = new Date();
      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "Expiry test",
      });
      const after = new Date();

      const row = await (db as any).operatingPolicyOverride.findUnique({ where: { id: overrideId } });
      expect(row?.expiresAt).not.toBeNull();
      // expiresAt should be ~48h from now
      const diffMs = new Date(row!.expiresAt!).getTime() - before.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(47.9);
      expect(diffHours).toBeLessThan(48.1 + (after.getTime() - before.getTime()) / (1000 * 60 * 60));

      await revokeOverride(overrideId, workspaceId, userId);
    });

    it("revokeOverride sets revokedAt and emits audit event", async () => {
      const policy = await getPolicy(workspaceId, "high_cost_low_payback");
      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "To be revoked",
      });

      await revokeOverride(overrideId, workspaceId, userId);

      const row = await (db as any).operatingPolicyOverride.findUnique({ where: { id: overrideId } });
      expect(row?.revokedAt).not.toBeNull();
      expect(row?.revokedBy).toBe(userId);

      const event = await db.auditEvent.findFirst({
        where: { workspaceId, eventName: AUDIT_EVENTS.OPERATING_POLICY_OVERRIDE_REVOKED },
        orderBy: { occurredAt: "desc" },
      });
      expect(event).not.toBeNull();
    });

    it("revokeOverride is idempotent — revoking twice does not throw", async () => {
      const policy = await getPolicy(workspaceId, "high_cost_low_payback");
      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "Idempotent revoke test",
      });

      await revokeOverride(overrideId, workspaceId, userId);
      await expect(revokeOverride(overrideId, workspaceId, userId)).resolves.toBeUndefined();
    });

    it("revoked override no longer causes ALLOW — policy reverts to threshold evaluation", async () => {
      const policy = await getPolicy(workspaceId, "growth_before_capacity");
      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "Will be revoked",
      });

      // While active: ALLOW
      const whileActive = await evaluatePolicy(workspaceId, "growth_before_capacity", 95, "%");
      expect(whileActive.decision).toBe("ALLOW");

      await revokeOverride(overrideId, workspaceId, userId);

      // After revoke: back to BLOCK (value=95 > threshold=80, hardBlock=true)
      const afterRevoke = await evaluatePolicy(workspaceId, "growth_before_capacity", 95, "%");
      expect(afterRevoke.decision).toBe("BLOCK");
    });

    // ─── Workspace isolation ──────────────────────────────────────────────

    it("workspace isolation — workspace B cannot see workspace A policies", async () => {
      // Workspace A has 2 policies seeded; workspace B has none yet
      const policiesB = await listPolicies(workspaceIdB);
      expect(policiesB).toHaveLength(0);
    });

    it("workspace isolation — seeding workspace B does not affect workspace A", async () => {
      await ensureDefaultPolicies(workspaceIdB, userId);
      const policiesA = await listPolicies(workspaceId);
      const policiesB = await listPolicies(workspaceIdB);
      expect(policiesA).toHaveLength(2);
      expect(policiesB).toHaveLength(2);
    });

    it("workspace isolation — updatePolicy on workspace A does not change workspace B", async () => {
      await updatePolicy(workspaceId, "high_cost_low_payback", { threshold: 12 }, userId);

      const policyA = await getPolicy(workspaceId, "high_cost_low_payback");
      const policyB = await getPolicy(workspaceIdB, "high_cost_low_payback");

      expect(policyA?.threshold).toBe(12);
      expect(policyB?.threshold).toBe(6); // unchanged

      await updatePolicy(workspaceId, "high_cost_low_payback", { threshold: 6 }, userId);
    });

    // ─── Cross-domain conflict detection ─────────────────────────────────

    it("evaluateCrossDomainConflicts returns ALLOW for compliance candidate regardless of capacity", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "c1",
          category: "COMPLIANCE",
          description: "Fire safety compliance upgrade",
          estimatedCostGbp: 50000,
          estimatedPaybackMonths: 24,
          isGrowthAction: false,
        },
      ];
      // capacity at 95% (well above growth_before_capacity threshold of 80%)
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 95);
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("ALLOW");
    });

    it("evaluateCrossDomainConflicts blocks growth action when capacity > 80%", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "g1",
          category: "GROWTH",
          description: "Launch marketing campaign",
          isGrowthAction: true,
        },
      ];
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 85);
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("BLOCK");
      expect(results[0].policyKey).toBe("growth_before_capacity");
    });

    it("evaluateCrossDomainConflicts allows growth action when capacity <= 80%", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "g2",
          category: "GROWTH",
          description: "Social media ads",
          isGrowthAction: true,
        },
      ];
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 75);
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("ALLOW");
    });

    it("evaluateCrossDomainConflicts warns on high-cost expenditure exceeding payback threshold", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "e1",
          category: "EXPENDITURE",
          description: "New enterprise software",
          estimatedPaybackMonths: 10,
          isGrowthAction: false,
        },
      ];
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 50);
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("WARN");
      expect(results[0].policyKey).toBe("high_cost_low_payback");
    });

    it("evaluateCrossDomainConflicts allows expenditure with short payback period", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "e2",
          category: "EXPENDITURE",
          description: "Quick ROI equipment",
          estimatedPaybackMonths: 3,
          isGrowthAction: false,
        },
      ];
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 50);
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("ALLOW");
    });

    it("evaluateCrossDomainConflicts handles mixed candidates correctly", async () => {
      const candidates: RecommendationCandidate[] = [
        {
          id: "mix-growth",
          category: "GROWTH",
          description: "Marketing push",
          isGrowthAction: true,
        },
        {
          id: "mix-compliance",
          category: "COMPLIANCE",
          description: "GDPR audit",
          estimatedPaybackMonths: 36,
          isGrowthAction: false,
        },
        {
          id: "mix-cheap-exp",
          category: "EXPENDITURE",
          description: "Cheap tool",
          estimatedPaybackMonths: 2,
          isGrowthAction: false,
        },
      ];
      // capacity=90% → growth blocked; compliance exempt; cheap expenditure allowed
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 90);
      expect(results).toHaveLength(3);

      const growthResult = results.find((r) => r.candidateId === "mix-growth");
      expect(growthResult?.decision).toBe("BLOCK");

      const complianceResult = results.find((r) => r.candidateId === "mix-compliance");
      expect(complianceResult?.decision).toBe("ALLOW");

      const expResult = results.find((r) => r.candidateId === "mix-cheap-exp");
      expect(expResult?.decision).toBe("ALLOW");
    });

    it("adversarial — override on growth_before_capacity allows blocked growth action", async () => {
      const policy = await getPolicy(workspaceId, "growth_before_capacity");
      const overrideId = await createOverride({
        policyId: policy!.id,
        workspaceId,
        overriddenBy: userId,
        reason: "Owner approved exceptional growth push despite capacity constraint",
      });

      const candidates: RecommendationCandidate[] = [
        {
          id: "adv-growth",
          category: "GROWTH",
          description: "Aggressive expansion",
          isGrowthAction: true,
        },
      ];
      const results = await evaluateCrossDomainConflicts(workspaceId, candidates, 95);
      expect(results[0].decision).toBe("ALLOW");
      expect(results[0].activeOverride?.overriddenBy).toBe(userId);

      await revokeOverride(overrideId, workspaceId, userId);

      // After revoke: blocked again
      const afterRevoke = await evaluateCrossDomainConflicts(workspaceId, candidates, 95);
      expect(afterRevoke[0].decision).toBe("BLOCK");
    });
  },
);
