/**
 * /owner/execution — presentation-only regression proof (UX-05B, cosmetic scope only).
 *
 * Covers exactly two authorized candidates from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:
 *  - Candidate 3: ACTION_STATUS_LABEL was missing "cancelled" (RECOVERY_ACTION_STATUSES' own
 *    terminal value) and would have rendered the literal lowercase token.
 *  - Candidate 2 (conditional): every catch path rendered the raw Error.message instead of the
 *    governed classifyOperatorError() text Money/Sales/Operations already use. Verified here as a
 *    pure display-text substitution: no new branch, retry, or navigation is exercised by these tests.
 *
 * No race-guard (Candidate 1) behavior is implemented or tested here -- that remains a separate,
 * functional-correctness change requiring its own authorization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { hasOperatorUnsafeContent } from "@/lib/operator-error-governance";

const BIZ_A = { id: "biz-a", name: "Trinity Services", currency: "USD" };

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

function dashboardWithCancelledAction() {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: "snap-1", missingCriticalData: [] },
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
          status: "cancelled",
          verifications: [],
        },
      ],
    },
    cycleHistory: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Candidate 3 — /owner/execution 'cancelled' action label", () => {
  it("renders 'Cancelled', never the raw lowercase 'cancelled' token", async () => {
    window.localStorage.setItem("opsiq.lastActiveBusinessId", BIZ_A.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
        }
        if (url.includes("/api/owner/sop/dashboard")) {
          return { ok: true, status: 200, json: async () => dashboardWithCancelledAction() } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    renderWithProvider(<OwnerExecutionPage />);

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("cancelled")).not.toBeInTheDocument();
  });
});

describe("Candidate 2 (conditional) — /owner/execution governed error text", () => {
  it("load() failure renders governed text, never the raw exception message, with no retry/navigation added", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
        }
        if (url.includes("/api/owner/sop/dashboard")) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "PrismaClientKnownRequestError: P2007 at /var/task/db.ts" }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    renderWithProvider(<OwnerExecutionPage />);

    const errorBanner = await waitFor(() => {
      const el = document.querySelector(".text-destructive");
      if (!el || !el.textContent) throw new Error("error banner not rendered yet");
      return el;
    });
    const text = errorBanner.textContent ?? "";
    expect(text).not.toMatch(/Prisma|P2007|var\/task/);
    expect(hasOperatorUnsafeContent(text)).toBe(false);
  });

  it("createBusiness failure renders governed text, never the raw exception message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return { ok: true, status: 200, json: async () => ({ businesses: [] }) } as Response;
        }
        if (url.includes("/api/owner/sop/dashboard")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ businesses: [], selectedBusinessId: null, hasData: false, missingCriticalData: [] }),
          } as Response;
        }
        if (url.includes("/api/owner/recovery/businesses") && init?.method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "PrismaClientKnownRequestError: unique constraint" }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    renderWithProvider(<OwnerExecutionPage />);
    await screen.findByText(/No businesses yet/);

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
    const form = await screen.findByRole("heading", { name: "Create a business" });
    expect(form).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Test Co" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "INR" } });
    fireEvent.click(screen.getByRole("button", { name: /Create business/ }));

    const errorBanner = await waitFor(() => {
      const el = document.querySelector(".text-destructive");
      if (!el || !el.textContent) throw new Error("error banner not rendered yet");
      return el;
    });
    const text = errorBanner.textContent ?? "";
    expect(text).not.toMatch(/Prisma|constraint/);
    expect(hasOperatorUnsafeContent(text)).toBe(false);
  });
});
