/**
 * Regression: Recovery findings must be ranked by canonical severity
 * (critical → high → medium → low), not by the alphabetical DB order a
 * `orderBy: { severity }` on the plain String column returns (critical, high,
 * low, medium). Mocked db returns findings in that alphabetical order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anyQueryOrdersBySeverity,
  businessServiceMock,
  CANONICAL_CODES,
  codes,
  resetFakeDb,
} from "@/__tests__/owner-spine/severity-order-fixtures";

vi.mock("@/lib/db", async () => ({
  db: (await import("@/__tests__/owner-spine/severity-order-fixtures")).fakeDb,
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/founder-recovery/business.service", async () =>
  (await import("@/__tests__/owner-spine/severity-order-fixtures")).businessServiceMock
);

import { getRecoveryDashboard } from "@/services/founder-recovery/dashboard.service";
import { getCycle } from "@/services/founder-recovery/cycle.service";

beforeEach(() => resetFakeDb());

describe("Recovery findings — canonical severity order", () => {
  it("dashboard latestCycle.findings are ranked severity-first", async () => {
    const payload = await getRecoveryDashboard("ws-1", "b-1");
    expect(businessServiceMock.getBusiness).toHaveBeenCalled();
    expect(codes(payload.latestCycle!.findings)).toEqual(CANONICAL_CODES);
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });

  it("getCycle findings are ranked severity-first", async () => {
    const cycle = await getCycle("c-1", "ws-1");
    expect(codes(cycle.findings)).toEqual(CANONICAL_CODES);
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });
});
