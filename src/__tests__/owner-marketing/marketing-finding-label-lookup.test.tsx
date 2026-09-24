/**
 * Owner Marketing page — finding-label/severity lookups guarded against inherited properties.
 *
 * See strategy-finding-label-lookup.test.tsx for the full ROOT_CAUSE account (identical defect
 * class, fixed identically here, via the same locally-duplicated `ownLookup()` helper).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerMarketingPage from "@/app/(authenticated)/owner/marketing/page";
import { POISON_VALUES, jsonResponse, buildFinding } from "../finding-label-lookup-fixtures";

const BIZ_A = { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true };

function dashboardWithFindings(findings: unknown[]) {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: "snap-1" },
    missingCriticalData: [],
    domainScore: null,
    recommendedNextAction: null,
    latestCycle: {
      id: "cycle-1",
      sequenceNumber: 1,
      marketingState: "GO",
      healthScore: 80,
      riskScore: 10,
      opportunityScore: 50,
      dataConfidenceScore: 90,
      findings,
      actions: [],
    },
    cycleHistory: [],
  };
}

function installFetchMock(findings: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: [BIZ_A] });
      if (url.startsWith("/api/owner/marketing/dashboard")) return jsonResponse(dashboardWithFindings(findings));
      return jsonResponse({});
    })
  );
}

function seedActiveBusiness() {
  window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ_A.id);
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerMarketingPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  seedActiveBusiness();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Marketing page — canonical finding labels (pre-existing behavior, unchanged)", () => {
  it.each([
    ["opportunity", "Opportunity"],
    ["risk", "Risk"],
  ])("findingType=%s renders label %s", async (findingType, label) => {
    installFetchMock([buildFinding({ findingType })]);
    renderPage();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it.each([
    ["low", "Low"],
    ["medium", "Medium"],
    ["high", "High"],
    ["critical", "Critical"],
  ])("severity=%s renders label %s", async (severity, label) => {
    installFetchMock([buildFinding({ severity })]);
    renderPage();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });
});

describe("Owner Marketing page — unknown values fall back to the raw string (pre-existing behavior, unchanged)", () => {
  it("an unrecognized findingType renders the raw value verbatim", async () => {
    installFetchMock([buildFinding({ findingType: "anomaly" })]);
    renderPage();
    expect(await screen.findByText("anomaly")).toBeInTheDocument();
  });

  it("an unrecognized severity renders the raw value verbatim with the pre-existing default badge styling", async () => {
    installFetchMock([buildFinding({ severity: "urgent" })]);
    renderPage();
    const badge = await screen.findByText("urgent");
    expect(badge.className).toContain("bg-primary/10");
    expect(badge.className).not.toContain("undefined");
  });
});

describe("Owner Marketing page — inherited Object.prototype property names never crash rendering (fix under test)", () => {
  it.each(POISON_VALUES)('findingType="%s" renders the raw value as plain text, no crash, no console error', async (poison) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetchMock([buildFinding({ findingType: poison })]);
    const { container } = renderPage();

    await screen.findByText("Critical");
    expect(container.textContent).toContain(poison);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it.each(POISON_VALUES)('severity="%s" renders the raw value as plain text with the pre-existing default variant, no crash, no console error', async (poison) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetchMock([buildFinding({ severity: poison })]);
    renderPage();

    await screen.findByText("Risk");
    const badge = screen.getByText(poison);
    expect(badge.className).toContain("bg-primary/10");
    expect(badge.className).not.toContain("undefined");
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
