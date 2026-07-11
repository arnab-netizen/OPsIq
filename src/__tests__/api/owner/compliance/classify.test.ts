/**
 * POST /api/owner/compliance/classify — Compliance Risk Classification (Module #15).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (complianceClassifyRequestSchema)
 * 3. Route handler: classification correctness, worst-case ordering, governance
 *    invariants (disclaimer, professionalReviewRequired, blocked), tenant isolation
 *
 * The pure domain engine (classifyComplianceRisk) is NOT mocked — it is
 * deterministic with no side effects; all expected values are hand-calculated
 * from the domain boundary logic in compliance-boundary.ts.
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

import { POST } from "@/app/api/owner/compliance/classify/route";
import { complianceClassifyRequestSchema } from "@/domain/owner-mode/compliance-classify.validation";

const WS = "ws-canonical";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/compliance/classify",
      json: async () => body,
    },
  } as const;
}

// ── Classification signal fixtures ────────────────────────────────────────────

const NO_FLAGS = {};
const EXPIRY_PASSED = { expiryPassed: true };
const EXPIRING_SOON = { expiringSoon: true };
const TAX_ONLY = { taxImpact: true };
const CONTRACT_RISK = { contractOrLegalRisk: true };
const STAFF_SENSITIVE = { staffSensitive: true };
const AD_CLAIM = { advertisingClaim: true };
const DATA_PRIVACY = { dataPrivacy: true };
const MULTIPLE_CAUTION = { expiringSoon: true, advertisingClaim: true, dataPrivacy: true };
const MULTIPLE_MIXED = { expiringSoon: true, taxImpact: true }; // worst = professional_review_required
const WORST_CASE = { expiryPassed: true, taxImpact: true, contractOrLegalRisk: true };

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-15] compliance/classify route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/compliance/classify/route.ts"),
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

  it("validates body via complianceClassifyRequestSchema", () => {
    expect(src).toContain("complianceClassifyRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls classifyComplianceRisk (pure domain engine)", () => {
    expect(src).toContain("classifyComplianceRisk");
  });

  it("always includes disclaimer in the response", () => {
    expect(src).toContain("result.disclaimer");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-15] complianceClassifyRequestSchema", () => {
  it("accepts an empty object (all signals optional)", () => {
    const r = complianceClassifyRequestSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts each boolean signal individually", () => {
    for (const key of ["expiryPassed", "expiringSoon", "contractOrLegalRisk", "taxImpact", "staffSensitive", "advertisingClaim", "dataPrivacy"] as const) {
      const r = complianceClassifyRequestSchema.safeParse({ [key]: true });
      expect(r.success).toBe(true);
    }
  });

  it("accepts contextNote as optional string", () => {
    const r = complianceClassifyRequestSchema.safeParse({ contextNote: "Reviewing lease renewal" });
    expect(r.success).toBe(true);
  });

  it("accepts all signals together", () => {
    const r = complianceClassifyRequestSchema.safeParse({
      expiryPassed: true,
      expiringSoon: false,
      contractOrLegalRisk: true,
      taxImpact: false,
      staffSensitive: true,
      advertisingClaim: false,
      dataPrivacy: true,
      contextNote: "End-of-year review",
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-boolean value for expiryPassed", () => {
    const r = complianceClassifyRequestSchema.safeParse({ expiryPassed: "yes" });
    expect(r.success).toBe(false);
  });

  it("rejects contextNote exceeding 500 chars", () => {
    const r = complianceClassifyRequestSchema.safeParse({ contextNote: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = complianceClassifyRequestSchema.safeParse({ unknownField: true });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in body (strict mode)", () => {
    const r = complianceClassifyRequestSchema.safeParse({ workspaceId: "ws-attempt" });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler — classification logic, governance, tenant isolation ───

describe("[module-15] POST /api/owner/compliance/classify — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("result shape includes all expected top-level keys", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("professionalReviewRequired");
    expect(result).toHaveProperty("blocked");
    expect(result).toHaveProperty("reasons");
    expect(result).toHaveProperty("disclaimer");
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx(NO_FLAGS, "ws-TENANT")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-TENANT");
  });

  // ── Classification correctness ─────────────────────────────────────────────

  it("no flags → informational, not blocked, no professional review", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect(result.classification).toBe("informational");
    expect(result.professionalReviewRequired).toBe(false);
    expect(result.blocked).toBe(false);
  });

  it("expiryPassed → blocked_until_review, blocked=true, professionalReviewRequired=true", async () => {
    const result = await POST(makeCtx(EXPIRY_PASSED)) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_until_review");
    expect(result.blocked).toBe(true);
    expect(result.professionalReviewRequired).toBe(true);
  });

  it("expiringSoon → caution, not blocked, no professional review", async () => {
    const result = await POST(makeCtx(EXPIRING_SOON)) as Record<string, unknown>;
    expect(result.classification).toBe("caution");
    expect(result.blocked).toBe(false);
    expect(result.professionalReviewRequired).toBe(false);
  });

  it("taxImpact → professional_review_required, professionalReviewRequired=true, not blocked", async () => {
    const result = await POST(makeCtx(TAX_ONLY)) as Record<string, unknown>;
    expect(result.classification).toBe("professional_review_required");
    expect(result.professionalReviewRequired).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it("contractOrLegalRisk → professional_review_required", async () => {
    const result = await POST(makeCtx(CONTRACT_RISK)) as Record<string, unknown>;
    expect(result.classification).toBe("professional_review_required");
    expect(result.professionalReviewRequired).toBe(true);
  });

  it("staffSensitive → professional_review_required", async () => {
    const result = await POST(makeCtx(STAFF_SENSITIVE)) as Record<string, unknown>;
    expect(result.classification).toBe("professional_review_required");
    expect(result.professionalReviewRequired).toBe(true);
  });

  it("advertisingClaim → caution, not blocked", async () => {
    const result = await POST(makeCtx(AD_CLAIM)) as Record<string, unknown>;
    expect(result.classification).toBe("caution");
    expect(result.blocked).toBe(false);
  });

  it("dataPrivacy → caution, not blocked", async () => {
    const result = await POST(makeCtx(DATA_PRIVACY)) as Record<string, unknown>;
    expect(result.classification).toBe("caution");
    expect(result.blocked).toBe(false);
  });

  // ── Worst-case ordering ────────────────────────────────────────────────────

  it("multiple caution signals → still caution (not escalated further)", async () => {
    const result = await POST(makeCtx(MULTIPLE_CAUTION)) as Record<string, unknown>;
    expect(result.classification).toBe("caution");
  });

  it("expiringSoon + taxImpact → professional_review_required (tax wins over caution)", async () => {
    const result = await POST(makeCtx(MULTIPLE_MIXED)) as Record<string, unknown>;
    expect(result.classification).toBe("professional_review_required");
  });

  it("expiryPassed + taxImpact + contractOrLegalRisk → blocked_until_review (worst wins)", async () => {
    const result = await POST(makeCtx(WORST_CASE)) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_until_review");
    expect(result.blocked).toBe(true);
  });

  // ── Reasons list ──────────────────────────────────────────────────────────

  it("reasons array is non-empty for every response", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as { reasons: string[] };
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("expiryPassed reasons mention expired licence/permit", async () => {
    const result = await POST(makeCtx(EXPIRY_PASSED)) as { reasons: string[] };
    const text = result.reasons.join(" ").toLowerCase();
    expect(text).toContain("expir");
  });

  it("taxImpact reasons mention tax", async () => {
    const result = await POST(makeCtx(TAX_ONLY)) as { reasons: string[] };
    const text = result.reasons.join(" ").toLowerCase();
    expect(text).toContain("tax");
  });

  it("multiple signals produce multiple reasons", async () => {
    const result = await POST(makeCtx(WORST_CASE)) as { reasons: string[] };
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  // ── Disclaimer invariant ──────────────────────────────────────────────────

  it("disclaimer is always present and non-empty", async () => {
    for (const body of [NO_FLAGS, EXPIRY_PASSED, TAX_ONLY]) {
      const result = await POST(makeCtx(body)) as Record<string, unknown>;
      expect(typeof result.disclaimer).toBe("string");
      expect((result.disclaimer as string).length).toBeGreaterThan(0);
    }
  });

  it("disclaimer contains 'not a' or 'not a professional' wording", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect((result.disclaimer as string).toLowerCase()).toMatch(/not a (lawyer|accountant|professional|qualified)/);
  });

  // ── contextNote pass-through ─────────────────────────────────────────────

  it("contextNote is included in the response when supplied", async () => {
    const result = await POST(makeCtx({ contextNote: "Year-end tax check" })) as Record<string, unknown>;
    expect(result.contextNote).toBe("Year-end tax check");
  });

  it("contextNote is absent from response when not supplied", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect(result).not.toHaveProperty("contextNote");
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it("different workspace IDs produce different workspaceId in result", async () => {
    const r1 = await POST(makeCtx(NO_FLAGS, "ws-ALICE")) as Record<string, unknown>;
    const r2 = await POST(makeCtx(NO_FLAGS, "ws-BOB")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");
    expect(r2.workspaceId).toBe("ws-BOB");
  });

  it("is pure — same signals produce same classification every call", async () => {
    const r1 = await POST(makeCtx(EXPIRY_PASSED)) as Record<string, unknown>;
    const r2 = await POST(makeCtx(EXPIRY_PASSED)) as Record<string, unknown>;
    expect(r1.classification).toBe(r2.classification);
    expect(r1.blocked).toBe(r2.blocked);
  });

  // ── Validation gates ──────────────────────────────────────────────────────

  it("rejects unknown body fields before classification", async () => {
    await expect(POST(makeCtx({ unknownField: true }))).rejects.toThrow();
  });

  it("rejects workspaceId in body before classification", async () => {
    await expect(
      POST(makeCtx({ workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });
});
