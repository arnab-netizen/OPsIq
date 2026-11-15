/**
 * Regression: Business Condition findings must be ranked by canonical severity
 * (critical → high → medium → low), not by the alphabetical DB order a
 * `orderBy: { severity }` on the plain String column returns (critical, high,
 * low, medium). Mocked db returns findings in that alphabetical order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anyQueryOrdersBySeverity,
  CANONICAL_CODES,
  resetFakeDb,
} from "@/__tests__/owner-spine/severity-order-fixtures";

vi.mock("@/lib/db", async () => ({
  db: (await import("@/__tests__/owner-spine/severity-order-fixtures")).fakeDb,
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/founder-recovery/business.service", async () =>
  (await import("@/__tests__/owner-spine/severity-order-fixtures")).businessServiceMock
);

import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";

beforeEach(() => resetFakeDb());

describe("Business Condition — domain topFindingCodes in canonical severity order", () => {
  it("every domain score's topFindingCodes are the three most severe findings", async () => {
    const result = await getBusinessCondition("ws-1", "b-1");
    const scores = result.profile!.domainScores;
    expect(scores.map((s) => s.domain).sort()).toEqual(
      ["cashflow", "finance", "marketing", "operations", "recovery", "sales", "sop", "strategy"]
    );
    for (const s of scores) expect(s.topFindingCodes).toEqual(CANONICAL_CODES.slice(0, 3));
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });
});
