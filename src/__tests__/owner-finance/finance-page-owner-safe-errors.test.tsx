/**
 * Owner Finance — page-level owner-safe error rendering.
 *
 * ROOT_CAUSE: `load`, `createBusiness`, `runDiagnosis`, `updateAction`, and `verifyAction` in
 * src/app/(authenticated)/owner/finance/page.tsx each rendered a caught exception's raw
 * `e.message` directly into the shared page-top error banner (`setError(e instanceof Error ?
 * e.message : "...")`), with no governance. `addSnapshot()` on this same page was already fixed
 * to route through `classifyOperatorError` (see finance-snapshot-draft-and-error.test.tsx); the
 * other five mutations were not. Because `NotFoundError` (src/infra/errors.ts) formats its
 * message as `` `${entityType} not found: ${entityId}` ``, and the client's own `api()` helper
 * re-throws `data.error.message` verbatim as a plain `Error`, a 404 from any of these five
 * handlers rendered a raw internal entity name and UUID straight to the owner
 * (e.g. "OwnerFinancialSnapshot not found: 123e4567-e89b-12d3-a456-426614174000").
 *
 * This test drives the real page component end-to-end (fetch mocked at the network boundary) so
 * the assertions cover the actual render output, not just that classifyOperatorError was called.
 * `load()` fires automatically on mount and reaches the shared `error` state exercised by all
 * five handlers, so it is used here as the representative path for each error class; a dedicated
 * `runDiagnosis` case additionally proves the fix isn't `load`-specific.
 *
 * ROOT_CAUSE (initial-load empty-state defect, Group A of the false-empty-state class already
 * fixed for Execution in PR #526): `businesses` here is derived as `dashboard?.businesses ?? []`,
 * and the "No businesses yet" empty state was gated on `businesses.length === 0` alone.
 * `dashboard` starts `null` and is set only inside `load()`'s success branch -- never reset to
 * `null` on failure (see `load()`'s catch block above) -- so a failed INITIAL load (no successful
 * response has ever landed) left `dashboard === null`, and the `?? []` fallback made
 * `businesses.length === 0` true purely from absent data, not a confirmed empty payload. The page
 * then rendered "No businesses yet." next to the governed error banner, presenting unverified
 * emptiness as fact -- identical in shape to the Execution defect. Fix: gate the empty-state
 * ternary on `dashboard === null` first, using existing state (no new loading-history variable).
 * The "initial-load empty-state gating" describe block below is this fix's dedicated regression
 * coverage, mirroring the 6-scenario pattern from
 * execution-page-owner-safe-errors.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };
const LEAKY_UUID = "123e4567-e89b-12d3-a456-426614174000";
const LEAKY_ENTITY = "OwnerFinancialSnapshot";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerFinancePage />
    </ActiveBusinessProvider>
  );
}

type DashboardFailureMode =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "reject"; error: unknown };

let dashboardFailure: DashboardFailureMode | null = null;
/** Only affects whether the "Run finance diagnosis" button is enabled -- kept independent of
 *  `hasData` so the diagnosis-cycle view (which needs a full `cycle` payload this test doesn't
 *  construct) is never entered. */
let dashboardHasSnapshot = false;
/** 1-indexed count of dashboard GETs issued so far this test, and an optional call number on
 *  which `dashboardFailure` alone should apply (every other call succeeds) -- used by the
 *  "initial-load empty-state gating" tests below to fail only a specific call (e.g. the first,
 *  or a later reload) while leaving others successful. `null` (the default) applies
 *  `dashboardFailure`, when set, to every call -- unchanged behavior for every existing test. */
let dashboardCallCount = 0;
let dashboardFailOnCall: number | null = null;
let dashboardBusinesses: Array<{ id: string; name: string; currency: string }> = [BIZ_A];
/** Overrides the default (empty-cycle) success payload for a given test -- used by the
 *  "populated success then failed reload" scenario to construct a full FinanceCycleView payload. */
let dashboardFixtureOverride: Record<string, unknown> | null = null;

