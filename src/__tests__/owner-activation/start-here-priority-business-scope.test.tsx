/**
 * MP2-1: Start Here's "Review your first priorities" step must reflect the SELECTED business only.
 * Both surfaces (StartHerePage, StartHereContinuationCard) must request the business-scoped
 * process-execution list and derive the signal through the same helper, so another business's
 * engaged task — or an acted-on workspace-level task — can't tick a fresh business's checklist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StartHerePage from "@/app/(authenticated)/owner/start-here/page";
import { StartHereContinuationCard } from "@/components/owner/StartHereContinuationCard";
import { ActiveBusinessProvider } from "@/context/active-business-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const BIZ_NEW = { id: "biz-new", name: "Fresh Co", currency: "USD" };
const REQUIREMENTS = { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: ["customer_count", "sops_checklists"], optional: [] };

let tasks: Array<{ businessId: string | null; status: string }>;
let requested: string[];

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.includes("/api/owner/businesses")) return ok({ businesses: [BIZ_NEW] });
      if (url.includes("/api/owner/onboarding")) {
        return ok({ found: true, canRunFirstDiagnosis: true, missingMinimum: [], suppliedCategories: ["revenue_sales", "expenses", "cash_debt"], requirements: REQUIREMENTS });
      }
      if (url.includes("/api/owner/process-execution")) {
        requested.push(url);
        return ok({ tasks });
      }
      return ok({});
    }),
  );
}

beforeEach(() => {
  tasks = [];
  requested = [];
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = () => render(<ActiveBusinessProvider><StartHerePage /></ActiveBusinessProvider>);

describe("Start Here priority step is scoped to the selected business", () => {
  it("MP2-1F: the page requests the business-scoped process-execution list", async () => {
    renderPage();
    await screen.findByTestId("start-here-steps");
    expect(requested.length).toBeGreaterThan(0);
    for (const url of requested) expect(url).toBe(`/api/owner/process-execution?businessId=${encodeURIComponent(BIZ_NEW.id)}`);
  });

  it("MP2-1A/B/G: another business's, or a workspace-level, engaged task leaves the step incomplete for the fresh business", async () => {
    tasks = [{ businessId: "biz-old", status: "IN_PROGRESS" }, { businessId: null, status: "APPROVED" }];
    renderPage();
    const step = await screen.findByTestId("start-here-step-first_priorities");
    expect(step.textContent).not.toContain("✓");
  });

  it("MP2-1D: an engaged task of the selected business completes the step", async () => {
    tasks = [{ businessId: BIZ_NEW.id, status: "APPROVED" }];
    renderPage();
    const step = await screen.findByTestId("start-here-step-first_priorities");
    expect(step.textContent).toContain("✓");
  });
});

describe("StartHereContinuationCard is scoped to the selected business", () => {
  it("MP2-1F: requests the business-scoped list and still shows the next step when only another business is engaged", async () => {
    tasks = [{ businessId: "biz-old", status: "IN_PROGRESS" }];
    render(<StartHereContinuationCard businessId={BIZ_NEW.id} />);
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(requested[0]).toBe(`/api/owner/process-execution?businessId=${encodeURIComponent(BIZ_NEW.id)}`);
    await screen.findByTestId("start-here-continuation-card");
  });
});
