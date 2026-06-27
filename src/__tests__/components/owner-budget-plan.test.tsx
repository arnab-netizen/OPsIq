/**
 * Owner UI — Budget & Profit Plan component test (owner-visibility proof).
 *
 * Renders the real page with mocked budget routes and asserts the owner can SEE
 * the governed surface: mode, confidence, next best action, forecast, fund
 * allocation, spend governance, signals, advisory-action labelling, the override
 * control, and the honest PARTIAL module-status banner. This is component-level
 * proof (jsdom) — not a live browser run (documented limitation).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import OwnerBudgetPlanPage from "@/app/(authenticated)/owner/budget/page";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PLAN = {
  mode: "EMERGENCY",
  confidence: "OPERATIONAL",
  topConstraint: "Imminent cash/obligation failure",
  nextBestAction: "Freeze discretionary spend and stage critical payments by due date this week.",
  decisionType: "BLOCK",
  whatChanged: { field: "obligations", newValue: "payroll_added" },
  affectedBudgetLines: ["Referral campaign"],
  affectedFunctions: ["growth_roi"],
  fundAllocationChanges: ["Referral campaign: DEFER — Deferred: EMERGENCY mode protects survival."],
  spendRestrictions: ["Discretionary and experimental spend paused until cash/controls stabilize."],
  accountableRoles: ["owner", "manager"],
  generatedActions: [
    { title: "Protect cash: freeze discretionary spend", accountableRole: "owner", decisionType: "BLOCK", requiredProof: "Updated cash position", reviewInDays: 2, expectedFinancialImpact: "Preserve reserve", killRule: "Reassess on new obligation." },
  ],
  requiredProof: ["Updated cash position"],
  cashImpact: "Free cash after obligations: -100000; reserve required: 50000.",
  profitImpact: "Net margin 16.7%.",
  runwayImpact: "Runway not at risk or not computable.",
  reviewInDays: 2,
  killRule: "Reassess on any material change.",
  signals: [{ type: "statutory_reserve_breach", severity: "CRITICAL", message: "Cash below required reserve." }],
  whatNotToDo: ["Approve growth spend that depends on a delayed receipt."],
  highRiskBlocked: false,
};

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, json: async () => body } as unknown as Response);
    if (url.includes("/api/owner/recovery/businesses")) return json([{ id: "b1", name: "Acme", currency: "INR" }]);
    if (url.includes("/api/owner/budget/guidance")) return json({ hasPlan: true, mode: "EMERGENCY", confidence: "OPERATIONAL", version: 2, reassessedAt: "2026-06-27T00:00:00Z", decisionType: "BLOCK", nextBestAction: PLAN.nextBestAction, topRisk: PLAN.topConstraint, signals: PLAN.signals, generatedActions: PLAN.generatedActions });
    if (url.includes("/api/owner/budget/snapshots")) return json([{ id: "s2", isCurrent: true, version: 2, plan: PLAN }]);
    if (url.includes("/api/owner/budget/forecast")) return json({ hasData: true, startingCash: 40000, reserveRequired: 50000, sevenDayCash: 35000, thirtyDayCash: 10000, ninetyDayCash: -50000, nextCriticalDueInDays: 5, scenarios: [{ name: "base", weeklyEndingCash: [], endingCash: -50000, minCash: -60000, reserveBreachWeek: 3 }] });
    if (url.includes("/api/owner/budget/authority")) return json([{ id: "a1", subjectRole: "manager", scopeCategory: "growth_roi", status: "OWNER_APPROVAL_REQUIRED", reason: "Repeated unverified spend" }]);
    return json({});
  });
}

describe("Owner Budget & Profit Plan page", () => {
  it("renders the governed budget surface the owner can act on", async () => {
    mockFetch();
    const { container } = render(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Next best action"));
    const text = container.textContent ?? "";
    expect(text).toContain("Budget & Profit Plan");
    expect(text).toContain("EMERGENCY");               // mode
    expect(text).toContain("OPERATIONAL");             // confidence
    expect(text).toContain("Freeze discretionary spend"); // next best action
    expect(text).toContain("Cash forecast");           // forecast section
    expect(text).toContain("reserve breach wk 3");     // scenario breach
    expect(text).toContain("Fund allocation");
    expect(text).toContain("Spend governance");
    expect(text).toContain("statutory_reserve_breach"); // signal surfaced
    expect(text).toContain("OWNER_APPROVAL_REQUIRED");  // authority restriction
  });

  it("labels generated actions as advisory and shows the honest PARTIAL module banner", async () => {
    mockFetch();
    const { container } = render(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Generated actions"));
    const text = container.textContent ?? "";
    expect(text).toContain("DYNAMIC_BUDGET_MODULE_INTEGRATED_PARTIAL");
    expect(text).toMatch(/Advisory recommendations — these are NOT yet persisted execution tasks/i);
    expect(text).toContain("Override this plan"); // owner override control present
  });

  it("does not present unverified confidence as verified", async () => {
    mockFetch();
    const { container } = render(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("confidence:"));
    const text = container.textContent ?? "";
    // OPERATIONAL confidence must trigger the below-VERIFIED warning, not a verified claim.
    expect(text).toMatch(/Irreversible spend .* is blocked below VERIFIED/i);
  });
});
