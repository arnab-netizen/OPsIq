/**
 * POST /api/owner/reactivation/assess — Customer Reactivation Campaign Assessment (Module #8).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (reactivationAssessRequestSchema)
 * 3. Route handler: churn-risk classification, LTV impact, urgency gate,
 *    governance invariants, work-package wiring, tenant isolation
 *
 * The pure domain functions (generateWorkPackage, churn thresholds) are NOT mocked —
 * they are deterministic with no side effects; expected values are hand-calculated.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { POST } from "@/app/api/owner/reactivation/assess/route";
import { reactivationAssessRequestSchema } from "@/domain/owner-mode/reactivation-assess.validation";

const WS = "ws-canonical";
const AT = "2026-07-11T10:00:00.000Z";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/reactivation/assess",
      json: async () => body,
    },
  } as const;
}

// ── Fixture bodies ───────────────────────────────────────────────────────────

/** Low churn — 3/100 = 3%, no cash pressure */
const LOW_CHURN_BODY = {
  dormantCustomerCount: 3,
  cohortSize: 100,
  evaluatedAt: AT,
};

/** Medium churn — 7/100 = 7%, no cash pressure */
const MEDIUM_CHURN_BODY = {
  dormantCustomerCount: 7,
  cohortSize: 100,
  evaluatedAt: AT,
};

/** High churn — 12/100 = 12%, no cash pressure */
const HIGH_CHURN_BODY = {
  dormantCustomerCount: 12,
  cohortSize: 100,
  evaluatedAt: AT,
};

/** Critical churn — explicit 0.18 (18%) */
const CRITICAL_CHURN_BODY = {
  dormantCustomerCount: 0,
  cohortSize: 100,
  avgMonthlyChurnRate: 0.18,
  evaluatedAt: AT,
};

/** Cash pressure upgrades urgency */
const CASH_PRESSURE_LOW_CHURN_BODY = {
  dormantCustomerCount: 3,
  cohortSize: 100,
  context: { cashPressureActive: true },
  evaluatedAt: AT,
};

