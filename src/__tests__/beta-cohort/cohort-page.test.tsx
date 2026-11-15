// @vitest-environment jsdom
/**
 * /admin/beta-cohort renders what the server computed — it adds no rules. Pins: UNKNOWN is shown as UNKNOWN (never as a
 * blank, NO or 0); telemetry columns are labelled as in-product signals, separate from the evidence columns; owners
 * that do not count (QA / fixture) are marked; the gate is shown CLOSED; the privacy reminder is present; a 403 shows
 * the permission state; an invalid form is explained from the shared schema BEFORE any request is made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import BetaCohortPage from "@/app/(authenticated)/admin/beta-cohort/page";

const fetchMock = vi.fn();
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const owner = (over: Record<string, unknown> = {}) => ({
  assignment: { betaRequestId: "6f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e11", cohortId: "CB1", ownerCode: "CB1-001", kind: "REAL_OWNER", assignedAt: "2026-10-20T00:00:00Z" },
  automatic: {
    invitedAt: "2026-10-19T00:00:00Z", signupAt: "2026-10-20T00:00:00Z", emailVerifiedAt: "2026-10-20T00:05:00Z", firstFindingAt: null,
    firstResultViewedAt: "2026-10-20T00:20:00Z", firstFindingCode: null, firstRecommendationCode: null, firstRecommendationConfidence: null,
    evidenceCorrectionCount: 0, recommendationChangedAfterCorrection: null,
    productDecision: { state: "ACCEPTED", decidedAt: "2026-10-20T00:30:00Z" }, productFeedback: { rating: "USEFUL", reason: null, at: "2026-10-20T00:31:00Z" },
    ownerReportedOutcome: null, firstReturnVisitAt: null, returnVisitCount: 0, isFixtureBusiness: false, accountFound: true,
  },
  evidence: { understanding: "UNKNOWN", trust: "UNKNOWN", wouldTakeAction: "UNKNOWN", realWorldAction: "UNKNOWN", actionTakenOn: null, outcome: "UNKNOWN", severity: "NONE", openP2TrustBlockers: 0, entryCount: 0, openIssues: [] },
  firstTrustedValue: null, stage: "DECIDED", t7: { dueAt: null, status: "NOT_SCHEDULED" },
  nextOperatorStep: "Ask: do you understand what OpsIQ is telling you? Then record understanding", countedInGate: true, ...over,
});
const view = (owners: unknown[]) => ({
  cohortId: "CB1", generatedAt: "2026-10-21T00:00:00Z", owners,
  gate: { gate: "CLOSED", realOwnersCounted: owners.length, required: 3, p0Open: 0, p1Open: 0, p2TrustBlockersOpen: 0, criteria: {}, unmet: ["Fewer than 3 genuine owners counted (1)"] },
  candidates: [],
});

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("beta cohort page", () => {
  it("shows UNKNOWN as UNKNOWN, keeps in-product signals apart from evidence, and shows the gate CLOSED with the privacy reminder", async () => {
    fetchMock.mockImplementation(() => ok(view([owner()])));
    render(<BetaCohortPage />);
    await screen.findByTestId("cohort-table");
    expect(screen.getByTestId("cohort-gate-value").textContent).toBe("CLOSED");
    const row = screen.getByText("CB1-001").closest("tr")!;
    const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent);
    // Understands / Trusts / Real action / Outcome are evidence: all UNKNOWN. The in-product decision is a separate column.
    expect(cells.filter((c) => c === "UNKNOWN").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("In-product decision")).toBeTruthy();
    expect(screen.getByText("In-product usefulness")).toBeTruthy();
    expect(cells).toContain("ACCEPTED");
    expect(screen.getByText(/Never type an owner.s financial figures/i)).toBeTruthy();
    expect(screen.getByText(/Ask: do you understand/)).toBeTruthy();
  });

  it("marks owners that are not counted (QA mechanics / fixture) and never lets them look like cohort evidence", async () => {
    const qa = owner({ assignment: { betaRequestId: "7f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e12", cohortId: "CB1", ownerCode: "CB1-009", kind: "QA_MECHANICS", assignedAt: "2026-10-20T00:00:00Z" }, countedInGate: false });
    fetchMock.mockImplementation(() => ok(view([qa])));
    render(<BetaCohortPage />);
    await screen.findByTestId("cohort-table");
    expect(screen.getByText("(not counted)")).toBeTruthy();
  });

  it("an empty cohort says so rather than showing a blank table", async () => {
    fetchMock.mockImplementation(() => ok(view([])));
    render(<BetaCohortPage />);
    expect(await screen.findByText(/No owners assigned yet/)).toBeTruthy();
  });

  it("a 403 shows the permission state, not the data", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: "Forbidden" }) }));
    render(<BetaCohortPage />);
    await waitFor(() => expect(screen.queryByTestId("cohort-table")).toBeNull());
    expect(screen.queryByText("CB1-001")).toBeNull();
  });

  it("an invalid form is explained from the shared schema and makes NO request", async () => {
    fetchMock.mockImplementation(() => ok(view([owner()])));
    render(<BetaCohortPage />);
    await screen.findByTestId("cohort-table");
    const callsBefore = fetchMock.mock.calls.length;
    // Choose the owner and an ISSUE with no summary → the schema (not the page) rejects it.
    const selects = document.querySelectorAll("select");
    const ownerSelect = Array.from(selects).find((s) => Array.from(s.options).some((o) => o.value === "6f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e11") && s.options.length === 2 && s.options[0].textContent === "(not stating)")!;
    fireEvent.change(ownerSelect, { target: { value: "6f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e11" } });
    const typeSelect = Array.from(document.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.value === "ISSUE_RESOLUTION"))!;
    fireEvent.change(typeSelect, { target: { value: "ISSUE" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // nothing posted
  });
});
