/**
 * Owner Marketing page — page-level owner-safe error rendering for all 6 catch paths
 * (load, createBusiness, addSnapshot, runDiagnosis, updateAction, verifyAction).
 *
 * See strategy-page-owner-safe-errors.test.tsx for the full ROOT_CAUSE account (identical defect
 * class, fixed identically here).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerMarketingPage from "@/app/(authenticated)/owner/marketing/page";
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
    title: "Run a referral campaign",
    description: "Boost repeat-customer referrals.",
    ownerRole: "owner",
    priorityScore: 70,
    expectedTimeframeDays: 21,
    status: "in_progress",
    verificationMetric: "referrals",
    verificationMethod: "compare_referrals",
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
    missingCriticalData: [],
    domainScore: null,
    recommendedNextAction: null,
    latestCycle: {
      id: `cycle-${label}`,
      sequenceNumber: 1,
      marketingState: "GO",
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

      if (url.startsWith("/api/owner/marketing/dashboard")) {
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

      if (url.match(/\/api\/owner\/marketing\/businesses\/[^/]+\/snapshots$/) && method === "POST") {
        if (addSnapshotFailure) {
          if (addSnapshotFailure.kind === "reject") throw addSnapshotFailure.error;
          return jsonResponse(addSnapshotFailure.body, false, addSnapshotFailure.status);
        }
        return jsonResponse({ id: "snap-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/marketing\/businesses\/[^/]+\/diagnoses$/) && method === "POST") {
        if (diagnosisFailure) {
          if (diagnosisFailure.kind === "reject") throw diagnosisFailure.error;
          return jsonResponse(diagnosisFailure.body, false, diagnosisFailure.status);
        }
        return jsonResponse({ id: "diag-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/marketing\/actions\/[^/]+\/verify$/) && method === "POST") {
        if (actionVerifyFailure) {
          if (actionVerifyFailure.kind === "reject") throw actionVerifyFailure.error;
          return jsonResponse(actionVerifyFailure.body, false, actionVerifyFailure.status);
        }
        return jsonResponse({ id: "verify-new" }, true, 201);
      }

      if (url.match(/\/api\/owner\/marketing\/actions\/[^/]+$/) && method === "PATCH") {
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
      <OwnerMarketingPage />
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

describe("Owner Marketing page — owner-safe error rendering (load)", () => {
  it("happy path: a successful load renders no error banner", async () => {
    seedActiveBusiness(BIZ_A.id);
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No marketing snapshot yet/);
    expect(getErrorBanner(container)).toBeNull();
  });

  it("REALISTIC: load() 404 NotFoundError('OwnerMarketingAction', uuid) never leaks the model name or UUID", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { kind: "http", status: 404, body: { error: `OwnerMarketingAction not found: ${LEAKY_UUID}` } };
    installFetchMock();
    const { container } = renderPage();
    const banner = await waitForErrorBanner(container);
    assertNoLeak(banner.textContent ?? "", [/OwnerMarketingAction/i]);
    expect(banner.textContent).toMatch(/couldn.t be found/i);
  });

  it("SYNTHETIC/DEFENSIVE: load() 500 with Prisma 'Invalid invocation' body text never becomes a validation message", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = {
      kind: "http",
      status: 500,
      body: { error: "Invalid `db.ownerMarketingAction.update()` invocation in /app/src/services/owner-marketing/action.service.ts:40:6" },
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
});

describe("Owner Marketing page — owner-safe error rendering (createBusiness / save)", () => {
  it("failed-save value preservation: a failed create-business keeps the form open with entered values intact", async () => {
    businesses = [];
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No businesses yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Marketing Bakery" } });

    createBusinessFailure = { kind: "http", status: 403, body: { error: "Workspace required" } };
    fireEvent.click(screen.getByRole("button", { name: "Create business" }));

    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toBe("This isn't available for your current workspace.");
    expect(screen.getByLabelText("Business name")).toHaveValue("Marketing Bakery");
    expect(screen.getByRole("button", { name: "Create business" })).not.toBeDisabled();
  });
});

describe("Owner Marketing page — owner-safe error rendering (addSnapshot / save)", () => {
  it("failed-save value preservation: a failed add-marketing-snapshot keeps the form open with entered values intact", async () => {
    seedActiveBusiness(BIZ_A.id);
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No marketing snapshot yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ Add marketing snapshot" }));
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.change(screen.getByLabelText("Marketing spend"), { target: { value: "2500" } });

    addSnapshotFailure = { kind: "http", status: 400, body: { error: "Validation failed" } };
    fireEvent.click(screen.getByRole("button", { name: "Save snapshot" }));

    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toMatch(/check your entries/i);
    expect(screen.getByLabelText("Marketing spend")).toHaveValue(2500);
    expect(screen.getByRole("button", { name: "Save snapshot" })).not.toBeDisabled();
  });
});

describe("Owner Marketing page — owner-safe error rendering (runDiagnosis / action)", () => {
  it("unchanged state + retry availability: a failed run-marketing-diagnosis leaves prior data intact and re-enables the button", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run marketing diagnosis" })).not.toBeDisabled());

    diagnosisFailure = { kind: "reject", error: new TypeError("Failed to fetch") };
    fireEvent.click(screen.getByRole("button", { name: "Run marketing diagnosis" }));

    const banner = await waitForErrorBanner(container);
    expect(banner.textContent).toMatch(/couldn.t connect/i);
    expect(screen.getByRole("button", { name: "Run marketing diagnosis" })).not.toBeDisabled();
    expect(screen.getByText(/Findings/)).toBeInTheDocument();
  });
});

describe("Owner Marketing page — owner-safe error rendering (updateAction / action)", () => {
  it("unchanged action state after failure + retry availability + successful recovery", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    renderPage();
    await screen.findByRole("button", { name: "Complete" });

    actionPatchFailure = { kind: "http", status: 400, body: { error: "Invalid marketing action status: bogus_status" } };
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    const banner = await screen.findByText(/status isn.t recognized/i);
    assertNoLeak(banner.textContent ?? "", [/bogus_status/i]);
    expect(screen.getByRole("button", { name: "Complete" })).not.toBeDisabled();
    expect(screen.getByText("In progress")).toBeInTheDocument();

    actionPatchFailure = null;
    dashboardFixture = populatedFixture("A", { status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText("Completed")).toBeInTheDocument());
  });
});

describe("Owner Marketing page — owner-safe error rendering (verifyAction / action)", () => {
  it("unchanged action state after failure + retry availability", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    installFetchMock();
    renderPage();
    await screen.findByRole("button", { name: "Verify outcome" });

    (window.prompt as ReturnType<typeof vi.fn>).mockReturnValueOnce("10").mockReturnValueOnce("15").mockReturnValueOnce("up");
    actionVerifyFailure = {
      kind: "http",
      status: 400,
      body: { error: "Cannot verify a marketing action without a before (baseline) value for the metric." },
    };
    fireEvent.click(screen.getByRole("button", { name: "Verify outcome" }));

    const banner = await screen.findByText(/doesn.t have a baseline value/i);
    assertNoLeak(banner.textContent ?? "");
    expect(screen.getByRole("button", { name: "Verify outcome" })).not.toBeDisabled();
    expect(screen.queryByText(/Verified/i)).not.toBeInTheDocument();
  });
});