function dashboardOk() {
  return {
    businesses: dashboardBusinesses,
    selectedBusinessId: BIZ_A.id,
    hasData: false,
    latestSnapshot: dashboardHasSnapshot ? { id: "snap-1" } : null,
    missingCriticalData: [],
  };
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: dashboardBusinesses }) } as Response;
      }

      if (url.includes("/api/owner/finance/dashboard")) {
        dashboardCallCount += 1;
        const shouldFail =
          dashboardFailure &&
          (dashboardFailOnCall === null || dashboardCallCount === dashboardFailOnCall);
        if (shouldFail) {
          if (dashboardFailure!.kind === "reject") {
            throw dashboardFailure!.error;
          }
          return {
            ok: false,
            status: dashboardFailure!.status,
            json: async () => dashboardFailure!.body,
          } as Response;
        }
        return { ok: true, status: 200, json: async () => dashboardFixtureOverride ?? dashboardOk() } as Response;
      }

      if (url.match(/\/api\/owner\/finance\/businesses\/[^/]+\/diagnoses$/)) {
        if (dashboardFailure) {
          if (dashboardFailure.kind === "reject") throw dashboardFailure.error;
          return { ok: false, status: dashboardFailure.status, json: async () => dashboardFailure.body } as Response;
        }
        return { ok: true, status: 201, json: async () => ({ id: "diag-1" }) } as Response;
      }

      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

/** Every string that must never appear anywhere in the rendered error banner. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // any UUID
  new RegExp(LEAKY_ENTITY, "i"),
  /not found:/i,
  /prisma/i,
  /stack trace/i,
  /TypeError/i,
];

function assertNoLeak(text: string) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  dashboardFailure = null;
  dashboardHasSnapshot = false;
  dashboardCallCount = 0;
  dashboardFailOnCall = null;
  dashboardBusinesses = [BIZ_A];
  dashboardFixtureOverride = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Finance page — governed, owner-safe error rendering", () => {
  it("happy path: a successful load renders no error banner at all", async () => {
    installFetchMock();
    renderPage();
    await waitFor(() => expect(screen.getByText("+ New business")).toBeInTheDocument());
    expect(screen.queryByTestId("finance-page-error")).not.toBeInTheDocument();
  });

  it("NotFoundError: a 404 carrying a raw '<Entity> not found: <uuid>' message never reaches the owner verbatim", async () => {
    dashboardFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    installFetchMock();
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    assertNoLeak(banner.textContent ?? "");
    // Still a real, non-empty, calm message -- not just suppressed to blank.
    expect(banner.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("validation error: the message stays specific/actionable, not generic to the point of uselessness", async () => {
    dashboardFailure = {
      kind: "http",
      status: 400,
      // Real canonical 400 shape (runtime-verified): the wrapper sends a string `error` + fieldErrors.
      body: { error: "Validation failed", fieldErrors: [{ path: "businessType", message: "Invalid business type supplied" }] },
    };
    installFetchMock();
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
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
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).toMatch(/don.t have permission/i);
  });

  it("timeout/network failure: a dropped connection is rendered as a calm connectivity message", async () => {
    dashboardFailure = { kind: "reject", error: new TypeError("Failed to fetch") };
    installFetchMock();
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent).toMatch(/couldn.t connect|connection/i);
  });

  it("unexpected internal Error: an unclassified failure never renders its raw .message", async () => {
    dashboardFailure = {
      kind: "reject",
      error: new Error("Cannot read properties of undefined (reading 'ownerFinancialSnapshotId')"),
    };
    installFetchMock();
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    expect(banner.textContent).not.toMatch(/Cannot read properties/i);
    expect(banner.textContent).not.toMatch(/ownerFinancialSnapshotId/i);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("runDiagnosis: a NotFoundError from a non-load mutation is governed the same way (not load()-specific)", async () => {
    // A snapshot must already exist for the "Run finance diagnosis" button to be enabled.
    dashboardHasSnapshot = true;
    installFetchMock();
    renderPage();
    await waitFor(() => expect(screen.getByText("Run finance diagnosis").closest("button")).not.toBeDisabled());

    dashboardFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    fireEvent.click(screen.getByText("Run finance diagnosis"));

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    assertNoLeak(banner.textContent ?? "");
  });
});

/**
 * Owner Finance page — initial-load empty-state gating (dashboard === null vs. a successful
 * zero-business payload). See the file-header ROOT_CAUSE comment above for the full defect and
 * fix. Six scenarios, matching the Execution fix's (PR #526) required coverage exactly.
 */
