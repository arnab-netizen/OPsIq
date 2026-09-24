/**
 * Owner Strategy page — finding-label/severity lookups guarded against inherited properties.
 *
 * ROOT_CAUSE fixed here: this page's own local `FINDING_TYPE_LABEL`/`SEVERITY_LABEL`/
 * `SEVERITY_VARIANT` maps were indexed with bare, unguarded `map[key]` lookups
 * (`FINDING_TYPE_LABEL[f.findingType] ?? f.findingType`, `SEVERITY_VARIANT[f.severity]`,
 * `SEVERITY_LABEL[f.severity] ?? f.severity`) against `f.findingType`/`f.severity` from a
 * `cycle.findings` array returned by the dashboard API -- server-controlled data. Unlike
 * `FindingCard.tsx` (PR #525), this page never lowercases the key first, so ALL FIVE
 * `Object.prototype` member names below resolve to their real inherited member on an unguarded
 * lookup: `constructor`/`toString`/`hasOwnProperty`/`valueOf` resolve to inherited *functions*
 * (React logs "Functions are not valid as a React child" and renders nothing), and `__proto__`
 * resolves to the prototype *object* itself (React throws synchronously: "Objects are not valid
 * as a React child"). Fix: a local `ownLookup()` helper (`Object.prototype.hasOwnProperty.call`),
 * matching the same pattern PR #525 already applied to `FindingCard.tsx` and duplicated locally
 * here since this page defines its own local label maps rather than importing them.
 *
 * This file drives the real page component end-to-end (fetch mocked at the network boundary).
 * Canonical labels, case handling (none exists on this page -- unchanged, not introduced here),
 * the unknown-value fallback, and every other displayed finding field are unchanged from before
 * this fix; only the previously-unguarded lookups are now guarded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerStrategyPage from "@/app/(authenticated)/owner/strategy/page";
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
      strategyState: "GO",
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
      if (url.startsWith("/api/owner/strategy/dashboard")) return jsonResponse(dashboardWithFindings(findings));
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
      <OwnerStrategyPage />
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

describe("Owner Strategy page — canonical finding labels (pre-existing behavior, unchanged)", () => {
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

describe("Owner Strategy page — unknown values fall back to the raw string (pre-existing behavior, unchanged)", () => {
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

describe("Owner Strategy page — inherited Object.prototype property names never crash rendering (fix under test)", () => {
  it.each(POISON_VALUES)('findingType="%s" renders the raw value as plain text, no crash, no console error', async (poison) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetchMock([buildFinding({ findingType: poison })]);
    const { container } = renderPage();

    await screen.findByText("Critical"); // severity badge (held canonical) proves the page rendered
    expect(container.textContent).toContain(poison);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it.each(POISON_VALUES)('severity="%s" renders the raw value as plain text with the pre-existing default variant, no crash, no console error', async (poison) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetchMock([buildFinding({ severity: poison })]);
    renderPage();

    await screen.findByText("Risk"); // findingType badge (held canonical) proves the page rendered
    const badge = screen.getByText(poison);
    expect(badge.className).toContain("bg-primary/10");
    expect(badge.className).not.toContain("undefined");
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
