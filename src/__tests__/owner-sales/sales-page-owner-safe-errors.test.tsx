/**
 * Owner Sales — page-level owner-safe error rendering (UX-04B, Section Q item 4).
 *
 * ROOT_CAUSE: `load`, `createBusiness`, `addSnapshot`, `runDiagnosis`, `updateAction`, and
 * `verifyAction` in src/app/(authenticated)/owner/sales/page.tsx each rendered a caught
 * exception's raw `e.message` directly into the shared page-top error banner
 * (`setError(e instanceof Error ? e.message : "...")`), with no governance at all — unlike Money
 * (owner/finance/page.tsx), which already routes every one of its catch blocks through
 * `classifyOperatorError`. Because `NotFoundError` (src/infra/errors.ts) formats its message as
 * `` `${entityType} not found: ${entityId}` ``, and this page's own `api()` helper re-throws
 * `data.error.message` verbatim as a plain `Error`, a 404 from any of these six handlers rendered
 * a raw internal entity name and UUID straight to the owner (see
 * `finance-page-owner-safe-errors.test.tsx`'s own header comment, which documents this exact leak
 * having previously existed — and been fixed — on the sibling Money page).
 *
 * This test drives the real page component end-to-end (fetch mocked at the network boundary) so
 * the assertions cover the actual render output, not just that `classifyOperatorError` was
 * called. `load()` fires automatically on mount and reaches the shared `error` state exercised by
 * five of the six handlers, so it is used here as the representative path for each error class; a
 * dedicated `runDiagnosis` case additionally proves the fix isn't `load()`-specific.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };
const LEAKY_UUID = "123e4567-e89b-12d3-a456-426614174000";
const LEAKY_ENTITY = "OwnerSalesSnapshot";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

type DashboardFailureMode =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "reject"; error: unknown };

let dashboardFailure: DashboardFailureMode | null = null;
/** Only affects whether the "Run sales diagnosis" button is enabled -- kept independent of
 *  `hasData` so the diagnosis-cycle view (which needs a full `cycle` payload this test doesn't
 *  construct) is never entered. */
let dashboardHasSnapshot = false;

function dashboardOk() {
  return {
    businesses: [BIZ_A],
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
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }

      if (url.includes("/api/owner/sales/dashboard")) {
        if (dashboardFailure) {
          if (dashboardFailure.kind === "reject") {
            throw dashboardFailure.error;
          }
          return {
            ok: false,
            status: dashboardFailure.status,
            json: async () => dashboardFailure.body,
          } as Response;
        }
        return { ok: true, status: 200, json: async () => dashboardOk() } as Response;
      }

      if (url.match(/\/api\/owner\/sales\/businesses\/[^/]+\/diagnoses$/)) {
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

/** Sales's error banner has no data-testid/role (unlike Money's) -- locate it structurally. */
function getErrorBanner(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".text-destructive");
  if (!el) throw new Error("Expected an error banner (.text-destructive) to be rendered");
  return el as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  dashboardFailure = null;
  dashboardHasSnapshot = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Sales page — governed, owner-safe error rendering", () => {
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
      body: { error: { message: `${LEAKY_ENTITY} not found: ${LEAKY_UUID}` } },
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

  it("unexpected internal Error: an unclassified failure never renders its raw .message", async () => {
    dashboardFailure = {
      kind: "reject",
      error: new Error("Cannot read properties of undefined (reading 'ownerSalesSnapshotId')"),
    };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    expect(banner.textContent).not.toMatch(/Cannot read properties/i);
    expect(banner.textContent).not.toMatch(/ownerSalesSnapshotId/i);
    assertNoLeak(banner.textContent ?? "");
    expect(banner.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("runDiagnosis: a NotFoundError from a non-load mutation is governed the same way (not load()-specific)", async () => {
    // A snapshot must already exist for the "Run sales diagnosis" button to be enabled.
    dashboardHasSnapshot = true;
    installFetchMock();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Run sales diagnosis").closest("button")).not.toBeDisabled());

    dashboardFailure = {
      kind: "http",
      status: 404,
      body: { error: { message: `${LEAKY_ENTITY} not found: ${LEAKY_UUID}` } },
    };
    fireEvent.click(screen.getByText("Run sales diagnosis"));

    await waitFor(() => getErrorBanner(container));
    const banner = getErrorBanner(container);
    assertNoLeak(banner.textContent ?? "");
  });
});
