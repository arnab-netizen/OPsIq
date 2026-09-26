/**
 * Owner Goals page — jsdom integration test (business-scoped goals).
 *
 * Stubs fetch to serve the GET /api/owner/goals?businessId= overview. Asserts: explicit scope
 * labels, the selected business is sent explicitly, currency is the business's (not editable),
 * only Revenue / Net profit can be created, legacy workspace goals are labelled and assignable
 * only through an owner confirmation, and no NaN / guessed numbers reach the owner.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import GoalsPage from "@/app/(authenticated)/owner/goals/page";

const BIZ = { id: "b1000001-0000-4000-8000-000000000001", name: "Trinity Services", currency: "INR" };
const ctx = {
  businesses: [BIZ] as Array<typeof BIZ>,
  activeBusinessId: BIZ.id as string | null,
  activeBusiness: BIZ as typeof BIZ | null,
  needsBusinessRecovery: false,
  setActiveBusinessId: vi.fn(),
  refreshBusinesses: vi.fn(),
  loading: false,
};
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ctx }));

function trajectory(overrides: Record<string, unknown> = {}) {
  return {
    projectedMonthsToGoal: 7,
    currentTrajectoryDate: "2027-04-15T00:00:00.000Z",
    confidence: "MEDIUM",
    confidenceRationale: "trajectory is within normal confidence bounds",
    gapToClose: 280000,
    currentValue: 220000,
    percentComplete: 44,
    onTrack: true,
    ...overrides,
  };
}

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: "goal-uuid-1",
    businessId: BIZ.id,
    scope: "business",
    businessName: BIZ.name,
    businessActive: true,
    targetType: "REVENUE",
    targetAmount: 500000,
    targetCurrency: "INR",
    targetDate: "2027-06-30T00:00:00.000Z",
    baselineAmount: null,
    status: "ACTIVE",
    isOverdue: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function view(g: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    goal: g,
    metricBasis: g.targetType === "REVENUE" ? "revenue" : g.targetType === "PROFIT" ? "net_profit" : "not_measured",
    unavailableReason: null,
    dataWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-06-30T00:00:00.000Z", periods: 6 },
    excludedSnapshotCount: 0,
    excludedReason: null,
    trajectory: trajectory(),
    ...overrides,
  };
}

let overview: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
let postResponses: Record<string, { status: number; body: unknown }>;

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  ctx.businesses = [BIZ];
  ctx.activeBusinessId = BIZ.id;
  ctx.activeBusiness = BIZ;
  ctx.needsBusinessRecovery = false;
  overview = {
    business: { ...BIZ, isActive: true },
    goal: view(goal()),
    legacyGoal: null,
    legacyAttributable: true,
    history: [],
  };
  postResponses = {
    "/api/owner/goals": { status: 201, body: { goalId: "goal-uuid-2" } },
    "/api/owner/goals/assign": { status: 201, body: { goalId: "goal-uuid-3" } },
  };
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.startsWith("/api/owner/goals/trajectory")) return respond(200, { result: overview.goal });
    if (method === "GET" && url.startsWith("/api/owner/goals")) return respond(200, overview);
    if (method === "POST" && postResponses[url]) return respond(postResponses[url].status, postResponses[url].body);
    return respond(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function postCalls(path: string) {
  return fetchMock.mock.calls.filter(
    ([u, init]) => u === path && ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === "POST"
  );
}

describe("GoalsPage — business-scoped goals", () => {
  it("renders the heading and states that portfolio/group goals are not supported", async () => {
    const { findByText, getByTestId } = render(<GoalsPage />);
    await findByText("Goals");
    expect(getByTestId("goals-consolidation-notice").textContent).toMatch(/consolidated reporting/);
    expect(getByTestId("goals-consolidation-notice").textContent).toMatch(/currency conversion/);
  });

  it("requests the goal of the selected business explicitly (single business preselected)", async () => {
    const { findByTestId } = render(<GoalsPage />);
    await findByTestId("goal-detail");
    expect(fetchMock).toHaveBeenCalledWith(`/api/owner/goals?businessId=${BIZ.id}`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`/api/owner/goals/trajectory?businessId=${BIZ.id}`, expect.anything());
  });

  it("labels the goal's scope with the business name, and shows currency, target, date, current value and data window", async () => {
    const { findByTestId } = render(<GoalsPage />);
    const card = await findByTestId("goal-detail");
    expect(within(card).getByTestId("goal-scope").textContent).toBe("Business goal · Trinity Services");
    expect(card.textContent).toMatch(/Revenue target/);
    expect(card.textContent).toMatch(/Currency: INR/);
    expect(card.textContent).toMatch(/Target date:/);
    expect(card.textContent).toMatch(/Current value/);
    expect(within(card).getByTestId("goal-data-window").textContent).toMatch(/Based on 6 recorded periods/);
  });

  it("shows excluded other-currency results explicitly", async () => {
    overview.goal = view(goal(), {
      excludedSnapshotCount: 2,
      excludedReason: "2 recorded results are in a different currency than this INR goal and are not included (OpsIQ does not convert currencies).",
    });
    const { findByTestId } = render(<GoalsPage />);
    expect((await findByTestId("goal-excluded")).textContent).toMatch(/2 recorded results are in a different currency/);
  });

  it("shows 'No goal set for <business>' when the selected business has no goal", async () => {
    overview.goal = null;
    const { findByTestId } = render(<GoalsPage />);
    expect((await findByTestId("goal-empty")).textContent).toMatch(/No goal set for Trinity Services/);
  });

  it("creates a goal for the selected business: explicit businessId, Revenue/Net profit only, currency shown not editable", async () => {
    overview.goal = null;
    const { findByTestId, getByLabelText, getByRole, queryByLabelText, getByTestId } = render(<GoalsPage />);
    const empty = await findByTestId("goal-empty");
    fireEvent.click(within(empty).getByRole("button"));
    expect(getByTestId("goal-form-scope").textContent).toMatch(/Trinity Services · Currency: INR/);
    expect(queryByLabelText(/^Currency/)).toBeNull();
    const typeSelect = getByLabelText(/Goal type/) as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["Revenue", "Net profit"]));
    expect(options).not.toContain("Net worth");
    expect(options).not.toContain("Business multiple");
    fireEvent.change(typeSelect, { target: { value: "REVENUE" } });
    fireEvent.change(getByLabelText(/Target amount/), { target: { value: "750000" } });
    fireEvent.change(getByLabelText(/Target date/), { target: { value: "2030-01-01" } });
    fireEvent.click(getByRole("button", { name: "Create goal" }));
    await waitFor(() => expect(postCalls("/api/owner/goals")).toHaveLength(1));
    const body = JSON.parse((postCalls("/api/owner/goals")[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ businessId: BIZ.id, targetType: "REVENUE", targetAmount: 750000 });
    expect(body).not.toHaveProperty("targetCurrency");
  });

  it("rejects a past target date on the client before submitting", async () => {
    overview.goal = null;
    const { findByTestId, getByLabelText, getByRole, findByText } = render(<GoalsPage />);
    fireEvent.click(within(await findByTestId("goal-empty")).getByRole("button"));
    fireEvent.change(getByLabelText(/Goal type/), { target: { value: "PROFIT" } });
    fireEvent.change(getByLabelText(/Target amount/), { target: { value: "1000" } });
    fireEvent.change(getByLabelText(/Target date/), { target: { value: "2000-01-01" } });
    fireEvent.click(getByRole("button", { name: "Create goal" }));
    await findByText("Target date must be in the future.");
    expect(postCalls("/api/owner/goals")).toHaveLength(0);
  });

  it("shows the server's field error next to the field", async () => {
    overview.goal = null;
    postResponses["/api/owner/goals"] = {
      status: 400,
      body: { error: "Validation failed", code: "VALIDATION_ERROR", fieldErrors: [{ path: "targetAmount", message: "Enter a positive amount" }] },
    };
    const { findByTestId, getByLabelText, getByRole, findByText } = render(<GoalsPage />);
    fireEvent.click(within(await findByTestId("goal-empty")).getByRole("button"));
    fireEvent.change(getByLabelText(/Goal type/), { target: { value: "PROFIT" } });
    fireEvent.change(getByLabelText(/Target amount/), { target: { value: "1000" } });
    fireEvent.change(getByLabelText(/Target date/), { target: { value: "2030-01-01" } });
    fireEvent.click(getByRole("button", { name: "Create goal" }));
    await findByText("Enter a positive amount");
  });

  it("labels a legacy goal as a workspace goal and, in a multi-business workspace, says it is not shown on any Home", async () => {
    overview.legacyGoal = view(goal({ id: "legacy-1", businessId: null, scope: "workspace", businessName: null, businessActive: null }), {
      unavailableReason: "Recorded results come from 2 businesses. A workspace goal can't be tracked without consolidated reporting, which OpsIQ does not have yet — assign this goal to one business to track it.",
      dataWindow: null,
    });
    overview.legacyAttributable = false;
    const { findByTestId } = render(<GoalsPage />);
    const card = await findByTestId("legacy-goal");
    expect(within(card).getByTestId("goal-scope").textContent).toBe("Workspace goal");
    expect(within(card).getByTestId("legacy-goal-explainer").textContent).toMatch(/isn't shown on any business's Home/);
    expect(within(card).getByTestId("goal-unavailable").textContent).toMatch(/consolidated reporting/);
  });

  it("assigns a legacy goal only after the owner confirms, sending the explicit business and confirm: true", async () => {
    overview.legacyGoal = view(goal({ id: "legacy-1", businessId: null, scope: "workspace", businessName: null, businessActive: null }));
    overview.goal = null;
    const { findByTestId, getByRole, findByTestId: findAgain } = render(<GoalsPage />);
    const card = await findByTestId("legacy-goal");
    fireEvent.click(within(card).getByRole("button", { name: "Assign to Trinity Services" }));
    expect(postCalls("/api/owner/goals/assign")).toHaveLength(0);
    await findAgain("assign-confirm");
    fireEvent.click(getByRole("button", { name: "Assign goal" }));
    await waitFor(() => expect(postCalls("/api/owner/goals/assign")).toHaveLength(1));
    const body = JSON.parse((postCalls("/api/owner/goals/assign")[0][1] as RequestInit).body as string);
    expect(body).toEqual({ legacyGoalId: "legacy-1", businessId: BIZ.id, confirm: true });
  });

  it("states that a legacy net-worth goal is not measured instead of presenting revenue/profit as net worth", async () => {
    overview.legacyGoal = view(goal({ id: "legacy-nw", businessId: null, scope: "workspace", businessName: null, businessActive: null, targetType: "NET_WORTH" }), {
      metricBasis: "not_measured",
      unavailableReason: "OpsIQ does not measure net worth, so this goal is not projected. Recorded revenue or profit is not the same measure.",
      dataWindow: null,
    });
    const { findByTestId } = render(<GoalsPage />);
    const card = await findByTestId("legacy-goal");
    expect(card.textContent).toMatch(/Net worth target/);
    expect(card.textContent).toMatch(/Not measured by OpsIQ/);
    expect(within(card).getByTestId("goal-unavailable").textContent).toMatch(/does not measure net worth/);
    expect(card.textContent).not.toMatch(/Current value/);
  });

  it("labels a goal of an archived business as such", async () => {
    overview.goal = view(goal({ businessActive: false }));
    const { findByTestId } = render(<GoalsPage />);
    expect(within(await findByTestId("goal-detail")).getByTestId("goal-scope").textContent).toBe(
      "Business goal · Trinity Services (archived business)"
    );
  });

  it("renders unavailable numbers as 'Not enough data' — never NaN", async () => {
    overview.goal = view(goal(), {
      dataWindow: null,
      trajectory: trajectory({ currentValue: null, percentComplete: null, gapToClose: null, onTrack: null, currentTrajectoryDate: null, confidence: "LOW" }),
    });
    const { findByTestId } = render(<GoalsPage />);
    const card = await findByTestId("goal-detail");
    expect(card.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(card.textContent).toMatch(/Not enough data/);
  });

  it("shows humanized status and confidence, never raw enums", async () => {
    const { findByTestId } = render(<GoalsPage />);
    const card = await findByTestId("goal-detail");
    expect(card.textContent).toMatch(/Active/);
    expect(card.textContent).toMatch(/Medium/);
    expect(card.textContent).not.toMatch(/\bACTIVE\b|\bMEDIUM\b/);
  });

  it("does not load or show any goal while a business-recovery choice is pending", async () => {
    ctx.needsBusinessRecovery = true;
    ctx.activeBusinessId = null;
    ctx.activeBusiness = null;
    const { findByTestId, queryByTestId } = render(<GoalsPage />);
    await findByTestId("goals-choose-business");
    expect(queryByTestId("goal-detail")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