describe("Owner Finance page — initial-load empty-state gating", () => {
  const BIZ_B = { id: "biz-b", name: "Trinity Services", currency: "USD" };

  function populatedFixture(label: string) {
    return {
      businesses: [BIZ_A],
      selectedBusinessId: BIZ_A.id,
      hasData: true,
      latestSnapshot: { id: `snap-${label}` },
      missingCriticalData: [],
      domainScore: null,
      recommendedNextAction: {
        title: `FINANCE_${label}_ACTION`,
        description: "x",
        priorityScore: 1,
        expectedImpactScore: 1,
        effortScore: 1,
        verificationMetric: "revenue",
      },
      latestCycle: {
        id: `cycle-${label}`,
        sequenceNumber: 1,
        survivalState: "SAFE",
        overallHealthScore: 80,
        survivalRiskScore: 10,
        growthOpportunityScore: 50,
        dataConfidenceScore: 90,
        findings: [],
        actions: [],
      },
      cycleHistory: [],
    };
  }

  function SwitchHarness() {
    const { setActiveBusinessId } = useActiveBusiness();
    return (
      <button data-testid="switch-to-b" onClick={() => setActiveBusinessId(BIZ_B.id)}>
        switch to B
      </button>
    );
  }

  function renderPageWithSwitch() {
    return render(
      <ActiveBusinessProvider>
        <SwitchHarness />
        <OwnerFinancePage />
      </ActiveBusinessProvider>
    );
  }

  it("1. pending initial request: loading UI only, no premature empty-business claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
        }
        if (url.includes("/api/owner/finance/dashboard")) {
          // Never resolves within this test -- the initial request stays pending throughout.
          return new Promise<Response>(() => {});
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    const { container } = renderPage();

    expect(await screen.findByRole("status", { name: "Loading your money information" })).toBeInTheDocument();
    expect(screen.queryByText(/No businesses yet/)).not.toBeInTheDocument();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("2. failed initial request with no dashboard payload: governed error only, no false no-business/no-snapshot guidance or data-dependent controls", async () => {
    dashboardFailure = { kind: "http", status: 500, body: { error: "boom" } };
    installFetchMock();
    renderPage();

    const banner = await waitFor(() => screen.getByTestId("finance-page-error"));
    assertNoLeak(banner.textContent ?? "");

    expect(screen.queryByText(/No businesses yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not enough financial information yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ready for a first diagnosis/)).not.toBeInTheDocument();
    expect(screen.queryByText("+ Add financial snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Run finance diagnosis")).not.toBeInTheDocument();
    // The always-available "+ New business" action (independent of dashboard) is unaffected.
    expect(screen.getByRole("button", { name: "+ New business" })).toBeInTheDocument();
  });

  it("3. successful response with zero businesses: original no-business guidance, no error", async () => {
    dashboardBusinesses = [];
    installFetchMock();
    const { container } = renderPage();

    await screen.findByText(/No businesses yet/);
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("4. successful response with an existing business but no snapshot: original no-snapshot guidance, no error", async () => {
    dashboardHasSnapshot = false;
    installFetchMock();
    const { container } = renderPage();

    await screen.findByText(/Not enough financial information yet/);
    // The "+ Add financial snapshot" action is gated on the canonical first-read gate, which the page
    // resolves from a SECOND request (/api/owner/onboarding) after the dashboard has rendered the guidance
    // above — so wait for the action itself, not just the guidance text, before asserting on it.
    expect(await screen.findByText("+ Add financial snapshot")).toBeInTheDocument();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("5. a successful populated load followed by a failed reload preserves the prior content and shows the governed error", async () => {
    dashboardFixtureOverride = populatedFixture("A");
    dashboardFailure = { kind: "http", status: 500, body: { error: "boom" } };
    dashboardFailOnCall = 2; // the initial load (call 1) succeeds; the reload (call 2) fails
    installFetchMock();
    const { container } = renderPage();

    await screen.findAllByText("FINANCE_A_ACTION");
    expect(container.querySelector(".text-destructive")).toBeNull();

    // A successful mutation (runDiagnosis, no diagnosisFailure configured) triggers this page's
    // own authoritative reload -- that reload's dashboard GET is the one that fails.
    // (The button row appears once the canonical first-read gate has resolved for the business.)
    fireEvent.click(await screen.findByText("Run finance diagnosis"));

    await waitFor(() => screen.getByTestId("finance-page-error"));
    expect(screen.getAllByText("FINANCE_A_ACTION").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No businesses yet/)).not.toBeInTheDocument();
  });

  it("how to fix this: shows the existing recommendation's description, timeframe and verification method in plain language", async () => {
    const fx = populatedFixture("A");
    fx.recommendedNextAction = {
      ...fx.recommendedNextAction,
      title: "Build at least 2 weeks of operating cash",
      description: "Postpone unnecessary spending and collect money customers already owe you.",
      expectedTimeframeDays: 14,
      verificationMethod: "Re-measure cashDaysOfCosts next period; target above 14 days.",
    } as typeof fx.recommendedNextAction;
    dashboardFixtureOverride = fx;
    installFetchMock();
    renderPage();

    const box = await screen.findByTestId("finance-how-to-fix");
    expect(box.textContent).toContain("How to start fixing this");
    expect(box.textContent).toContain("Do this");
    expect(box.textContent).toContain("Postpone unnecessary spending and collect money customers already owe you.");
    expect(box.textContent).toContain("Do it within");
    expect(box.textContent).toContain("Try to do this within 14 days.");
    expect(box.textContent).toContain("How to check");
    expect(box.textContent).toContain("Re-measure cash days of costs next period; target above 14 days.");
    // No raw metric key in the owner-facing section.
    expect(box.textContent).not.toContain("cashDaysOfCosts");
    // The recommendation title stays under "What to do first" (not duplicated here).
    expect(screen.getByTestId("finance-answer-first").textContent).toContain("What to do first");
  });

  it("how to fix this: omits lines the recommendation does not carry (nothing invented)", async () => {
    const fx = populatedFixture("A");
    fx.recommendedNextAction = { ...fx.recommendedNextAction, description: "Only a description exists." } as typeof fx.recommendedNextAction;
    dashboardFixtureOverride = fx;
    installFetchMock();
    renderPage();

    const box = await screen.findByTestId("finance-how-to-fix");
    expect(box.textContent).toContain("Only a description exists.");
    expect(box.textContent).not.toContain("Do it within");
    expect(box.textContent).not.toContain("How to check");
    expect(box.textContent).toContain("1. Do this"); // numbering stays contiguous when optional lines are omitted
  });

  it("6. a subsequent successful load clears the error and renders fresh data", async () => {
    dashboardBusinesses = [BIZ_A, BIZ_B];
    dashboardFailure = { kind: "http", status: 500, body: { error: "boom" } };
    dashboardFailOnCall = 1; // only the initial load (for the auto-selected BIZ_A) fails
    installFetchMock();
    const { container } = renderPageWithSwitch();

    await waitFor(() => screen.getByTestId("finance-page-error"));
    expect(screen.queryByText(/No businesses yet/)).not.toBeInTheDocument();

    // Switching business triggers a fresh load() for BIZ_B, which succeeds.
    fireEvent.click(screen.getByTestId("switch-to-b"));

    await screen.findByText(/Not enough financial information yet/);
    expect(container.querySelector(".text-destructive")).toBeNull();
  });
});
