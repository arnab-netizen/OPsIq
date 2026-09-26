/**
 * Regression: Owner Home findings must be ranked by canonical severity
 * (critical → high → medium → low), not by the alphabetical DB order a
 * `orderBy: { severity }` on the plain String column returns (critical, high,
 * low, medium). Mocked db returns findings in that alphabetical order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anyQueryOrdersBySeverity,
  resetFakeDb,
} from "@/__tests__/owner-spine/severity-order-fixtures";

vi.mock("@/lib/db", async () => ({
  db: (await import("@/__tests__/owner-spine/severity-order-fixtures")).fakeDb,
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/founder-recovery/business.service", async () =>
  (await import("@/__tests__/owner-spine/severity-order-fixtures")).businessServiceMock
);

import { getOwnerHome } from "@/services/owner-home/home.service";

beforeEach(() => resetFakeDb());

describe("Owner Home — findings in canonical severity order", () => {
  it("top risks are the most severe findings and no query sorts by severity", async () => {
    const result = await getOwnerHome("ws-1", "b-1");
    const top = result.summary!.top3Risks;
    expect(top.map((r) => r.severity)).toEqual(["critical", "critical", "critical"]);
    expect(top.every((r) => r.code === "F_CRIT")).toBe(true);
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });
});
