/**
 * Owner Strategy page — page-level owner-safe error rendering for all 6 catch paths
 * (load, createBusiness, addSnapshot, runDiagnosis, updateAction, verifyAction).
 *
 * ROOT_CAUSE this closes: this page's local `api()` helper threw a plain `Error`, discarding the
 * real HTTP status code, so `setError(e instanceof Error ? e.message : "...")` rendered whatever
 * text the server happened to send. A 500 whose body text contained "invalid"/"validation" could
 * render as a user-input problem, and a genuine `NotFoundError("OwnerStrategyAction", <uuid>)` --
 * a real, reachable shape from action.service.ts/verification.service.ts -- reached the owner as
 * raw internal-model-name-plus-UUID text. Fix: `api()` now throws `httpResponseErrorFromBody`
 * (preserves status + body), and every catch site routes through `presentDomainError` (see
 * src/lib/owner-domain-error-presentation.ts and its direct unit tests for the full contract).
 *
 * This file drives the real page component end-to-end (fetch mocked at the network boundary).
 * Fixtures are labeled REALISTIC (a shape these routes can actually produce today) or
 * SYNTHETIC/DEFENSIVE (a shape they cannot currently produce, exercised only to prove the
 * governance rule holds regardless of body content).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerStrategyPage from "@/app/(authenticated)/owner/strategy/page";
import { LEAKY_UUID, jsonResponse, assertNoLeak } from "../owner-domain-error-presentation-fixtures";

const BIZ_A = { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true };

function businessIdOf(url: string): string | null {
  return new URL(url, "http://test.local").searchParams.get("businessId");
}

function getErrorBanner(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".text-destructive");
}

async function waitForErrorBanner(container: HTMLElement): Promise<HTMLElement> {
  return waitFor(() => {
    const el = getErrorBanner(container);
    if (!el) throw new Error("error banner not rendered yet");
    return el;
  });
}

let businesses: Array<{ id: string; name: string; currency: string; isActive: boolean }> = [BIZ_A];
let dashboardFixture: Record<string, unknown> | null = null;
type FailureMode = { kind: "http"; status: number; body: unknown } | { kind: "reject"; error: unknown };
let dashboardFailure: FailureMode | null = null;
let createBusinessFailure: FailureMode | null = null;
let addSnapshotFailure: FailureMode | null = null;
let diagnosisFailure: FailureMode | null = null;
let actionPatchFailure: FailureMode | null = null;
let actionVerifyFailure: FailureMode | null = null;

function defaultDashboard(businessId: string | null) {
  return { businesses, selectedBusinessId: businessId, hasData: false, latestSnapshot: null };
}

function actionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    title: "Negotiate better lease terms",
    description: "Reduce fixed costs before opening the second branch.",
    ownerRole: "owner",
    priorityScore: 80,
    expectedTimeframeDays: 14,
    status: "in_progress",
    verificationMetric: "monthlyRent",
    verificationMethod: "compare_lease",
    verifications: [],
    ...overrides,
  };
}

function populatedFixture(label: string, actionOverrides: Record<string, unknown> = {}) {
  return {
    businesses,
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: `snap-${label}` },
    scenarios: [
      { id: `snap-${label}`, optionName: `Option ${label}`, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", lastEvaluationSequence: 1, isCurrentDecision: true },
    ],
    missingCriticalData: [],
    domainScore: null,
    recommendedNextAction: null,
    latestCycle: {
      id: `cycle-${label}`,
      sequenceNumber: 1,
      strategyState: "GO",
      healthScore: 80,
      riskScore: 10,
      opportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions: [actionFixture(actionOverrides)],
    },
    cycleHistory: [],
  };
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/owner/businesses") return jsonResponse({ businesses });

      if (url.startsWith("/api/owner/strategy/dashboard")) {
        if (dashboardFailure) {
          if (dashboardFailure.kind === "reject") throw dashboardFailure.error;
          return jsonResponse(dashboardFailure.body, false, dashboardFailure.status);
        }
        return jsonResponse(dashboardFixture ?? defaultDashboard(businessIdOf(url)));
      }

      if (url === "/api/owner/recovery/businesses" && method === "POST") {
        if (createBusinessFailure) {
          if (createBusinessFailure.kind === "reject") throw createBusinessFailure.error;
          return jsonResponse(createBusinessFailure.body, false, createBusinessFailure.status);
        }
        return jsonResponse({ id: "biz-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/strategy\/businesses\/[^/]+\/snapshots$/) && method === "POST") {
        if (addSnapshotFailure) {
          if (addSnapshotFailure.kind === "reject") throw addSnapshotFailure.error;
          return jsonResponse(addSnapshotFailure.body, false, addSnapshotFailure.status);
        }
        return jsonResponse({ id: "snap-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/strategy\/businesses\/[^/]+\/diagnoses$/) && method === "POST") {
        if (diagnosisFailure) {
          if (diagnosisFailure.kind === "reject") throw diagnosisFailure.error;
          return jsonResponse(diagnosisFailure.body, false, diagnosisFailure.status);
        }
        return jsonResponse({ id: "diag-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/strategy\/actions\/[^/]+\/verify$/) && method === "POST") {
        if (actionVerifyFailure) {
          if (actionVerifyFailure.kind === "reject") throw actionVerifyFailure.error;
          return jsonResponse(actionVerifyFailure.body, false, actionVerifyFailure.status);
        }
        return jsonResponse({ id: "verify-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/strategy\/actions\/[^/]+$/) && method === "PATCH") {
        if (actionPatchFailure) {
          if (actionPatchFailure.kind === "reject") throw actionPatchFailure.error;
          return jsonResponse(actionPatchFailure.body, false, actionPatchFailure.status);
        }
        return jsonResponse({ id: "action-1" }, true, 200);
      }

      return jsonResponse({});
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerStrategyPage />
    </ActiveBusinessProvider>
  );
}

function seedActiveBusiness(id: string) {
  window.sessionStorage.setItem("opsiq.activeBusinessId", id);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  businesses = [BIZ_A];
  dashboardFixture = null;
  dashboardFailure = null;
  createBusinessFailure = null;
  addSnapshotFailure = null;
  diagnosisFailure = null;
  actionPatchFailure = null;
  actionVerifyFailure = null;
  vi.spyOn(window, "prompt").mockReturnValue("");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Strategy page — owner-safe error rendering (24-path coverage: load)", () => {
  it("happy path: a successful load renders no error banner", async () => {
    seedActiveBusiness(BIZ_A.id);
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No scenario yet/);
    expect(getErrorBanner(container)).toBeNull();
  });

  it("REALISTIC: load() 404 NotFoundError('OwnerStrategyAction', uuid) never leaks the model name or UUID", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { kind: "http", status: 404, body: { error: `OwnerStrategyAction not found: ${LEAKY_UUID}` } };
    installFetchMock();
    const { container } = renderPage();

    const banner = await waitForErrorBanner(container);
    assertNoLeak(banner.textContent ?? "", [/OwnerStrategyAction/i]);
    expect(banner.textContent).toMatch(/couldn.t be found/i);
  });

  it("SYNTHETIC/DEFENSIVE: load() 500 with Prisma 'Invalid invocation' body text never becomes a validation message", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = {
      kind: "http",
      status: 500,
      body: { error: "Invalid `db.ownerStrategyAction.update()` invocation in /app/src/services/owner-strategy/action.service.ts:42:10" },
    };
    installFetchMock();
    const { container } = renderPage();

    const banner = await waitForErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).not.toMatch(/check your entries|didn.t look right/i);
    expect(banner.textContent).toMatch(/couldn.t load/i);
  });

  it("REALISTIC: load() 401 renders neutral sign-in guidance", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { kind: "http", status: 401, body: { error: "Unauthorized" } };
    installFetchMock();
    const { container } = renderPage();
    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toBe("Please sign in to continue.");
  });

  it("REALISTIC: load() network rejection renders connectivity guidance, no false 'checking connection' claim", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { kind: "reject", error: new TypeError("Failed to fetch") };
    installFetchMock();
    const { container } = renderPage();
    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toMatch(/couldn.t connect/i);
    expect(banner.textContent).not.toMatch(/checking|automatically/i);
  });

  it("retry availability: after a failed load, switching business (retriggering load) and succeeding clears the error", async () => {
    const BIZ_B = { id: "biz-b", name: "Beta Landscaping", currency: "USD", isActive: true };
    businesses = [BIZ_A, BIZ_B];
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { kind: "http", status: 500, body: { error: "boom" } };
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(getErrorBanner(container)).not.toBeNull());

    dashboardFailure = null;
    const select = screen.getByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: BIZ_B.id } });

    await screen.findByText(/No scenario yet/);
    expect(getErrorBanner(container)).toBeNull();
  });
});

describe("Owner Strategy page — owner-safe error rendering (createBusiness / save)", () => {
  it("failed-save value preservation: a failed create-business keeps the form open with entered values intact", async () => {
    businesses = [];
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No businesses yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "My New Bakery" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "EUR" } });

    createBusinessFailure = { kind: "http", status: 400, body: { error: "Validation failed" } };
    fireEvent.click(screen.getByRole("button", { name: "Create business" }));

    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toMatch(/check your entries/i);
    // Form still open, values preserved -- no reset/unmount on failure.
    expect(screen.getByLabelText("Business name")).toHaveValue("My New Bakery");
    expect(screen.getByLabelText("Currency")).toHaveValue("EUR");
    // Retry availability: the submit button is re-enabled (busy cleared).
    expect(screen.getByRole("button", { name: "Create business" })).not.toBeDisabled();
  });

  it("successful recovery: retrying the same form after a failure succeeds and closes the form", async () => {
    businesses = [];
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No businesses yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "My New Bakery" } });

    createBusinessFailure = { kind: "http", status: 500, body: { error: "boom" } };
    fireEvent.click(screen.getByRole("button", { name: "Create business" }));
    await waitFor(() => expect(getErrorBanner(container)).not.toBeNull());

    createBusinessFailure = null;
    businesses = [BIZ_A];
    fireEvent.click(screen.getByRole("button", { name: "Create business" }));

    await waitFor(() => expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument());
  });
});

describe("Owner Strategy page — owner-safe error rendering (addSnapshot / save)", () => {
  it("failed-save value preservation: a failed add-scenario keeps the form open with entered values intact", async () => {
    seedActiveBusiness(BIZ_A.id);
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No scenario yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ Add scenario" }));
    fireEvent.change(screen.getByLabelText(/Option name/), { target: { value: "Open 2nd branch" } });
    fireEvent.change(screen.getByLabelText("Assessed from"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Assessed to"), { target: { value: "2026-03-31" } });

    addSnapshotFailure = { kind: "http", status: 404, body: { error: `OwnerBusiness not found: ${LEAKY_UUID}` } };
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));

    const banner = await waitForErrorBanner(container);
    assertNoLeak(banner.textContent ?? "", [/OwnerBusiness/i]);
    expect(screen.getByLabelText(/Option name/)).toHaveValue("Open 2nd branch");
    expect(screen.getByRole("button", { name: "Save scenario" })).not.toBeDisabled();
  });
});

describe("Owner Strategy page — owner-safe error rendering (runDiagnosis / action)", () => {
  it("unchanged state + retry availability: a failed evaluate-scenario leaves prior data intact and re-enables the button", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    const { container } = renderPage();
    const evaluate = () => screen.getByRole("button", { name: /^Evaluate this scenario: Option A/ });
    await waitFor(() => expect(evaluate()).not.toBeDisabled());

    diagnosisFailure = { kind: "http", status: 403, body: { error: "Insufficient permissions" } };
    fireEvent.click(evaluate());

    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toBe("You don't have permission to do this.");
    expect(evaluate()).not.toBeDisabled();
    // Prior cycle content is unaffected by the failed mutation.
    expect(screen.getByText(/Strategy actions/)).toBeInTheDocument();
  });
});

describe("Owner Strategy page — owner-safe error rendering (updateAction / action)", () => {
  it("unchanged action state after failure + retry availability + successful recovery", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    renderPage();
    await screen.findByRole("button", { name: "Complete" });

    actionPatchFailure = { kind: "http", status: 400, body: { error: "Invalid strategy action transition: in_progress → completed" } };
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    const banner = await screen.findByText(/can.t move to the requested status/i);
    expect(banner).toBeInTheDocument();
    // Action still shows its original status/buttons -- the failed PATCH never applied.
    expect(screen.getByRole("button", { name: "Complete" })).not.toBeDisabled();
    expect(screen.getByText("In progress")).toBeInTheDocument();

    // Successful recovery: retry with no failure configured succeeds.
    actionPatchFailure = null;
    dashboardFixture = populatedFixture("A", { status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText("Completed")).toBeInTheDocument());
  });
});

describe("Owner Strategy page — owner-safe error rendering (verifyAction / action)", () => {
  it("unchanged action state after failure + retry availability", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    renderPage();
    await screen.findByRole("button", { name: "Verify outcome" });

    (window.prompt as ReturnType<typeof vi.fn>).mockReturnValueOnce("100").mockReturnValueOnce("120").mockReturnValueOnce("up");
    actionVerifyFailure = { kind: "http", status: 404, body: { error: `OwnerStrategyAction not found: ${LEAKY_UUID}` } };
    fireEvent.click(screen.getByRole("button", { name: "Verify outcome" }));

    const banner = await screen.findByText(/couldn.t be found/i);
    assertNoLeak(banner.textContent ?? "", [/OwnerStrategyAction/i]);
    expect(screen.getByRole("button", { name: "Verify outcome" })).not.toBeDisabled();
    // No verification badge was applied from the failed call.
    expect(screen.queryByText(/Verified/i)).not.toBeInTheDocument();
  });
});
