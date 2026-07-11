/**
 * POST /api/owner/vendor/assess — Vendor / Procurement Risk Assessment (Module #14).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (vendorAssessRequestSchema)
 * 3. Route handler: classification correctness, worst-case ordering, governance
 *    invariants (disclaimer, ownerNotificationRequired, blockedFromNewOrders),
 *    tenant isolation
 *
 * The pure domain engine (assessVendorRisk) is NOT mocked — deterministic with
 * no side effects; expected values hand-calculated from vendor-risk-boundary.ts.
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

import { POST } from "@/app/api/owner/vendor/assess/route";
import { vendorAssessRequestSchema } from "@/domain/owner-mode/vendor-assess.validation";

const WS = "ws-vendor-test";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/vendor/assess",
      json: async () => body,
    },
  } as const;
}

// ── Signal fixtures ────────────────────────────────────────────────────────────

const BASE = { vendorName: "ACME Supplies" };
const NO_FLAGS = { ...BASE };
const CONTRACT_EXPIRED = { ...BASE, contractExpired: true };
const BANK_UNVERIFIED = { ...BASE, bankUnverified: true };
const SOLE_SUPPLIER = { ...BASE, soleSupplier: true };
const HIGH_SPEND = { ...BASE, spendSharePct: 65 };
const CONTRACT_SOON = { ...BASE, contractExpiringSoon: true };
const PAYMENT_OVERDUE = { ...BASE, paymentOverdue: true };
const PERF_FAILURES = { ...BASE, performanceFailures: true };
const MULTIPLE_REVIEW = { ...BASE, contractExpiringSoon: true, paymentOverdue: true, performanceFailures: true };
const BLOCKED_AND_CONCENTRATED = { ...BASE, contractExpired: true, soleSupplier: true };

// ─── 1. Route static enforcement ─────────────────────────────────────────────

describe("[module-14] vendor/assess route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/vendor/assess/route.ts"),
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

  it("validates body via vendorAssessRequestSchema", () => {
    expect(src).toContain("vendorAssessRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls assessVendorRisk (pure domain engine)", () => {
    expect(src).toContain("assessVendorRisk");
  });

  it("always includes disclaimer in the response", () => {
    expect(src).toContain("result.disclaimer");
  });
});

// ─── 2. Zod schema validation ─────────────────────────────────────────────────

describe("[module-14] vendorAssessRequestSchema", () => {
  it("accepts minimum valid body (vendorName only)", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "Acme" });
    expect(r.success).toBe(true);
  });

  it("accepts all optional boolean signals", () => {
    for (const key of [
      "soleSupplier", "contractExpired", "contractExpiringSoon",
      "bankUnverified", "paymentOverdue", "performanceFailures"
    ] as const) {
      const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", [key]: true });
      expect(r.success).toBe(true);
    }
  });

  it("accepts spendSharePct as number 0–100", () => {
    for (const pct of [0, 25.5, 50, 100]) {
      const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", spendSharePct: pct });
      expect(r.success).toBe(true);
    }
  });

  it("rejects spendSharePct > 100", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", spendSharePct: 101 });
    expect(r.success).toBe(false);
  });

  it("rejects spendSharePct < 0", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", spendSharePct: -1 });
    expect(r.success).toBe(false);
  });

  it("accepts contextNote as optional string ≤500 chars", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", contextNote: "Review Q3 contract." });
    expect(r.success).toBe(true);
  });

  it("rejects contextNote > 500 chars", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", contextNote: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("rejects empty vendorName", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "" });
    expect(r.success).toBe(false);
  });

  it("rejects vendorName > 200 chars", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", unknownField: true });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in body (strict mode)", () => {
    const r = vendorAssessRequestSchema.safeParse({ vendorName: "V", workspaceId: "ws-attack" });
    expect(r.success).toBe(false);
  });

  it("accepts full body with all fields", () => {
    const r = vendorAssessRequestSchema.safeParse({
      vendorName: "Mega Supplies Ltd",
      spendSharePct: 45,
      soleSupplier: false,
      contractExpired: false,
      contractExpiringSoon: true,
      bankUnverified: false,
      paymentOverdue: true,
      performanceFailures: false,
      contextNote: "Q4 renewal pending",
    });
    expect(r.success).toBe(true);
  });
});

// ─── 3. Route handler — classification, governance, tenant isolation ──────────

describe("[module-14] POST /api/owner/vendor/assess — route handler", () => {
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
    expect(result).toHaveProperty("vendorName");
    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("ownerNotificationRequired");
    expect(result).toHaveProperty("blockedFromNewOrders");
    expect(result).toHaveProperty("reasons");
    expect(result).toHaveProperty("recommendedActions");
    expect(result).toHaveProperty("disclaimer");
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx(NO_FLAGS, "ws-TENANT")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-TENANT");
  });

  it("echoes vendorName in response", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect(result.vendorName).toBe("ACME Supplies");
  });

  // ── Classification correctness ─────────────────────────────────────────────

  it("no flags → informational, not blocked, no owner notification", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect(result.classification).toBe("informational");
    expect(result.ownerNotificationRequired).toBe(false);
    expect(result.blockedFromNewOrders).toBe(false);
  });

  it("contractExpired → blocked_pending_review, blockedFromNewOrders=true, ownerNotificationRequired=true", async () => {
    const result = await POST(makeCtx(CONTRACT_EXPIRED)) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_pending_review");
    expect(result.blockedFromNewOrders).toBe(true);
    expect(result.ownerNotificationRequired).toBe(true);
  });

  it("bankUnverified → blocked_pending_review, blockedFromNewOrders=true", async () => {
    const result = await POST(makeCtx(BANK_UNVERIFIED)) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_pending_review");
    expect(result.blockedFromNewOrders).toBe(true);
  });

  it("soleSupplier → high_concentration_risk, ownerNotificationRequired=true, not blocked", async () => {
    const result = await POST(makeCtx(SOLE_SUPPLIER)) as Record<string, unknown>;
    expect(result.classification).toBe("high_concentration_risk");
    expect(result.ownerNotificationRequired).toBe(true);
    expect(result.blockedFromNewOrders).toBe(false);
  });

  it("spendSharePct ≥ 50 → high_concentration_risk", async () => {
    const result = await POST(makeCtx(HIGH_SPEND)) as Record<string, unknown>;
    expect(result.classification).toBe("high_concentration_risk");
    expect(result.ownerNotificationRequired).toBe(true);
    expect(result.blockedFromNewOrders).toBe(false);
  });

  it("spendSharePct < 50 alone → informational", async () => {
    const result = await POST(makeCtx({ vendorName: "V", spendSharePct: 30 })) as Record<string, unknown>;
    expect(result.classification).toBe("informational");
  });

  it("contractExpiringSoon → review_advised, ownerNotificationRequired=true, not blocked", async () => {
    const result = await POST(makeCtx(CONTRACT_SOON)) as Record<string, unknown>;
    expect(result.classification).toBe("review_advised");
    expect(result.ownerNotificationRequired).toBe(true);
    expect(result.blockedFromNewOrders).toBe(false);
  });

  it("paymentOverdue → review_advised", async () => {
    const result = await POST(makeCtx(PAYMENT_OVERDUE)) as Record<string, unknown>;
    expect(result.classification).toBe("review_advised");
    expect(result.ownerNotificationRequired).toBe(true);
  });

  it("performanceFailures → review_advised", async () => {
    const result = await POST(makeCtx(PERF_FAILURES)) as Record<string, unknown>;
    expect(result.classification).toBe("review_advised");
    expect(result.ownerNotificationRequired).toBe(true);
  });

  // ── Worst-case ordering ────────────────────────────────────────────────────

  it("multiple review-advised signals → still review_advised (not escalated further)", async () => {
    const result = await POST(makeCtx(MULTIPLE_REVIEW)) as Record<string, unknown>;
    expect(result.classification).toBe("review_advised");
  });

  it("contractExpired + soleSupplier → blocked_pending_review (worst wins)", async () => {
    const result = await POST(makeCtx(BLOCKED_AND_CONCENTRATED)) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_pending_review");
    expect(result.blockedFromNewOrders).toBe(true);
  });

  it("bankUnverified + contractExpiringSoon → blocked_pending_review (bank wins)", async () => {
    const result = await POST(makeCtx({ ...BASE, bankUnverified: true, contractExpiringSoon: true })) as Record<string, unknown>;
    expect(result.classification).toBe("blocked_pending_review");
  });

  it("soleSupplier + paymentOverdue → high_concentration_risk (concentration wins)", async () => {
    const result = await POST(makeCtx({ ...BASE, soleSupplier: true, paymentOverdue: true })) as Record<string, unknown>;
    expect(result.classification).toBe("high_concentration_risk");
  });

  // ── Reasons and recommended actions ───────────────────────────────────────

  it("reasons array is non-empty for every response", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as { reasons: string[] };
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("contractExpired reason mentions expir", async () => {
    const result = await POST(makeCtx(CONTRACT_EXPIRED)) as { reasons: string[] };
    const text = result.reasons.join(" ").toLowerCase();
    expect(text).toContain("expir");
  });

  it("bankUnverified reason mentions bank", async () => {
    const result = await POST(makeCtx(BANK_UNVERIFIED)) as { reasons: string[] };
    const text = result.reasons.join(" ").toLowerCase();
    expect(text).toContain("bank");
  });

  it("soleSupplier reason mentions sole", async () => {
    const result = await POST(makeCtx(SOLE_SUPPLIER)) as { reasons: string[] };
    const text = result.reasons.join(" ").toLowerCase();
    expect(text).toContain("sole");
  });

  it("high spendShare reason mentions spend share percentage", async () => {
    const result = await POST(makeCtx(HIGH_SPEND)) as { reasons: string[] };
    const text = result.reasons.join(" ");
    expect(text).toContain("65");
  });

  it("recommendedActions is non-empty for every response", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as { recommendedActions: string[] };
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it("multiple signals produce multiple reasons", async () => {
    const result = await POST(makeCtx(BLOCKED_AND_CONCENTRATED)) as { reasons: string[] };
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  // ── Disclaimer invariant ──────────────────────────────────────────────────

  it("disclaimer is always present and non-empty", async () => {
    for (const body of [NO_FLAGS, CONTRACT_EXPIRED, SOLE_SUPPLIER]) {
      const result = await POST(makeCtx(body)) as Record<string, unknown>;
      expect(typeof result.disclaimer).toBe("string");
      expect((result.disclaimer as string).length).toBeGreaterThan(0);
    }
  });

  it("disclaimer contains 'not a' professional wording", async () => {
    const result = await POST(makeCtx(NO_FLAGS)) as Record<string, unknown>;
    expect((result.disclaimer as string).toLowerCase()).toMatch(/not a (professional|qualified|legal)/);
  });

  // ── contextNote pass-through ─────────────────────────────────────────────

  it("contextNote is included in the response when supplied", async () => {
    const result = await POST(makeCtx({ ...BASE, contextNote: "Quarterly supplier review" })) as Record<string, unknown>;
    expect(result.contextNote).toBe("Quarterly supplier review");
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

  it("is pure — same signals always produce same classification", async () => {
    const r1 = await POST(makeCtx(CONTRACT_EXPIRED)) as Record<string, unknown>;
    const r2 = await POST(makeCtx(CONTRACT_EXPIRED)) as Record<string, unknown>;
    expect(r1.classification).toBe(r2.classification);
    expect(r1.blockedFromNewOrders).toBe(r2.blockedFromNewOrders);
  });

  // ── Validation gates ──────────────────────────────────────────────────────

  it("rejects unknown body fields before classification", async () => {
    await expect(POST(makeCtx({ vendorName: "V", unknownField: true }))).rejects.toThrow();
  });

  it("rejects workspaceId in body before classification", async () => {
    await expect(
      POST(makeCtx({ vendorName: "V", workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });

  it("rejects missing vendorName", async () => {
    await expect(POST(makeCtx({}))).rejects.toThrow();
  });
});
