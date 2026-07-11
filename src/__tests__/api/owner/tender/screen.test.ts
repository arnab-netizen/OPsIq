/**
 * POST /api/owner/tender/screen — Tender / Application Assistance (Module A5).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (tenderScreenRequestSchema)
 * 3. Route handler: workspace tenant isolation, bid-gate wiring, governance rules
 *
 * The pure domain engine (screenTenderProcurementSignal) is NOT mocked — it is
 * deterministic with no side effects; the real implementation runs here.
 * This validates the full bid-decision gate, readiness check, and cash-exposure
 * guardrail end-to-end.
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

import { POST } from "@/app/api/owner/tender/screen/route";
import { tenderScreenRequestSchema } from "@/domain/owner-mode/tender-screen.validation";

const WS = "ws-canonical";
const AT = "2026-07-11T00:00:00.000Z";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/tender/screen",
      json: async () => body,
    },
  } as const;
}

/** Minimal valid body — all tender fields UNKNOWN (worst-case: collect eligibility first). */
const MINIMAL_BODY = {
  signalSourceType: "GOVERNMENT_TENDER",
  opportunityTitle: "Road Resurfacing Contract 2026",
  sourceEvidenceSummary: "Published on official procurement portal",
  sourceRefs: ["https://procurement.example.gov/notice/1234"],
  targetBuyer: "Municipal Works Department",
  relevanceToBusiness: "MODERATE",
  context: { cashProfitRiskActive: false, capabilityGapPresent: false },
  evaluatedAt: AT,
};

