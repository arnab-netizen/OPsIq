/**
 * UX-03 — Owner Cockpit (Home) canonical assessment presentation, end to end.
 *
 * Exercises the REAL pipeline: OwnerNowView -> reconcileOwnerAssessment -> composeOwnerAssessment
 * -> OwnerAssessmentSummary, through the real OwnerCockpitPage and the real ActiveBusinessProvider.
 * Only network responses are mocked. reconcileOwnerAssessment, composeOwnerAssessment, and
 * OwnerAssessmentSummary itself are never mocked here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerCockpitPage from "@/app/(authenticated)/owner/cockpit/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import type { OwnerNowView, AreaStatus } from "@/domain/owner-guidance/guidance-orchestrator";
import { resolveOwnerDecision, type OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-FIELD-SERVICE" };
const BIZ_B = { id: "22222222-2222-4222-8222-222222222222", name: "Trinity Services" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function issue(
  id: string,
  category: IssueCategory,
  severity: BusinessIssue["severity"] = "MEDIUM",
): BusinessIssue {
  return {
    id,
    category,
    severity,
    headline: `${id} headline`,
    requiresOwnerAction: true,
    businessFunction: [BusinessFunction.STRATEGY],
  };
}

const ALL_KNOWN_CONDITION_DIMENSIONS: DerivedBusinessConditionSignals = {
  cashPressureLevel: "LOW",
  marginPressureLevel: "LOW",
  clientConcentrationRisk: "LOW",
  ownerDependencyRisk: "LOW",
  keyPersonDependencyRisk: "LOW",
  processMaturityLevel: "HIGH",
  managementMaturityLevel: "HIGH",
  executionCapacityLevel: "HIGH",
  moralFragilityLevel: "LOW",
  resilienceLevel: "HIGH",
  growthReadinessLevel: "HIGH",
};

const ALL_UNKNOWN_CONDITION_DIMENSIONS: DerivedBusinessConditionSignals = {
  cashPressureLevel: "unknown",
  marginPressureLevel: "unknown",
  clientConcentrationRisk: "unknown",
  ownerDependencyRisk: "unknown",
  keyPersonDependencyRisk: "unknown",
  processMaturityLevel: "unknown",
  managementMaturityLevel: "unknown",
  executionCapacityLevel: "unknown",
  moralFragilityLevel: "unknown",
  resilienceLevel: "unknown",
  growthReadinessLevel: "unknown",
};

function viewFixture(businessId: string, overrides: Partial<OwnerNowView> = {}): OwnerNowView {
  const ok_: AreaStatus = "OK";
  return {
    workspaceId: "ws-1",
    businessId,
    classification: GuidanceClassification.GUIDANCE_READY,
    topOwnerActions: [],
    actionsToAvoid: [],
    urgentRisks: [],
    whatChanged: [],
    missingDataRequests: [],
    confidence: EvidenceConfidenceLevel.STRONG,
    confidenceCapped: false,
    emergency: false,
    reasoningSummary: "",
    businessHealth: ok_,
    cashDangerStatus: ok_,
    profitLeakStatus: ok_,
    staffOverloadStatus: ok_,
    ownerOverloadStatus: ok_,
    qualityFailureStatus: ok_,
    customerRetentionStatus: ok_,
    supplierInventoryStatus: ok_,
    capacityStatus: ok_,
    growthReadinessStatus: ok_,
    ...overrides,
  };
}

function nowViewResponse(
  businessId: string,
  viewOverrides: Partial<OwnerNowView> = {},
  conditionDimensions: DerivedBusinessConditionSignals | null = ALL_KNOWN_CONDITION_DIMENSIONS,
  primaryClass: OwnerPriorityClass | null = null,
) {
  return {
    view: viewFixture(businessId, viewOverrides),
    derivedBusinessCondition: conditionDimensions,
    // The primary concern comes ONLY from the canonical owner decision's main target class.
    ownerDecision: primaryClass ? decisionWithClass(businessId, primaryClass) : null,
  };
}

/** A complete canonical decision (real resolver) whose main target has the given class. */
function decisionWithClass(businessId: string, priorityClass: OwnerPriorityClass) {
  return JSON.parse(JSON.stringify(resolveOwnerDecision({
    businessId, workspaceId: "ws-1",
    candidates: [{
      candidateId: `domain_action:finance:${priorityClass}`, businessId, workspaceId: "ws-1", source: "domain_action", domain: "finance",
      sourceId: priorityClass, priorityClass, findingCode: "FIN_TEST", findingId: null, title: `Main target (${priorityClass})`, explanation: "",
      severity: "high", priorityScore: 60, expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed",
      ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null,
      stale: false, exclusion: null, targetRoute: "/owner/finance",
    }],
    diagnosedDomains: ["finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "weekly" }, previous: null, events: [], domainsDiagnosedSince: [],
    now: new Date("2026-06-30T00:00:00Z"),
  })));
}

/** Test-only harness — this page renders no business selector of its own by design. */
function SwitchHarness() {
  const { setActiveBusinessId } = useActiveBusiness();
  return (
    <div>
      <button data-testid="switch-to-a" onClick={() => setActiveBusinessId(BIZ_A.id)}>switch to A</button>
      <button data-testid="switch-to-b" onClick={() => setActiveBusinessId(BIZ_B.id)}>switch to B</button>
    </div>
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <SwitchHarness />
      <OwnerCockpitPage />
    </ActiveBusinessProvider>,
  );
}

interface PendingCall { businessId: string; resolve: (data: unknown) => void; reject: (err: unknown) => void }
let nowViewCalls: PendingCall[];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) return ok({ businesses: [BIZ_A, BIZ_B] });
      if (url.includes("/api/owner/now-view")) {
        const params = new URL(url, "https://example.com").searchParams;
        const businessId = params.get("businessId")!;
        return new Promise<Response>((resolve, reject) => {
          nowViewCalls.push({ businessId, resolve: (data) => resolve(ok(data)), reject });
        });
      }
      if (url.includes("/api/owner/recovery-status")) return ok({});
      if (url.includes("/api/owner/public-signals")) return ok({});
      if (url.includes("/api/owner/onboarding")) return ok({ found: false });
      if (url.includes("/api/owner/process-execution")) return ok({ tasks: [] });
      return ok({});
    }),
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function waitForCall(businessId: string, occurrence = 0): Promise<PendingCall> {
  await waitFor(
    () => {
      const matches = nowViewCalls.filter((c) => c.businessId === businessId);
      expect(matches.length).toBeGreaterThan(occurrence);
    },
    { timeout: 3000 },
  );
  return nowViewCalls.filter((c) => c.businessId === businessId)[occurrence]!;
}

