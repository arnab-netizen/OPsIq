/**
 * GET /api/admin/overview -- journey funnel reporting window.
 *
 * getJourneyFunnel() (journey-funnel.service.ts) already supports up to 90 days; before this change the
 * route hardcoded getJourneyFunnel(7), so an operator had no way to ask for 30 or 90 days without a code
 * change. Verifies: the route accepts only the three governed presets (7/30/90) via ?windowDays=, any other
 * value (missing, non-numeric, or a number outside the preset list) falls back to 7, and the RBAC gate
 * (CUSTOMER_ACCESS_MANAGE) is unchanged -- this is a reporting-window change only, no new data exposed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const enforcementCapture = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: Record<string, unknown>) => unknown, options?: Record<string, unknown>) => {
    enforcementCapture.options = options ?? null;
    return handler;
  },
}));

const getJourneyFunnelMock = vi.hoisted(() => vi.fn().mockResolvedValue({ windowDays: 7, since: "x", steps: [], failures: [], truncated: false }));
vi.mock("@/services/admin/journey-funnel.service", () => ({ getJourneyFunnel: getJourneyFunnelMock }));

vi.mock("@/lib/db", () => ({
  db: {
    betaRequest: { count: vi.fn().mockResolvedValue(0) },
    user: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("@/services/beta/platform-settings.service", () => ({
  readEffectiveSettings: vi.fn().mockResolvedValue({ capacityLimit: 100, admissionMode: "OPEN_BETA", source: "db" }),
  countCapacityUsage: vi.fn().mockResolvedValue({ consumed: 0, verified: 0, pending: 0, ledger: 0 }),
}));
vi.mock("@/services/admin/limbo-accounts.service", () => ({ countVerifiedWithoutPassword: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/beta", () => ({ PUBLIC_BETA_SIGNUP_SOURCE: "PUBLIC_BETA", CONTROLLED_BETA_SIGNUP_SOURCE: "CONTROLLED_BETA" }));
vi.mock("@/infra/critical-readiness", () => ({ ensureCriticalReadiness: vi.fn().mockResolvedValue({ status: "READY", checks: {} }) }));
vi.mock("@/services/quickbooks/qbo-admin-health.service", () => ({ getQboAdminHealth: vi.fn().mockResolvedValue(null) }));

import { GET } from "@/app/api/admin/overview/route";

beforeEach(() => {
  getJourneyFunnelMock.mockClear();
});

async function call(query: string): Promise<void> {
  const request = new NextRequest(`http://localhost/api/admin/overview${query}`);
  await (GET as unknown as (ctx: { request: NextRequest }) => Promise<unknown>)({ request });
}

describe("GET /api/admin/overview journey window", () => {
  it("defaults to 7 days when no windowDays is given", async () => {
    await call("");
    expect(getJourneyFunnelMock).toHaveBeenCalledWith(7);
  });

  it.each([30, 90])("passes through a governed preset: %i", async (days) => {
    await call(`?windowDays=${days}`);
    expect(getJourneyFunnelMock).toHaveBeenCalledWith(days);
  });

  it.each(["14", "0", "-7", "9999", "abc", "7.5"])("falls back to 7 for any ungoverned value: %s", async (value) => {
    await call(`?windowDays=${value}`);
    expect(getJourneyFunnelMock).toHaveBeenCalledWith(7);
  });

  it("keeps the same RBAC gate as before (CUSTOMER_ACCESS_MANAGE) -- the window change grants no new access", () => {
    expect(enforcementCapture.options).toEqual({ requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] });
  });
});
