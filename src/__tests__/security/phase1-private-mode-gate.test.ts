/**
 * Phase 1 — Private mode gate unit tests.
 *
 * Tests the three security invariants:
 * 1. resolvePrivateModeRole returns null for users with no approved record
 * 2. enforcePrivateModeGate fixed feature check (was a dead branch)
 * 3. getSubscriptionTier workspace-scoped env var override (no bleed-through)
 * 4. Connector stubs throw FeatureDisabledError (not generic Error)
 *
 * No DB required — all DB calls are mocked via vi.mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeatureDisabledError } from "@/infra/errors";

// Valid UUIDs for test identities (claimWorkspaceId requires UUID format)
const WS_1 = "11111111-1111-1111-1111-111111111111";
const WS_2 = "22222222-2222-2222-2222-222222222222";
const USER_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// Mock: PrivateModeRoleAccessService — must be a class (used with `new`)
// ---------------------------------------------------------------------------

const mockGetUserRole = vi.fn<(workspaceId: string, userId: string) => Promise<string | null>>();

vi.mock("@/services/private-mode/role-access.service", () => {
  return {
    PrivateModeRoleAccessService: class {
      getUserRole(workspaceId: string, userId: string) {
        return mockGetUserRole(workspaceId, userId);
      }
    },
  };
});

// Mock db so PrismaClient resolution in private-mode-enforcement doesn't hit real DB
vi.mock("@/lib/db", () => ({ db: {} }));

// Mock canonical-route-enforcement so withPrivateModeEnforcement is testable without
// a full Next.js request lifecycle. The test calls resolvePrivateModeRole directly.
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

import { resolvePrivateModeRole } from "@/lib/private-mode-enforcement";
import { enforcePrivateModeGate } from "@/middleware/private-mode-gate";
import {
  getSubscriptionTier,
  setSubscriptionTier,
  SubscriptionTier,
} from "@/services/entitlement";
import type { PrivateModeRole } from "@/domain/private-mode/role-config";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// 1. resolvePrivateModeRole
// ---------------------------------------------------------------------------

describe("resolvePrivateModeRole — identity sourced from pre-verified context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns OWNER role for a user with approved PrivateModeAccess", async () => {
    mockGetUserRole.mockResolvedValue("OWNER");
    const role = await resolvePrivateModeRole({ workspaceId: WS_1, userId: USER_1 });
    expect(role).toBe("OWNER");
    expect(mockGetUserRole).toHaveBeenCalledWith(WS_1, USER_1);
  });

  it("returns null for a user with no approved PrivateModeAccess record (pending or absent)", async () => {
    mockGetUserRole.mockResolvedValue(null);
    const role = await resolvePrivateModeRole({ workspaceId: WS_1, userId: USER_2 });
    expect(role).toBeNull();
  });

  it("returns null for a different user in the same workspace — no bleed-through", async () => {
    mockGetUserRole.mockImplementation((_ws, userId) =>
      Promise.resolve(userId === USER_1 ? "OWNER" : null),
    );

    const ownerRole = await resolvePrivateModeRole({ workspaceId: WS_1, userId: USER_1 });
    const otherRole = await resolvePrivateModeRole({ workspaceId: WS_1, userId: USER_2 });

    expect(ownerRole).toBe("OWNER");
    expect(otherRole).toBeNull();
  });

  it("returns null for a workspace the user is not a member of", async () => {
    mockGetUserRole.mockResolvedValue(null);
    const role = await resolvePrivateModeRole({ workspaceId: WS_2, userId: USER_1 });
    expect(role).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. enforcePrivateModeGate — fixed feature branch (was dead code bug)
// ---------------------------------------------------------------------------

describe("enforcePrivateModeGate — requiredFeatures branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(headers: Record<string, string> = {}) {
    const h = new Headers({
      "x-user-id": USER_1,
      "x-workspace-id": WS_1,
      ...headers,
    });
    return { headers: { get: (k: string) => h.get(k) } } as unknown as NextRequest;
  }

  it("returns 403 FEATURES_UNAVAILABLE when ANALYST role lacks ownerDashboard feature", async () => {
    const resolver = async (): Promise<PrivateModeRole> => "ANALYST";

    const result = await enforcePrivateModeGate(
      makeRequest(),
      { required: true, requiredFeatures: ["ownerDashboard"] },
      { resolveRole: resolver },
    );

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.code).toBe("FEATURES_UNAVAILABLE");
    expect(result!.status).toBe(403);
  });

  it("allows access when OWNER role has all required features", async () => {
    const resolver = async (): Promise<PrivateModeRole> => "OWNER";

    const result = await enforcePrivateModeGate(
      makeRequest(),
      { required: true, requiredFeatures: ["ownerDashboard", "adminReview"] },
      { resolveRole: resolver },
    );

    expect(result).toBeNull(); // null = continue to handler
  });

  it("returns 403 PRIVATE_MODE_REQUIRED when user has no access and mode is required", async () => {
    const resolver = async (): Promise<null> => null;

    const result = await enforcePrivateModeGate(
      makeRequest(),
      { required: true },
      { resolveRole: resolver },
    );

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.code).toBe("PRIVATE_MODE_REQUIRED");
    expect(result!.status).toBe(403);
  });

  it("returns 403 ROLE_INSUFFICIENT when role exists but does not match requiredRole", async () => {
    const resolver = async (): Promise<PrivateModeRole> => "ANALYST";

    const result = await enforcePrivateModeGate(
      makeRequest(),
      { required: true, requiredRole: "OWNER" },
      { resolveRole: resolver },
    );

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.code).toBe("ROLE_INSUFFICIENT");
    expect(body.required).toBe("OWNER");
    expect(body.actual).toBe("ANALYST");
    expect(result!.status).toBe(403);
  });

  it("allows bypass when bypassPrivateMode is set (Owner Mode compatibility)", async () => {
    const resolver = vi.fn().mockResolvedValue(null);

    const result = await enforcePrivateModeGate(
      makeRequest(),
      { bypassPrivateMode: true },
      { resolveRole: resolver },
    );

    expect(result).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("fails closed when no resolver is provided — no header spoofing possible", async () => {
    const result = await enforcePrivateModeGate(
      makeRequest(),
      { required: true },
      {}, // no resolveRole
    );

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.code).toBe("PRIVATE_MODE_REQUIRED");
    expect(result!.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. getSubscriptionTier — workspace-scoped env var override
// ---------------------------------------------------------------------------

describe("getSubscriptionTier — OPSIQ_PRIVATE_WORKSPACE_ID override", () => {
  const PRIVATE_WS = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const OTHER_WS = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

  afterEach(() => {
    delete process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
    setSubscriptionTier(PRIVATE_WS, SubscriptionTier.FREE);
    setSubscriptionTier(OTHER_WS, SubscriptionTier.FREE);
  });

  it("returns FREE for all workspaces when env var is not set", () => {
    delete process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
    expect(getSubscriptionTier(PRIVATE_WS)).toBe(SubscriptionTier.FREE);
    expect(getSubscriptionTier(OTHER_WS)).toBe(SubscriptionTier.FREE);
  });

  it("returns ENTERPRISE for the private workspace when env var matches", () => {
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = PRIVATE_WS;
    expect(getSubscriptionTier(PRIVATE_WS)).toBe(SubscriptionTier.ENTERPRISE);
  });

  it("does NOT elevate other workspaces when env var is set — override is workspace-scoped", () => {
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = PRIVATE_WS;
    expect(getSubscriptionTier(OTHER_WS)).toBe(SubscriptionTier.FREE);
  });

  it("two simultaneous calls with different workspace IDs each return correct tier", () => {
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = PRIVATE_WS;
    const [tierA, tierB] = [getSubscriptionTier(PRIVATE_WS), getSubscriptionTier(OTHER_WS)];
    expect(tierA).toBe(SubscriptionTier.ENTERPRISE);
    expect(tierB).toBe(SubscriptionTier.FREE);
  });

  it("explicit Map entry for other workspace is respected when env var is set", () => {
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = PRIVATE_WS;
    setSubscriptionTier(OTHER_WS, SubscriptionTier.PRO);
    expect(getSubscriptionTier(PRIVATE_WS)).toBe(SubscriptionTier.ENTERPRISE);
    expect(getSubscriptionTier(OTHER_WS)).toBe(SubscriptionTier.PRO);
  });
});

// ---------------------------------------------------------------------------
// 4. Connector stubs — FeatureDisabledError contract
// ---------------------------------------------------------------------------

describe("Connector stubs — typed FeatureDisabledError (not generic Error)", () => {
  it("exchangeCodeForToken throws FeatureDisabledError with code=FEATURE_DISABLED, status=501", async () => {
    const { exchangeCodeForToken } = await import(
      "@/services/external-systems/google-sheets-oauth.service"
    );
    await expect(exchangeCodeForToken({} as never)).rejects.toBeInstanceOf(FeatureDisabledError);
    try {
      await exchangeCodeForToken({} as never);
    } catch (err) {
      const e = err as FeatureDisabledError;
      expect(e.code).toBe("FEATURE_DISABLED");
      expect(e.statusCode).toBe(501);
      expect(e.name).toBe("FeatureDisabledError");
    }
  });

  it("extractGoogleSheetData throws FeatureDisabledError", async () => {
    const { extractGoogleSheetData } = await import(
      "@/services/external-systems/google-sheets-oauth.service"
    );
    await expect(extractGoogleSheetData({} as never)).rejects.toBeInstanceOf(FeatureDisabledError);
    try {
      await extractGoogleSheetData({} as never);
    } catch (err) {
      expect((err as FeatureDisabledError).statusCode).toBe(501);
      expect((err as FeatureDisabledError).code).toBe("FEATURE_DISABLED");
    }
  });

  it("refreshAccessToken throws FeatureDisabledError", async () => {
    const { refreshAccessToken } = await import(
      "@/services/external-systems/google-sheets-oauth.service"
    );
    await expect(refreshAccessToken({} as never)).rejects.toBeInstanceOf(FeatureDisabledError);
    try {
      await refreshAccessToken({} as never);
    } catch (err) {
      expect((err as FeatureDisabledError).statusCode).toBe(501);
    }
  });

  it("revokeGoogleAccess throws FeatureDisabledError", async () => {
    const { revokeGoogleAccess } = await import(
      "@/services/external-systems/google-sheets-oauth.service"
    );
    await expect(revokeGoogleAccess({} as never)).rejects.toBeInstanceOf(FeatureDisabledError);
    try {
      await revokeGoogleAccess({} as never);
    } catch (err) {
      expect((err as FeatureDisabledError).statusCode).toBe(501);
    }
  });

  it("exchangeRefreshTokenForAccessToken throws FeatureDisabledError with provider in message", async () => {
    const { exchangeRefreshTokenForAccessToken } = await import(
      "@/services/external-systems/token-lifecycle.service"
    );
    await expect(
      exchangeRefreshTokenForAccessToken("google_sheets", "tok", "refresh-tok", "cid", "csec"),
    ).rejects.toBeInstanceOf(FeatureDisabledError);
    try {
      await exchangeRefreshTokenForAccessToken("google_sheets", "tok", "refresh-tok", "cid", "csec");
    } catch (err) {
      const e = err as FeatureDisabledError;
      expect(e.statusCode).toBe(501);
      expect(e.code).toBe("FEATURE_DISABLED");
      expect(e.message).toContain("google_sheets");
    }
  });

  it("FeatureDisabledError is non-retryable — client retry will never succeed while feature is off", async () => {
    const { revokeGoogleAccess } = await import(
      "@/services/external-systems/google-sheets-oauth.service"
    );
    try {
      await revokeGoogleAccess({} as never);
    } catch (err) {
      expect(err).toBeInstanceOf(FeatureDisabledError);
      const e = err as FeatureDisabledError;
      expect(e.telemetry?.retryable).toBe(false);
    }
  });
});