beforeEach(() => {
  nowViewCalls = [];
  installFetchMock();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Cockpit (Home) — UX-03 canonical assessment presentation", () => {
  it("A. AVAILABLE + OK renders the no-major-problem headline with no next-data block", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => { call.resolve(nowViewResponse(BIZ_A.id)); });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
        "No major problem is showing in the current evidence.",
      ),
    );
    expect(screen.getByTestId("owner-assessment-confidence-message")).toHaveTextContent(
      "The assessment is supported by the available evidence.",
    );
    expect(screen.queryByTestId("owner-assessment-next-data-step-block")).not.toBeInTheDocument();
  });

  it("B. LIMITED + DANGER + CASH_DANGER + missing data renders the exact expected copy", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(
        nowViewResponse(BIZ_A.id, {
          businessHealth: "DANGER",
          cashDangerStatus: "DANGER",
          topOwnerActions: [issue("i1", IssueCategory.CASH_DANGER, "HIGH")],
          missingDataRequests: ["latest cash position (cash on hand + obligations)"],
        }, ALL_KNOWN_CONDITION_DIMENSIONS, "SURVIVAL_CASH"),
      );
    });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent("The business needs attention."),
    );
    expect(screen.getByTestId("owner-assessment-primary-concern")).toHaveTextContent(
      "Cash flow is the first issue to address.",
    );
    expect(screen.getByTestId("owner-assessment-confidence-label")).toHaveTextContent("Limited confidence");
    expect(screen.getByTestId("owner-assessment-confidence-message")).toHaveTextContent(
      "Some important data is missing, so this assessment is provisional.",
    );
    expect(screen.getByTestId("owner-assessment-next-data-step")).toHaveTextContent(
      "Add or update latest cash position (cash on hand + obligations).",
    );
  });

  it("C. INSUFFICIENT renders the exact expected copy with no fabricated primary concern", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(
        nowViewResponse(
          BIZ_A.id,
          {
            confidence: EvidenceConfidenceLevel.INSUFFICIENT,
            topOwnerActions: [],
            urgentRisks: [],
            missingDataRequests: [],
          },
          ALL_UNKNOWN_CONDITION_DIMENSIONS,
        ),
      );
    });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
        "There isn't enough evidence to assess this business yet.",
      ),
    );
    expect(screen.getByTestId("owner-assessment-confidence-label")).toHaveTextContent("Not enough evidence");
    expect(screen.getByTestId("owner-assessment-confidence-message")).toHaveTextContent(
      "More current business data is needed before OpsIQ can make a reliable assessment.",
    );
    expect(screen.getByTestId("owner-assessment-next-data-step")).toHaveTextContent(
      "Add recent operating data for this business.",
    );
    expect(screen.queryByTestId("owner-assessment-primary-concern")).not.toBeInTheDocument();
  });

  it("D. LIMITED must NOT worsen an OK health into a danger/critical headline", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(nowViewResponse(BIZ_A.id, { businessHealth: "OK", confidenceCapped: true }));
    });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
        "No major problem is showing in the current evidence.",
      ),
    );
    expect(screen.getByTestId("owner-assessment-headline").textContent).not.toMatch(/watch|attention/i);
  });

  it("E. a CRITICAL condition dimension cannot override an OK health headline", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(
        nowViewResponse(
          BIZ_A.id,
          { businessHealth: "OK" },
          { ...ALL_KNOWN_CONDITION_DIMENSIONS, cashPressureLevel: "CRITICAL" },
        ),
      );
    });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
        "No major problem is showing in the current evidence.",
      ),
    );
  });

  it("F. the primary concern follows the canonical main target, never Now View's own #1 or a more severe urgent risk", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(
        nowViewResponse(BIZ_A.id, {
          topOwnerActions: [issue("i0", IssueCategory.CASH_DANGER, "HIGH")],
          urgentRisks: [issue("i2", IssueCategory.CASH_DANGER, "CRITICAL")],
        }, ALL_KNOWN_CONDITION_DIMENSIONS, "PROCESS_OPTIMISATION"),
      );
    });
    await flush();

    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-primary-concern")).toHaveTextContent(
        "Process improvement is the first opportunity to consider.",
      ),
    );
    expect(screen.queryByText("Cash flow is the first issue to address.")).not.toBeInTheDocument();
  });

  it("F2. without a canonical decision there is no primary concern (Now View never elects one)", async () => {
    renderPage();
    const call = await waitForCall(BIZ_A.id);
    await act(async () => {
      call.resolve(nowViewResponse(BIZ_A.id, { topOwnerActions: [issue("i0", IssueCategory.CASH_DANGER, "HIGH")] }));
    });
    await flush();
    await waitFor(() => expect(screen.getByTestId("owner-assessment-headline")).toBeInTheDocument());
    expect(screen.queryByTestId("owner-assessment-primary-concern")).not.toBeInTheDocument();
  });

  it("G. an out-of-order business switch never lets a stale assessment replace the current one", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);

    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B (current business) resolves first, with a distinct headline.
    await act(async () => {
      callB.resolve(nowViewResponse(BIZ_B.id, { businessHealth: "OK" }));
    });
    await flush();
    await waitFor(() =>
      expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
        "No major problem is showing in the current evidence.",
      ),
    );

    // The stale A response, for a business no longer active, finally resolves with a DIFFERENT
    // headline. It must never replace B's already-rendered assessment.
    await act(async () => {
      callA.resolve(nowViewResponse(BIZ_A.id, { businessHealth: "CRITICAL" }));
    });
    await flush();

    expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent(
      "No major problem is showing in the current evidence.",
    );
    expect(screen.queryByText("The business needs urgent attention.")).not.toBeInTheDocument();
  });
});
