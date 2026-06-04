/**
 * P2C-BATCH-4C: CONDITION GET ROUTE — READ-ONLY HARDENING EXPOSURE
 *
 * Verifies that GET /api/engagements/[engagementId]/condition additively
 * exposes a read-only `hardeningContext` alongside the existing `profiles`,
 * without altering POST, workspace enforcement, or write behavior.
 *
 * Independent harness (NOT the P2B route harness):
 * - withCanonicalEnforcement is mocked to a pass-through so the real GET
 *   handler body runs directly with an injected verified context (DB-free).
 * - DB-touching modules (business-condition service, visibility, validation,
 *   idempotency) are mocked; the real domain hardening adapter is used to
 *   construct realistic hardening contexts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveHardeningContextFromConditionProfile } from "@/domain/business-condition/business-condition";

const mocks = vi.hoisted(() => ({
  getConditionHistory: vi.fn(),
  getCurrentConditionWithHardening: vi.fn(),
  assessCondition: vi.fn(),
  assertEngagementAccess: vi.fn(),
}));

// Pass-through wrapper so the real GET/POST handler bodies are invoked directly.
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown, params: Record<string, string>) => unknown) =>
    (ctx: unknown, params: Record<string, string>) =>
      handler(ctx, params),
}));

vi.mock("@/services/business-condition", () => ({
  getConditionHistory: mocks.getConditionHistory,
  getCurrentConditionWithHardening: mocks.getCurrentConditionWithHardening,
  assessCondition: mocks.assessCondition,
}));

vi.mock("@/lib/visibility", () => ({
  assertEngagementAccess: mocks.assertEngagementAccess,
}));

vi.mock("@/lib/validation", () => ({
  parseOrThrow: (_schema: unknown, value: unknown) => value,
  uuidSchema: {},
  parseRequestBody: vi.fn(),
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: vi.fn(),
  recordIdempotencyResponse: vi.fn(),
  recordIdempotencyError: vi.fn(),
}));

// Imported after mocks are registered (vi.mock is hoisted).
import {
  GET,
  POST,
} from "@/app/api/engagements/[engagementId]/condition/route";

const ENGAGEMENT_ID = "11111111-1111-1111-1111-111111111111";
const ctx = {
  verifiedActorId: "actor-1",
  verifiedWorkspaceId: "ws-1",
} as const;

const sampleProfile = {
  id: "profile-1",
  engagementId: ENGAGEMENT_ID,
  businessStatus: "distressed",
  severityScore: 7,
  cashPressureLevel: "high",
  isCurrent: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P2C-BATCH-4C: GET condition route hardening exposure", () => {
  // 1. Additive: existing profiles preserved + hardeningContext present.
  it("returns existing profiles and an additive hardeningContext", async () => {
    const profiles = [sampleProfile];
    const hardeningContext = deriveHardeningContextFromConditionProfile(sampleProfile);

    mocks.getConditionHistory.mockResolvedValue(profiles);
    mocks.getCurrentConditionWithHardening.mockResolvedValue({
      profile: sampleProfile,
      hardeningContext,
    });

    const res = (await GET(ctx, { engagementId: ENGAGEMENT_ID })) as {
      profiles: unknown;
      hardeningContext: unknown;
    };

    // profiles is the unchanged history array (same reference).
    expect(res.profiles).toBe(profiles);
    // hardeningContext is the service-derived context.
    expect(res.hardeningContext).toBe(hardeningContext);
    expect((res.hardeningContext as { sufficientData: boolean }).sufficientData).toBe(true);

    expect(mocks.getCurrentConditionWithHardening).toHaveBeenCalledWith(
      ENGAGEMENT_ID,
      "ws-1"
    );
  });

  // 2. Caution-preserving when there is no current profile.
  it("returns a caution-preserving hardeningContext when no current profile exists", async () => {
    mocks.getConditionHistory.mockResolvedValue([]);
    mocks.getCurrentConditionWithHardening.mockResolvedValue({
      profile: null,
      hardeningContext: deriveHardeningContextFromConditionProfile(null),
    });

    const res = (await GET(ctx, { engagementId: ENGAGEMENT_ID })) as {
      profiles: unknown[];
      hardeningContext: {
        sufficientData: boolean;
        hardeningPressure: string;
        confidenceAdjustment: string;
        cautionLevel: string;
      };
    };

    expect(res.profiles).toEqual([]);
    expect(res.hardeningContext.sufficientData).toBe(false);
    expect(["low", "minimal"]).not.toContain(res.hardeningContext.hardeningPressure);
    expect(res.hardeningContext.confidenceAdjustment).not.toBe("maintain_or_increase");
    expect(res.hardeningContext.cautionLevel).not.toBe("low");
  });

  // 3. Workspace/auth enforcement path preserved.
  it("still enforces engagement access with the verified actor and workspace", async () => {
    mocks.getConditionHistory.mockResolvedValue([]);
    mocks.getCurrentConditionWithHardening.mockResolvedValue({
      profile: null,
      hardeningContext: deriveHardeningContextFromConditionProfile(null),
    });

    await GET(ctx, { engagementId: ENGAGEMENT_ID });

    expect(mocks.assertEngagementAccess).toHaveBeenCalledWith(
      "actor-1",
      ENGAGEMENT_ID,
      "ws-1"
    );
    // Both reads are scoped to the verified workspace.
    expect(mocks.getConditionHistory).toHaveBeenCalledWith(ENGAGEMENT_ID, "ws-1");
    expect(mocks.getCurrentConditionWithHardening).toHaveBeenCalledWith(
      ENGAGEMENT_ID,
      "ws-1"
    );
  });

  // 4. GET performs no write — assessCondition is never called.
  it("does not call assessCondition (no write on read path)", async () => {
    mocks.getConditionHistory.mockResolvedValue([]);
    mocks.getCurrentConditionWithHardening.mockResolvedValue({
      profile: null,
      hardeningContext: deriveHardeningContextFromConditionProfile(null),
    });

    await GET(ctx, { engagementId: ENGAGEMENT_ID });

    expect(mocks.assessCondition).not.toHaveBeenCalled();
  });

  // 5. POST remains exported/unaltered by this change.
  it("leaves POST exported and unchanged in shape", () => {
    expect(typeof POST).toBe("function");
  });
});
