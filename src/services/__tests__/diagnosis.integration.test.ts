import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  diagnoseBusiness,
  validateBusinessProblem,
  type BusinessProblemInput,
} from "@/services/diagnosis";
import { ValidationError } from "@/infra/errors";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 1 Wave 5 — diagnosis → recommendation integration proof (migrated).
 *
 * Original intent (quarantined `diagnosis.integration.test.ts`): prove that a diagnostic input
 * produces a structured diagnosis with recommendations. That test called the old
 * `diagnoseBusiness(input, "test-actor")` signature; the current service is
 * `diagnoseBusiness(input, authContext, workspaceId)` and persists client/engagement/findings/
 * recommendations to the database. This migration preserves the intent on the current API against
 * the real test database (gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true), and keeps the pure
 * `validateBusinessProblem` fail-closed checks. Setup follows the proven DB-test pattern in
 * `src/__tests__/p2a/p2a-production-path.test.ts` and this repo's Wave-3 recommendation DB test.
 */

// ── Pure input-validation contract (no DB) ──────────────────────────────────
describe("validateBusinessProblem — fail-closed input contract", () => {
  const base: BusinessProblemInput = {
    businessName: "Acme",
    businessType: "retail",
    problemStatement: "Sales are falling",
    mainIssue: "low_sales",
  };

  it("rejects a missing businessName", () => {
    expect(() => validateBusinessProblem({ ...base, businessName: "" })).toThrow(ValidationError);
  });

  it("rejects an invalid mainIssue", () => {
    expect(() =>
      validateBusinessProblem({ ...base, mainIssue: "not_a_real_issue" as BusinessProblemInput["mainIssue"] })
    ).toThrow(ValidationError);
  });

  it("rejects negative monthlyRevenue", () => {
    expect(() => validateBusinessProblem({ ...base, monthlyRevenue: -1 })).toThrow(ValidationError);
  });

  it("accepts a well-formed problem", () => {
    expect(() => validateBusinessProblem(base)).not.toThrow();
  });
});

// ── DB-backed diagnosis → recommendation generation ─────────────────────────
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "diagnoseBusiness (DB-backed) — diagnosis produces persisted findings + recommendations",
  () => {
    const workspaceId = uuidv4();
    const userId = uuidv4();
    const stamp = uuidv4();
    const createdEngagementIds: string[] = [];

    const authContext = {
      verifiedActorId: userId,
      verifiedActorType: "user",
      verifiedActor: null,
      verifiedWorkspaceId: workspaceId,
      verifiedCapabilities: ["DIAGNOSIS_CREATE"],
      verifiedSessionSnapshot: {
        actorId: userId,
        sessionId: uuidv4(),
        createdAt: new Date(),
      },
      policy: null,
    } as unknown as CanonicalAuthContext;

    const diagnose = async (input: BusinessProblemInput) => {
      const result = await diagnoseBusiness(input, authContext, workspaceId);
      if (result.engagementId) createdEngagementIds.push(result.engagementId);
      return result;
    };

    beforeAll(async () => {
      await db.user.create({
        data: { id: userId, email: `wave5-diag-${stamp}@test.local`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: "Wave5 Diagnosis WS", slug: `wave5-diag-${stamp}` },
      });
    });

    afterAll(async () => {
      try {
        if (createdEngagementIds.length > 0) {
          await db.recommendation.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
          await db.finding.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
        }
        await db.recommendation.deleteMany({ where: { workspaceId } });
        await db.engagement.deleteMany({ where: { workspaceId } });
        await db.clientAccount.deleteMany({ where: { workspaceId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("produces a persisted diagnosis with structured recommendations for a valid problem", async () => {
      const result = await diagnose({
        businessName: `Wave5 Retailer ${stamp}`,
        businessType: "retail",
        problemStatement: "Monthly sales have dropped and cash is tight",
        mainIssue: "low_sales",
        monthlyRevenue: 100000,
        monthlyCosts: 80000,
        customerCount: 0,
      });

      // Diagnosis persisted (engagement created) and diagnosis→recommendation contract satisfied.
      expect(result.engagementId).toBeTruthy();
      expect(result.primaryProblemCategory).toBe("revenue_generation"); // low_sales maps here
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);

      for (const rec of result.recommendations) {
        expect(rec.id).toBeTruthy();
        expect(typeof rec.title).toBe("string");
        expect(rec.title.length).toBeGreaterThan(0);
        expect(["high", "medium", "low"]).toContain(rec.priority);
        expect(typeof rec.description).toBe("string");
      }

      // Diagnostic reasoning/evidence surface (findings) is produced.
      expect(Array.isArray(result.findings)).toBe(true);
      expect(["low", "medium", "high"]).toContain(result.confidence);

      // Recommendations are actually persisted under the engagement.
      const persisted = await db.recommendation.findMany({
        where: { engagementId: result.engagementId, workspaceId },
      });
      expect(persisted.length).toBeGreaterThan(0);
    });

    it("escalates severity to critical when costs far exceed revenue", async () => {
      const result = await diagnose({
        businessName: `Wave5 CashBurn ${stamp}`,
        businessType: "services",
        problemStatement: "Costs are far above revenue and cash is running out",
        mainIssue: "cash_flow",
        monthlyRevenue: 100000,
        monthlyCosts: 200000, // > 125% of revenue → critical
      });

      expect(result.severity).toBe("critical");
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("does not fabricate high confidence from sparse input (fail-closed data quality)", async () => {
      const result = await diagnose({
        businessName: `Wave5 Sparse ${stamp}`,
        businessType: "unclear",
        problemStatement: "Not sure what is wrong",
        mainIssue: "unclear",
        // no revenue/cost/customer figures provided
      });

      // Sparse input must surface data warnings and must not claim high confidence.
      expect(result.confidence).not.toBe("high");
      expect(Array.isArray(result.dataWarnings)).toBe(true);
      expect(result.dataWarnings.length).toBeGreaterThan(0);
    });

    it("scopes the created diagnosis to the caller's workspace", async () => {
      const result = await diagnose({
        businessName: `Wave5 Scoped ${stamp}`,
        businessType: "retail",
        problemStatement: "Operational inefficiency slowing fulfilment",
        mainIssue: "operations",
        monthlyRevenue: 50000,
        monthlyCosts: 40000,
      });

      const engagement = await db.engagement.findUnique({ where: { id: result.engagementId } });
      expect(engagement).not.toBeNull();
      expect(engagement?.workspaceId).toBe(workspaceId);
    });
  }
);
