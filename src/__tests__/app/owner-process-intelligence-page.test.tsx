/**
 * Owner Process Intelligence page — jsdom integration test (browser-free).
 *
 * Stubs fetch to serve the now-view payload and asserts the page loads the process-intelligence block,
 * renders the top breakdown, links back to the Owner Now View, and shows a safe error on failure.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import OwnerProcessIntelligencePage from "@/app/(authenticated)/owner/process-intelligence/page";

const PAYLOAD = {
  processIntelligence: {
    topFinding: {
      findingType: "ESCALATION_RESPONSE_BREAKDOWN", severity: "HIGH", confidence: "MEDIUM", affectedStage: "ESCALATION_RESPONSE",
      affectedActorId: null, affectedManagerId: "mgr-1", supportingProofIds: [], supportingOperationalEventIds: [],
      supportingEscalationIds: ["esc1", "esc2"], supportingAdjudicationIds: [], relatedProfitLeak: null, relatedConstraint: "MANAGER",
      relatedSLO: "ANTI_GAMING_RISK", ownerExplanation: "Escalations are reaching this manager but not being acknowledged in time.",
      recommendedCorrectiveAction: "Reassign the overdue escalations and set a hard acknowledgement deadline.",
      expectedImpactType: "TRUST_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    },
    findings: [],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/owner/now-view")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PAYLOAD) } as Response);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OwnerProcessIntelligencePage", () => {
  it("loads the process-intelligence block, renders the top breakdown, and links back to the Now View", async () => {
    const { container, findByTestId } = render(<OwnerProcessIntelligencePage />);
    await findByTestId("process-intelligence-panel");
    expect(container.textContent ?? "").toMatch(/Escalation response breakdown/i);
    expect(container.textContent ?? "").toMatch(/Reassign the overdue escalations/i);
    const back = container.querySelector('[data-testid="back-to-now"]') as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/owner/now");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/owner/now-view"))).toBe(true);
  });

  it("shows a safe error (no raw internal detail) when the request fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    const { findByTestId } = render(<OwnerProcessIntelligencePage />);
    const err = await findByTestId("pi-error");
    expect(err.textContent ?? "").toMatch(/not authorized/i);
    expect(err.textContent ?? "").not.toMatch(/stack|Prisma|undefined/i);
  });
});
