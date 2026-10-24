/**
 * ENFORCEMENT OFF IS A TRUE NO-OP.
 * With BILLING_PAYWALL_ENFORCEMENT unset or not exactly "on", the dormant machinery must change nothing:
 * no entitlement lookups, no 402, no upgrade banner, identical scheduled reassessment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

const m = vi.hoisted(() => ({
  subscriptionFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  budgetFindMany: vi.fn(),
  reassessBudget: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(),
  db: {
    subscription: { findFirst: m.subscriptionFindFirst },
    $queryRaw: m.queryRaw,
    $executeRaw: m.executeRaw,
    ownerBudgetAction: { findMany: m.budgetFindMany },
  },
}));
vi.mock("@/services/owner-budget/budget.service", () => ({ reassessBudget: m.reassessBudget }));

import { ALL_COMMERCIAL_CAPABILITIES } from "@/domain/commercial/commercial-capability";
import { assertCommercialAccess } from "@/services/billing/commercial-access.service";
import { assertCommercialCapability, assertDiagnosisAllowance, assertStartupAnalysisAllowance, canPerformCommercialCapability } from "@/services/billing/commercial-policy.service";
import { scanDueReassessments } from "@/services/owner-budget/due-reassessment.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CommercialGateHost } from "@/components/commercial/CommercialGateHost";

const WS = "11111111-1111-4111-8111-111111111111";
const OFF_VALUES: Array<string | undefined> = [undefined, "", "off", "OFF", "On", "true", "1", "yes", " on", "on "];
const original = process.env.BILLING_PAYWALL_ENFORCEMENT;
const setFlag = (v: string | undefined) => (v === undefined ? delete process.env.BILLING_PAYWALL_ENFORCEMENT : (process.env.BILLING_PAYWALL_ENFORCEMENT = v));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  setFlag(original);
});

describe.each(OFF_VALUES)("enforcement flag = %j (anything but exactly 'on')", (flag) => {
  beforeEach(() => setFlag(flag));

  it("every capability is allowed with zero database access", async () => {
    for (const cap of ALL_COMMERCIAL_CAPABILITIES) {
      expect(await canPerformCommercialCapability(WS, cap)).toEqual({ allowed: true, reason: "not_enforced" });
      await expect(assertCommercialCapability(WS, cap)).resolves.toBeUndefined();
    }
    await expect(assertCommercialAccess(WS)).resolves.toBeUndefined();
    await expect(assertDiagnosisAllowance({ $queryRaw: m.queryRaw, $executeRaw: m.executeRaw, subscription: { findFirst: m.subscriptionFindFirst } } as never, WS)).resolves.toBeUndefined();
    await expect(assertStartupAnalysisAllowance({ $queryRaw: m.queryRaw, $executeRaw: m.executeRaw, subscription: { findFirst: m.subscriptionFindFirst } } as never, WS, WS)).resolves.toBeUndefined();
    expect(m.subscriptionFindFirst).not.toHaveBeenCalled();
    expect(m.queryRaw).not.toHaveBeenCalled();
    expect(m.executeRaw).not.toHaveBeenCalled();
  });

  it("scheduled reassessment is identical to pre-paywall behaviour: every overdue business is reassessed, no entitlement lookup", async () => {
    m.budgetFindMany.mockResolvedValue([
      { workspaceId: "w1", businessId: "b1" },
      { workspaceId: "w1", businessId: "b1" },
      { workspaceId: "w2", businessId: "b2" },
    ]);
    m.reassessBudget.mockResolvedValue({});
    const r = await scanDueReassessments(new Date("2026-10-24T00:00:00Z"));
    expect(r).toMatchObject({ scanned: 2, reassessed: 2, skipped: 0 });
    expect(m.reassessBudget).toHaveBeenCalledTimes(2);
    expect(m.reassessBudget).toHaveBeenCalledWith("b1", "w1", expect.objectContaining({ kind: "scheduled_review_due" }));
    expect(m.subscriptionFindFirst).not.toHaveBeenCalled();
  });
});

describe("contrast: the same scan with enforcement ON skips workspaces that are not entitled", () => {
  it("proves the OFF equivalence above is a real property of the switch, not of the fixture", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    m.budgetFindMany.mockResolvedValue([{ workspaceId: "w1", businessId: "b1" }]);
    m.subscriptionFindFirst.mockResolvedValue(null);
    const r = await scanDueReassessments(new Date("2026-10-24T00:00:00Z"));
    expect(r).toMatchObject({ scanned: 1, reassessed: 0, skipped: 1 });
    expect(m.reassessBudget).not.toHaveBeenCalled();
  });
});

describe("no upgrade banner merely because the user is unpaid", () => {
  it("the host renders nothing and makes no request on mount (it reacts only to a server 402)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<CommercialGateHost />);
    expect(container.textContent).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("non-402 failures (including 401/403/404/429/500) never raise the banner", () => {
    const { container } = render(<CommercialGateHost />);
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      const err = Object.assign(new Error("x"), { httpStatus: status });
      act(() => void classifyOperatorError(err, { context: "mutation" }));
    }
    expect(container.textContent).toBe("");
  });

  it("only a server 402 raises it", () => {
    const { container } = render(<CommercialGateHost />);
    act(() => void classifyOperatorError(Object.assign(new Error("x"), { httpStatus: 402 }), { context: "mutation" }));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