/** Full body — all optional fields supplied */
const FULL_BODY = {
  dormantCustomerCount: 10,
  cohortSize: 80,
  avgMonthlyChurnRate: 0.08,
  avgMonthlyRevenuePerCustomer: 500,
  businessName: "Quick Laundry",
  context: { cashPressureActive: false },
  evaluatedAt: AT,
};

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-8] reactivation/assess route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/reactivation/assess/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("overwrites workspaceId with ctx.verifiedWorkspaceId (never body)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toContain("body.workspaceId");
  });

  it("exports POST handler only (no GET/DELETE/PATCH)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const DELETE");
    expect(src).not.toContain("export const PATCH");
  });

  it("validates body via reactivationAssessRequestSchema", () => {
    expect(src).toContain("reactivationAssessRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls generateWorkPackage for work-package output", () => {
    expect(src).toContain("generateWorkPackage");
  });

  it("enforces ownerApprovalRequired=true governance invariant", () => {
    expect(src).toContain("ownerApprovalRequired: true");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-8] reactivationAssessRequestSchema", () => {
  it("accepts minimal body — dormantCustomerCount + cohortSize only", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
    });
    expect(r.success).toBe(true);
  });

  it("accepts zero dormant customers (no-churn scenario)", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 0,
      cohortSize: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts full body with all optional fields", () => {
    const r = reactivationAssessRequestSchema.safeParse(FULL_BODY);
    expect(r.success).toBe(true);
  });

  it("accepts avgMonthlyChurnRate as 0", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 0,
      cohortSize: 100,
      avgMonthlyChurnRate: 0,
    });
    expect(r.success).toBe(true);
  });

  it("accepts avgMonthlyChurnRate as 1", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 100,
      cohortSize: 100,
      avgMonthlyChurnRate: 1,
    });
    expect(r.success).toBe(true);
  });

  it("accepts evaluatedAt as optional", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
    });
    expect(r.success).toBe(true);
  });

  it("accepts context.cashPressureActive=true", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      context: { cashPressureActive: true },
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative dormantCustomerCount", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: -1,
      cohortSize: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects cohortSize of 0 (min 1)", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 0,
      cohortSize: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects avgMonthlyChurnRate below 0", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      avgMonthlyChurnRate: -0.01,
    });
    expect(r.success).toBe(false);
  });

  it("rejects avgMonthlyChurnRate above 1", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      avgMonthlyChurnRate: 1.01,
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing dormantCustomerCount", () => {
    const r = reactivationAssessRequestSchema.safeParse({ cohortSize: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects missing cohortSize", () => {
    const r = reactivationAssessRequestSchema.safeParse({ dormantCustomerCount: 5 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      unknownField: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in body (strict mode)", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      workspaceId: "ws-attempt",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside context (strict mode)", () => {
    const r = reactivationAssessRequestSchema.safeParse({
      dormantCustomerCount: 5,
      cohortSize: 50,
      context: { cashPressureActive: false, unknownField: "x" },
    });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler ────────────────────────────────────────────────────────

describe("[module-8] POST /api/owner/reactivation/assess — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("result shape includes all expected top-level keys", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("evaluatedAt");
    expect(result).toHaveProperty("dormantCustomerCount");
    expect(result).toHaveProperty("cohortSize");
    expect(result).toHaveProperty("churnRate");
    expect(result).toHaveProperty("churnRisk");
    expect(result).toHaveProperty("ltvImpact");
    expect(result).toHaveProperty("reactivationUrgent");
    expect(result).toHaveProperty("ownerApprovalRequired");
    expect(result).toHaveProperty("workPackage");
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY, "ws-TENANT")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-TENANT");
  });

  it("returns evaluatedAt matching the supplied value", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    expect(result.evaluatedAt).toBe(AT);
  });

  // ── Churn risk classification ──────────────────────────────────────────────

  it("classifies 3% churn as LOW risk with MONITOR urgency", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.riskLevel).toBe("LOW");
    expect(risk.interventionUrgency).toBe("MONITOR");
    expect(result.reactivationUrgent).toBe(false);
  });

  it("classifies 7% churn as MEDIUM risk with PLANNED urgency", async () => {
    const result = await POST(makeCtx(MEDIUM_CHURN_BODY)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.riskLevel).toBe("MEDIUM");
    expect(risk.interventionUrgency).toBe("PLANNED");
    expect(result.reactivationUrgent).toBe(false);
  });

  it("classifies 12% churn as HIGH risk with URGENT urgency", async () => {
    const result = await POST(makeCtx(HIGH_CHURN_BODY)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.riskLevel).toBe("HIGH");
    expect(risk.interventionUrgency).toBe("URGENT");
    expect(result.reactivationUrgent).toBe(true);
  });

  it("classifies 18% churn (supplied rate) as CRITICAL risk with IMMEDIATE urgency", async () => {
    const result = await POST(makeCtx(CRITICAL_CHURN_BODY)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.riskLevel).toBe("CRITICAL");
    expect(risk.interventionUrgency).toBe("IMMEDIATE");
    expect(result.reactivationUrgent).toBe(true);
  });

  // ── Cash pressure upgrades urgency ─────────────────────────────────────────

  it("cash pressure upgrades LOW→PLANNED (MONITOR→PLANNED)", async () => {
    const result = await POST(makeCtx(CASH_PRESSURE_LOW_CHURN_BODY)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.interventionUrgency).toBe("PLANNED");
  });

  it("cash pressure on MEDIUM churn upgrades PLANNED→URGENT", async () => {
    const body = { ...MEDIUM_CHURN_BODY, context: { cashPressureActive: true } };
    const result = await POST(makeCtx(body)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.interventionUrgency).toBe("URGENT");
    expect(result.reactivationUrgent).toBe(true);
  });

  it("cash pressure on HIGH churn upgrades URGENT→IMMEDIATE", async () => {
    const body = { ...HIGH_CHURN_BODY, context: { cashPressureActive: true } };
    const result = await POST(makeCtx(body)) as Record<string, unknown>;
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.interventionUrgency).toBe("IMMEDIATE");
  });

  // ── Churn rate derivation ─────────────────────────────────────────────────

  it("derives churn rate from dormantCustomerCount/cohortSize when avgMonthlyChurnRate absent", async () => {
    const result = await POST(makeCtx({ dormantCustomerCount: 10, cohortSize: 100, evaluatedAt: AT })) as Record<string, unknown>;
    expect(result.churnRate).toBe(0.10);
  });

  it("prefers explicit avgMonthlyChurnRate over derived value", async () => {
    const result = await POST(makeCtx({
      dormantCustomerCount: 99,
      cohortSize: 100,
      avgMonthlyChurnRate: 0.03, // override — should win
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    expect(result.churnRate).toBe(0.03);
    const risk = result.churnRisk as Record<string, unknown>;
    expect(risk.riskLevel).toBe("LOW");
  });

  // ── LTV impact ───────────────────────────────────────────────────────────

  it("ltvImpact is null when avgMonthlyRevenuePerCustomer not supplied", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    expect(result.ltvImpact).toBeNull();
  });

  it("ltvImpact is computed when avgMonthlyRevenuePerCustomer supplied", async () => {
    const result = await POST(makeCtx({
      dormantCustomerCount: 10,
      cohortSize: 100,
      avgMonthlyRevenuePerCustomer: 500,
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    const ltv = result.ltvImpact as Record<string, unknown>;
    expect(ltv).not.toBeNull();
    expect(ltv.estimatedMonthlyRevenueLost).toBe(5000); // 10 × 500
    expect(ltv.estimatedAnnualRevenueLost).toBe(60000); // 5000 × 12
  });

  // ── Governance invariants ─────────────────────────────────────────────────

  it("ownerApprovalRequired is ALWAYS true (governance invariant)", async () => {
    const r1 = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const r2 = await POST(makeCtx(CRITICAL_CHURN_BODY)) as Record<string, unknown>;
    expect(r1.ownerApprovalRequired).toBe(true);
    expect(r2.ownerApprovalRequired).toBe(true);
  });

  it("workPackage.ownerApprovalRequired is always true", async () => {
    const result = await POST(makeCtx(HIGH_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as Record<string, unknown>;
    expect(wp.ownerApprovalRequired).toBe(true);
  });

  // ── Work package wiring ───────────────────────────────────────────────────

  it("workPackage.actionKind is customer_reactivation", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as Record<string, unknown>;
    expect(wp.actionKind).toBe("customer_reactivation");
  });

  it("workPackage includes prepared artifacts (scripts + tracker)", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as { preparedArtifacts: { kind: string }[] };
    expect(wp.preparedArtifacts.length).toBeGreaterThan(0);
    const kinds = wp.preparedArtifacts.map(a => a.kind);
    expect(kinds).toContain("customer_script");
    expect(kinds).toContain("tracker");
  });

  it("workPackage.steps are non-empty", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as { steps: string[] };
    expect(wp.steps.length).toBeGreaterThan(0);
  });

  it("businessName flows into workPackage artifacts content", async () => {
    const result = await POST(makeCtx(FULL_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as { preparedArtifacts: { content: string }[] };
    const contents = wp.preparedArtifacts.map(a => a.content).join(" ");
    expect(contents).toContain("Quick Laundry");
  });

  // ── Deadline scales with urgency ──────────────────────────────────────────

  it("workPackage.deadlineDays is 2 for CRITICAL/IMMEDIATE urgency", async () => {
    const result = await POST(makeCtx(CRITICAL_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as Record<string, unknown>;
    expect(wp.deadlineDays).toBe(2);
  });

  it("workPackage.deadlineDays is 5 for HIGH/URGENT urgency", async () => {
    const result = await POST(makeCtx(HIGH_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as Record<string, unknown>;
    expect(wp.deadlineDays).toBe(5);
  });

  it("workPackage.deadlineDays is 14 for LOW/MONITOR urgency", async () => {
    const result = await POST(makeCtx(LOW_CHURN_BODY)) as Record<string, unknown>;
    const wp = result.workPackage as Record<string, unknown>;
    expect(wp.deadlineDays).toBe(14);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it("different workspace IDs produce different workspaceId in result", async () => {
    const r1 = await POST(makeCtx(LOW_CHURN_BODY, "ws-ALICE")) as Record<string, unknown>;
    const r2 = await POST(makeCtx(LOW_CHURN_BODY, "ws-BOB")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");
    expect(r2.workspaceId).toBe("ws-BOB");
  });

  it("is pure — same input produces same result on repeated calls", async () => {
    const r1 = await POST(makeCtx(MEDIUM_CHURN_BODY)) as { churnRisk: Record<string, unknown> };
    const r2 = await POST(makeCtx(MEDIUM_CHURN_BODY)) as { churnRisk: Record<string, unknown> };
    expect(r1.churnRisk.riskLevel).toBe(r2.churnRisk.riskLevel);
    expect(r1.churnRisk.interventionUrgency).toBe(r2.churnRisk.interventionUrgency);
  });

  // ── Validation gates ──────────────────────────────────────────────────────

  it("rejects unknown body fields before processing", async () => {
    await expect(POST(makeCtx({ ...LOW_CHURN_BODY, unknownField: "x" }))).rejects.toThrow();
  });

  it("rejects workspaceId in body before processing", async () => {
    await expect(
      POST(makeCtx({ ...LOW_CHURN_BODY, workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });

  it("rejects missing required fields", async () => {
    await expect(POST(makeCtx({ cohortSize: 100 }))).rejects.toThrow();
  });
});