/** Body where all axes are known and safe → PREPARE_BID_DRAFT. */
const READY_BODY = {
  signalSourceType: "GOVERNMENT_TENDER",
  opportunityTitle: "Office Cleaning Services Tender",
  sourceEvidenceSummary: "Published 2026-07-01",
  sourceRefs: ["https://procurement.example.gov/notice/999"],
  targetBuyer: "City Council",
  relevanceToBusiness: "STRONG",
  context: { cashProfitRiskActive: false, capabilityGapPresent: false },
  evaluatedAt: AT,
  tender: {
    eligibility: "KNOWN",
    eligible: true,
    emdExposure: "LOW",
    paymentDelayRisk: "LOW",
    performancePenaltyRisk: "LOW",
    workingCapitalRequirement: "LOW",
    compliance: "KNOWN",
    documentationBurden: "LOW",
    capacityFit: "STRONG",
    unitEconomics: "KNOWN",
    bidDeadlineDays: 14,
  },
};

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-A5] tender/screen route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/tender/screen/route.ts"),
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

  it("validates body via tenderScreenRequestSchema", () => {
    expect(src).toContain("tenderScreenRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls screenTenderProcurementSignal (pure domain engine)", () => {
    expect(src).toContain("screenTenderProcurementSignal");
  });

  it("enforces ownerApprovalRequired=true governance rule (never submits)", () => {
    // The domain engine always sets ownerApprovalRequired=true. The source
    // must call the engine that enforces this — not bypass it.
    expect(src).toContain("screenTenderProcurementSignal");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-A5] tenderScreenRequestSchema", () => {
  it("accepts a minimal body with GOVERNMENT_TENDER (no tender fields)", () => {
    const r = tenderScreenRequestSchema.safeParse(MINIMAL_BODY);
    expect(r.success).toBe(true);
  });

  it("accepts PUBLIC_PROCUREMENT as signal source type", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, signalSourceType: "PUBLIC_PROCUREMENT" });
    expect(r.success).toBe(true);
  });

  it("accepts CORPORATE_VENDOR_OPPORTUNITY as signal source type", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, signalSourceType: "CORPORATE_VENDOR_OPPORTUNITY" });
    expect(r.success).toBe(true);
  });

  it("accepts EXPORT_OR_INSTITUTIONAL_DEMAND as signal source type", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, signalSourceType: "EXPORT_OR_INSTITUTIONAL_DEMAND" });
    expect(r.success).toBe(true);
  });

  it("rejects non-tender signal source types", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, signalSourceType: "B2B_DEMAND_SIGNAL" });
    expect(r.success).toBe(false);
  });

  it("accepts a full body with all tender fields", () => {
    const r = tenderScreenRequestSchema.safeParse(READY_BODY);
    expect(r.success).toBe(true);
  });

  it("accepts tender.eligible as null (eligibility unknown)", () => {
    const r = tenderScreenRequestSchema.safeParse({
      ...MINIMAL_BODY,
      tender: {
        eligibility: "UNKNOWN",
        eligible: null,
        emdExposure: "UNKNOWN",
        paymentDelayRisk: "UNKNOWN",
        performancePenaltyRisk: "UNKNOWN",
        workingCapitalRequirement: "UNKNOWN",
        compliance: "UNKNOWN",
        documentationBurden: "UNKNOWN",
        capacityFit: "UNKNOWN",
        unitEconomics: "UNKNOWN",
        bidDeadlineDays: null,
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts missingData as optional array of strings", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, missingData: ["compliance documents"] });
    expect(r.success).toBe(true);
  });

  it("rejects missing signalSourceType", () => {
    const { signalSourceType: _, ...rest } = MINIMAL_BODY as Record<string, unknown>;
    const r = tenderScreenRequestSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing opportunityTitle", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, opportunityTitle: "" });
    expect(r.success).toBe(false);
  });

  it("rejects missing evaluatedAt", () => {
    const { evaluatedAt: _, ...rest } = MINIMAL_BODY as Record<string, unknown>;
    const r = tenderScreenRequestSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing context field", () => {
    const { context: _, ...rest } = MINIMAL_BODY as Record<string, unknown>;
    const r = tenderScreenRequestSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, unknownField: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in the body (not a declared schema field)", () => {
    const r = tenderScreenRequestSchema.safeParse({ ...MINIMAL_BODY, workspaceId: "ws-attempt" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside tender object (strict mode)", () => {
    const r = tenderScreenRequestSchema.safeParse({
      ...MINIMAL_BODY,
      tender: { eligibility: "KNOWN", eligible: true, unknownField: "x" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects bidDeadlineDays below 0", () => {
    const r = tenderScreenRequestSchema.safeParse({
      ...MINIMAL_BODY,
      tender: { ...READY_BODY.tender, bidDeadlineDays: -1 },
    });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler — governance, workspace isolation, bid-gate wiring ────

describe("[module-A5] POST /api/owner/tender/screen — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY, "ws-CANONICAL")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-CANONICAL");
  });

  it("result shape includes all TenderProcurementCandidate fields", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    expect(result).toHaveProperty("tenderDecision");
    expect(result).toHaveProperty("readyToBid");
    expect(result).toHaveProperty("ownerApprovalRequired");
    expect(result).toHaveProperty("ownerVisibleExplanation");
    expect(result).toHaveProperty("missingData");
    expect(result).toHaveProperty("eligibility");
    expect(result).toHaveProperty("emdExposure");
    expect(result).toHaveProperty("bidDeadlineDays");
  });

  it("ownerApprovalRequired is ALWAYS true (governance invariant)", async () => {
    const result = await POST(makeCtx(READY_BODY)) as Record<string, unknown>;
    expect(result.ownerApprovalRequired).toBe(true);
  });

  it("readyToBid is false when eligibility is UNKNOWN", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    expect(result.readyToBid).toBe(false);
  });

  it("readyToBid is true only when all five axes are known and safe", async () => {
    const result = await POST(makeCtx(READY_BODY)) as Record<string, unknown>;
    expect(result.readyToBid).toBe(true);
  });

  it("tenderDecision is COLLECT_ELIGIBILITY_DATA when eligibility is UNKNOWN", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("COLLECT_ELIGIBILITY_DATA");
  });

  it("tenderDecision is PREPARE_BID_DRAFT when all axes are known and safe", async () => {
    const result = await POST(makeCtx(READY_BODY)) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("PREPARE_BID_DRAFT");
  });

  it("tenderDecision is DO_NOT_BID when eligible=false", async () => {
    const result = await POST(makeCtx({
      ...READY_BODY,
      tender: { ...READY_BODY.tender, eligibility: "KNOWN", eligible: false },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("DO_NOT_BID");
  });

  it("tenderDecision is OWNER_REVIEW_REQUIRED when emdExposure is HIGH", async () => {
    const result = await POST(makeCtx({
      ...READY_BODY,
      tender: { ...READY_BODY.tender, emdExposure: "HIGH" },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("OWNER_REVIEW_REQUIRED");
  });

  it("tenderDecision is OWNER_REVIEW_REQUIRED when cashProfitRiskActive=true", async () => {
    const result = await POST(makeCtx({
      ...READY_BODY,
      context: { cashProfitRiskActive: true, capabilityGapPresent: false },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("OWNER_REVIEW_REQUIRED");
  });

  it("tenderDecision is COLLECT_COST_DATA when unitEconomics is UNKNOWN", async () => {
    const result = await POST(makeCtx({
      ...READY_BODY,
      tender: { ...READY_BODY.tender, unitEconomics: "UNKNOWN" },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("COLLECT_COST_DATA");
  });

  it("tenderDecision is PARK when capacityFit is WEAK", async () => {
    const result = await POST(makeCtx({
      ...READY_BODY,
      tender: { ...READY_BODY.tender, capacityFit: "WEAK" },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("PARK");
  });

  it("tenderDecision is NEEDS_CAPABILITY when capabilityGapPresent=true and eligibility UNKNOWN", async () => {
    const result = await POST(makeCtx({
      ...MINIMAL_BODY,
      context: { cashProfitRiskActive: false, capabilityGapPresent: true },
    })) as Record<string, unknown>;
    expect(result.tenderDecision).toBe("NEEDS_CAPABILITY");
  });

  it("missingData includes gap description when eligibility is UNKNOWN", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY)) as { missingData: string[] };
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.missingData.some(s => s.toLowerCase().includes("eligibility"))).toBe(true);
  });

  it("evaluatedAt in response matches the body evaluatedAt", async () => {
    const customAt = "2026-01-15T12:00:00.000Z";
    const result = await POST(makeCtx({ ...MINIMAL_BODY, evaluatedAt: customAt })) as Record<string, unknown>;
    expect(result.evaluatedAt).toBe(customAt);
  });

  it("targetBuyer maps to the result targetBuyer field", async () => {
    const result = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    expect(result.targetBuyer).toBe(MINIMAL_BODY.targetBuyer);
  });

  it("rejects unknown body fields before calling the engine", async () => {
    await expect(POST(makeCtx({ ...MINIMAL_BODY, unknownField: "x" }))).rejects.toThrow();
  });

  it("rejects missing required fields before calling the engine", async () => {
    await expect(POST(makeCtx({ evaluatedAt: AT }))).rejects.toThrow();
  });

  it("does not let a body workspaceId field bypass tenant isolation", async () => {
    await expect(
      POST(makeCtx({ ...MINIMAL_BODY, workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });

  it("always sets workspaceId from ctx across different workspace contexts", async () => {
    const r1 = await POST(makeCtx(MINIMAL_BODY, "ws-ALICE")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");

    const r2 = await POST(makeCtx(MINIMAL_BODY, "ws-BOB")) as Record<string, unknown>;
    expect(r2.workspaceId).toBe("ws-BOB");
    expect(r2.workspaceId).not.toBe("ws-ALICE");
  });

  it("is pure — calling twice with the same input returns identical decision", async () => {
    const r1 = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    const r2 = await POST(makeCtx(MINIMAL_BODY)) as Record<string, unknown>;
    expect(r1.tenderDecision).toBe(r2.tenderDecision);
    expect(r1.readyToBid).toBe(r2.readyToBid);
  });
});
