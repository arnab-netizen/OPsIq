/**
 * Owner Start Here — "Analyze my business" action (PR B).
 *
 * ROOT_CAUSE this closes: an owner who reached "you have enough information for a
 * first read" saw a plain link to /owner/cockpit that assumed a diagnosis had
 * already run -- but no domain diagnosis is triggered automatically anywhere in the
 * product; the owner would land on an empty cockpit having to separately discover
 * and press "Run finance diagnosis" (and the sales/operations equivalents) on each
 * domain's own page. This test drives the real page component to prove the button
 * now actually triggers the new orchestration endpoint before navigating, and that
 * a failure preserves the page (no silent dead end, no raw exception text).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StartHerePage from "@/app/(authenticated)/owner/start-here/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <StartHerePage />
    </ActiveBusinessProvider>
  );
}

const REQUIREMENTS = { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: [] };

let analyzePostMode: "success" | "reject" | "total-failure" | "nothing-eligible" = "success";
let analyzeCalls: string[] = [];

const ANALYZE_RESPONSE_BODIES = {
  success: { analyzed: ["finance"], skipped: [], rateLimited: [], failed: [] },
  "total-failure": {
    analyzed: [],
    skipped: [],
    rateLimited: [],
    failed: [
      { domain: "finance", reason: "Error" },
      { domain: "sales", reason: "Error" },
      { domain: "operations", reason: "Error" },
    ],
  },
  "nothing-eligible": { analyzed: [], skipped: ["finance", "sales", "operations"], rateLimited: [], failed: [] },
} as const;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/owner/businesses") && method === "GET") {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }
      if (url.includes("/api/owner/onboarding")) {
        return {
          ok: true, status: 200,
          json: async () => ({
            found: true,
            canRunFirstDiagnosis: true,
            missingMinimum: [],
            requirements: REQUIREMENTS,
          }),
        } as Response;
      }
      if (url.includes("/api/owner/process-execution")) {
        return { ok: true, status: 200, json: async () => ({ tasks: [] }) } as Response;
      }
      if (url.match(/\/api\/owner\/businesses\/[^/]+\/analyze$/) && method === "POST") {
        analyzeCalls.push(url);
        if (analyzePostMode === "reject") {
          throw new TypeError("Failed to fetch");
        }
        return { ok: true, status: 200, json: async () => ANALYZE_RESPONSE_BODIES[analyzePostMode] } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  analyzePostMode = "success";
  analyzeCalls = [];
  pushMock.mockClear();
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Start Here — Analyze my business", () => {
  it("shows an 'Analyze my business' action once enough data exists, not a bare link to cockpit", async () => {
    renderPage();
    const button = await screen.findByTestId("start-here-analyze-button");
    expect(button).toBeTruthy();
    expect(screen.queryByText(/See my first result/i)).toBeNull();
  });

  it("clicking Analyze my business calls the analyze endpoint for the active business, then navigates to cockpit", async () => {
    renderPage();
    const button = await screen.findByTestId("start-here-analyze-button");
    fireEvent.click(button);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/owner/cockpit"));
    expect(analyzeCalls).toHaveLength(1);
    expect(analyzeCalls[0]).toContain(`/api/owner/businesses/${BIZ_A.id}/analyze`);
  });

  it("on failure, shows a human-facing message near the button and never navigates or leaks the raw exception", async () => {
    analyzePostMode = "reject";
    renderPage();
    const button = await screen.findByTestId("start-here-analyze-button");
    fireEvent.click(button);

    const errorEl = await screen.findByTestId("start-here-analyze-error");
    expect(errorEl.textContent).not.toMatch(/Failed to fetch/i);
    expect(errorEl.textContent).toMatch(/couldn't analyze/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("when every eligible domain fails (200 OK, zero analyzed), shows an error and never navigates -- no false success", async () => {
    analyzePostMode = "total-failure";
    renderPage();
    const button = await screen.findByTestId("start-here-analyze-button");
    fireEvent.click(button);

    const errorEl = await screen.findByTestId("start-here-analyze-error");
    expect(errorEl.textContent).toMatch(/couldn't analyze/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("when no domain has data yet (200 OK, all skipped), shows a distinct message and never navigates", async () => {
    analyzePostMode = "nothing-eligible";
    renderPage();
    const button = await screen.findByTestId("start-here-analyze-button");
    fireEvent.click(button);

    const errorEl = await screen.findByTestId("start-here-analyze-error");
    expect(errorEl.textContent).toMatch(/add more business data/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
