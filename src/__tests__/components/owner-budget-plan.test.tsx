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
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, json: async () => body } as unknown as Response);
    if (url.includes("/api/owner/recovery/businesses")) return json([{ id: "b1", name: "Acme", currency: "INR" }]);
    if (url.includes("/api/owner/budget/guidance")) return json({ hasPlan: true, mode: "EMERGENCY", confidence: "OPERATIONAL", version: 2, reassessedAt: "2026-06-27T00:00:00Z", decisionType: "BLOCK", nextBestAction: PLAN.nextBestAction, topRisk: PLAN.topConstraint, signals: PLAN.signals, generatedActions: PLAN.generatedActions });
    if (url.includes("/api/owner/budget/snapshots")) return json([{ id: "s2", isCurrent: true, version: 2, plan: PLAN }]);
    if (url.includes("/api/owner/budget/forecast")) return json({ hasData: true, startingCash: 40000, reserveRequired: 50000, sevenDayCash: 35000, thirtyDayCash: 10000, ninetyDayCash: -50000, nextCriticalDueInDays: 5, scenarios: [{ name: "base", weeklyEndingCash: [], endingCash: -50000, minCash: -60000, reserveBreachWeek: 3 }] });
    if (url.includes("/api/owner/budget/authority")) return json([{ id: "a1", subjectRole: "manager", scopeCategory: "growth_roi", status: "OWNER_APPROVAL_REQUIRED", reason: "Repeated unverified spend" }]);
    if (url.includes("/api/owner/budget/actions")) return json([{ id: "t1", workspaceId: "w1", businessId: "b1", sourceKey: "BLOCK|protect cash: freeze discretionary spend", title: "Protect cash: freeze discretionary spend", decisionType: "BLOCK", accountableRole: "owner", status: "proposed", dueAt: "2026-06-29T00:00:00Z", reviewInDays: 2, requiredProof: "Updated cash position", expectedFinancialImpact: "Preserve reserve", verificationMethod: "Owner verifies against required proof: Updated cash position", escalationPath: "Escalate to owner if not actioned by the 2-day review date." }]);
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
    // Generated actions are honestly labelled as the advisory plan snapshot.
    expect(text).toMatch(/advisory plan snapshot/i);
    expect(text).toMatch(/advisory recommendations from the current plan snapshot/i);
    expect(text).toContain("Override this plan"); // owner override control present
  });

  it("shows persisted execution tasks as a distinct, governed section (not merely advisory)", async () => {
    mockFetch();
    const { container } = render(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Execution tasks"));
    const text = container.textContent ?? "";
    // The persisted execution-task section is present and labelled distinctly from advisory.
    expect(text).toMatch(/Execution tasks/);
    expect(text).toMatch(/persisted/i);
    // The persisted task and its governed fields are surfaced honestly.
    expect(text).toContain("Protect cash: freeze discretionary spend");
    expect(text).toMatch(/proposed/i); // shared owner action lifecycle status
    expect(text).toMatch(/Verification:/);
    expect(text).toMatch(/Escalation:/);
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
