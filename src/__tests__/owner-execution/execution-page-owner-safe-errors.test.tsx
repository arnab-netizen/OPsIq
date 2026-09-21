/**
 * Owner Execution & SOP — page-level owner-safe error rendering (UX-05B Candidate 2,
 * strengthened per docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md Section AD item 5).
 *
 * ROOT_CAUSE: all six catch paths in src/app/(authenticated)/owner/execution/page.tsx --
 * `load`, `createBusiness`, `addSnapshot`, `runDiagnosis`, `updateAction`, `verifyAction` --
 * used to render a caught exception's raw `e.message` directly into the shared page-top error
 * banner, with no governance, the same defect class Money/Sales/Operations already had fixed
 * (see finance-page-owner-safe-errors.test.tsx's own header comment). This suite is this page's
 * dedicated equivalent of those three files, mirroring their structure and assertions, and goes
 * further by exercising every one of this page's six catch paths individually rather than only
 * `load()` plus a single extra path.
 *
 * This test drives the real page component end-to-end (fetch mocked at the network boundary, and
 * `window.prompt` stubbed only where `verifyAction` genuinely needs it) so the assertions cover
 * the actual render output, not just that `classifyOperatorError` was called. `load()` fires
 * automatically on mount and is used as the representative path for all six error categories
 * (happy path, not-found/raw-identifier, validation, authorization, network, unexpected-internal);
 * one dedicated test per remaining catch path then proves the same governance holds for every
 * other mutation on this page, not just `load()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { hasOperatorUnsafeContent } from "@/lib/operator-error-governance";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };
const LEAKY_UUID = "123e4567-e89b-12d3-a456-426614174000";
const LEAKY_SNAPSHOT_ENTITY = "OwnerSopSnapshot";
const LEAKY_ACTION_ENTITY = "OwnerSopAction";
const LEAKY_BUSINESS_ENTITY = "OwnerBusiness";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerExecutionPage />
    </ActiveBusinessProvider>
  );
}

type FailureMode = { kind: "http"; status: number; body: unknown } | { kind: "reject"; error: unknown };

let dashboardFailure: FailureMode | null = null;
let businessCreateFailure: FailureMode | null = null;
let snapshotFailure: FailureMode | null = null;
let diagnosisFailure: FailureMode | null = null;
let actionUpdateFailure: FailureMode | null = null;
let verifyFailure: FailureMode | null = null;
/** Overrides the default no-business dashboard payload for a given test. */
let dashboardFixture: Record<string, unknown> | null = null;

function dashboardEmpty() {
  return { businesses: [], selectedBusinessId: null, hasData: false, latestSnapshot: null, missingCriticalData: [] };
}

function dashboardNoSnapshot() {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: false,
    latestSnapshot: null,
    missingCriticalData: [],
  };
}

function dashboardWithSnapshotOnly() {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: false,
    latestSnapshot: { id: "snap-1" },
    missingCriticalData: [],
  };
}

function dashboardWithFullCycle(actionStatus: string) {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: "snap-1" },
    missingCriticalData: [],
    domainScore: {
      domain: "sop",
      healthScore: 70,
      riskScore: 20,
      opportunityScore: 30,
      dataConfidenceScore: 90,
      executionState: "ON_TRACK",
    },
    recommendedNextAction: null,
    latestCycle: {
      id: "cycle-1",
      sequenceNumber: 1,
      executionState: "ON_TRACK",
      healthScore: 70,
      riskScore: 20,
      opportunityScore: 30,
      dataConfidenceScore: 90,
      findings: [],
      actions: [
        {
          id: "action-1",
          title: "Follow up with overdue accounts",
          description: "Contact the three overdue accounts.",
          ownerRole: "owner",
          priorityScore: 80,
          expectedTimeframeDays: 3,
          verificationMetric: "actionsOverdue",
          verificationMethod: "recheck",
          status: actionStatus,
          verifications: [],
        },
      ],
    },
    cycleHistory: [],
  };
}

function httpFailureResponse(mode: FailureMode & { kind: "http" }): Response {
  return { ok: false, status: mode.status, json: async () => mode.body } as Response;
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: dashboardFixture?.businesses ?? [BIZ_A] }) } as Response;
      }

      if (url.includes("/api/owner/sop/dashboard")) {
        if (dashboardFailure) {
          if (dashboardFailure.kind === "reject") throw dashboardFailure.error;
          return httpFailureResponse(dashboardFailure);
        }
        return { ok: true, status: 200, json: async () => (dashboardFixture ?? dashboardNoSnapshot()) } as Response;
      }

      if (url.includes("/api/owner/recovery/businesses") && method === "POST") {
        if (businessCreateFailure) {
          if (businessCreateFailure.kind === "reject") throw businessCreateFailure.error;
          return httpFailureResponse(businessCreateFailure);
        }
        return { ok: true, status: 201, json: async () => ({ id: "biz-new" }) } as Response;
      }

      if (url.match(/\/api\/owner\/sop\/businesses\/[^/]+\/snapshots$/) && method === "POST") {
        if (snapshotFailure) {
          if (snapshotFailure.kind === "reject") throw snapshotFailure.error;
          return httpFailureResponse(snapshotFailure);
        }
        return { ok: true, status: 201, json: async () => ({ id: "snap-new" }) } as Response;
      }

      if (url.match(/\/api\/owner\/sop\/businesses\/[^/]+\/diagnoses$/) && method === "POST") {
        if (diagnosisFailure) {
          if (diagnosisFailure.kind === "reject") throw diagnosisFailure.error;
          return httpFailureResponse(diagnosisFailure);
        }
        return { ok: true, status: 201, json: async () => ({ id: "diag-1" }) } as Response;
      }

      if (url.match(/\/api\/owner\/sop\/actions\/[^/]+\/verify$/) && method === "POST") {
        if (verifyFailure) {
          if (verifyFailure.kind === "reject") throw verifyFailure.error;
          return httpFailureResponse(verifyFailure);
        }
        return { ok: true, status: 200, json: async () => ({ id: "verify-1" }) } as Response;
      }

      if (url.match(/\/api\/owner\/sop\/actions\/[^/]+$/) && method === "PATCH") {
        if (actionUpdateFailure) {
          if (actionUpdateFailure.kind === "reject") throw actionUpdateFailure.error;
          return httpFailureResponse(actionUpdateFailure);
        }
        return { ok: true, status: 200, json: async () => ({ id: "action-1" }) } as Response;
      }

      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

/** Every string that must never appear anywhere in the rendered error banner. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // any UUID
  new RegExp(LEAKY_SNAPSHOT_ENTITY, "i"),
  new RegExp(LEAKY_ACTION_ENTITY, "i"),
  new RegExp(LEAKY_BUSINESS_ENTITY, "i"),
  /not found:/i,
  /prisma/i,
  /p2007/i,
  /var\/task/i,
  /stack trace/i,
  /TypeError/i,
  /Cannot read properties/i,
];

function assertNoLeak(text: string) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
  expect(hasOperatorUnsafeContent(text)).toBe(false);
}

/** This page's error banner has no data-testid/role -- locate it structurally, matching the
 *  Sales/Operations precedent (Money's page is the only one with a data-testid). */
function getErrorBanner(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".text-destructive");
  if (!el) throw new Error("Expected an error banner (.text-destructive) to be rendered");
  return el as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  dashboardFailure = null;
  businessCreateFailure = null;
  snapshotFailure = null;
  diagnosisFailure = null;
  actionUpdateFailure = null;
  verifyFailure = null;
  dashboardFixture = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Owner Execution page — governed, owner-safe error rendering (load, all categories)", () => {
  it("happy path: a successful load renders no error banner at all", async () => {
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("+ New business")).toBeInTheDocument());
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("NotFoundError: a 404 carrying a raw '<Entity> not found: <uuid>' message never reaches the owner verbatim", async () => {
    dashboardFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_SNAPSHOT_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("validation error: the message stays specific/actionable, not generic to the point of uselessness", async () => {
    dashboardFailure = {
      kind: "http",
      status: 400,
      body: { error: { message: "Invalid business type supplied" } },
    };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).toMatch(/check your entries/i);
  });

  it("permission/authorization error: rendered as a calm access-denied message, not the raw server text", async () => {
    dashboardFailure = {
      kind: "http",
      status: 403,
      body: { error: { message: "Unauthorized: missing permission for workspace member" } },
    };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).toMatch(/don.t have permission/i);
  });

  it("timeout/network failure: a dropped connection is rendered as a calm connectivity message", async () => {
    dashboardFailure = { kind: "reject", error: new TypeError("Failed to fetch") };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).toMatch(/couldn.t connect|connection/i);
  });

  it("unexpected internal error: an unclassified failure never renders its raw technical text", async () => {
    dashboardFailure = {
      kind: "http",
      status: 500,
      body: { error: "PrismaClientKnownRequestError: P2007 at /var/task/db.ts" },
    };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

describe("Owner Execution page — governed, owner-safe error rendering (remaining five catch paths)", () => {
  it("createBusiness: a failed create never renders its raw exception message", async () => {
    dashboardFixture = dashboardEmpty();
    businessCreateFailure = {
      kind: "http",
      status: 500,
      body: { error: "PrismaClientKnownRequestError: unique constraint" },
    };
    installFetchMock();
    const { container } = renderPage();
    await screen.findByText(/No businesses yet/);

    fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
    await screen.findByRole("heading", { name: "Create a business" });

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Test Co" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "INR" } });
    fireEvent.click(screen.getByRole("button", { name: /Create business/ }));

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });

  it("addSnapshot: a 404 on the underlying business never reaches the owner verbatim", async () => {
    dashboardFixture = dashboardNoSnapshot();
    snapshotFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_BUSINESS_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("+ Add execution snapshot").closest("button")).not.toBeDisabled());

    fireEvent.click(screen.getByText("+ Add execution snapshot"));
    await screen.findByRole("heading", { name: /Execution snapshot/ });

    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: /Save snapshot/ }));

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });

  it("runDiagnosis: a NotFoundError from a non-load mutation is governed the same way (not load()-specific)", async () => {
    dashboardFixture = dashboardWithSnapshotOnly();
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Run execution diagnosis").closest("button")).not.toBeDisabled());

    diagnosisFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_SNAPSHOT_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    fireEvent.click(screen.getByText("Run execution diagnosis"));

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });

  it("updateAction: a failed status transition never renders its raw exception message", async () => {
    dashboardFixture = dashboardWithFullCycle("proposed");
    actionUpdateFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_ACTION_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    installFetchMock();
    const { container } = renderPage();

    const assignButton = await screen.findByRole("button", { name: "Assign" });
    fireEvent.click(assignButton);

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });

  it("verifyAction: a failed verification submission never renders its raw exception message", async () => {
    dashboardFixture = dashboardWithFullCycle("in_progress");
    verifyFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_ACTION_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    installFetchMock();
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("10")
      .mockReturnValueOnce("20")
      .mockReturnValueOnce("up");
    const { container } = renderPage();

    const verifyButton = await screen.findByRole("button", { name: "Verify outcome" });
    fireEvent.click(verifyButton);

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });
});
