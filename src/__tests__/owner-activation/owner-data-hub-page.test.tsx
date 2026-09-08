/**
 * /owner/data page — proves the hub renders real readiness from the existing onboarding contract,
 * links to the existing intake surfaces, and never fabricates completeness.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import OwnerDataHubPage from "@/app/(authenticated)/owner/data/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerDataHubPage />
    </ActiveBusinessProvider>
  );
}

const fetchMock = vi.fn();
const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

const ONBOARDING = {
  businessName: "Test Co",
  suppliedCategories: ["revenue_sales"],
  requirements: {
    minimumRequired: ["revenue_sales", "expenses", "cash_debt"],
    recommended: ["marketing"],
    optional: [],
  },
  missingMinimum: [
    {
      category: "expenses",
      label: "Expense records",
      severity: "critical",
      why: "Your variable costs are needed to know if work is actually profitable.",
      decisionAffected: "margin, cost control, and which work to stop",
    },
  ],
  minimumSuppliedCount: 1,
  minimumRequiredCount: 3,
  minimumComplete: false,
  confidenceBeforeDiagnosis: "low",
  canRunFirstDiagnosis: false,
  firstAction: "Add last month's expenses.",
  whatNotToDo: ["Do not change prices yet."],
  nextBestUpload: "expenses",
  found: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockWithBusiness() {
  fetchMock.mockImplementation((url: string) =>
    url.includes("/api/owner/businesses")
      ? json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP" }] })
      : json(ONBOARDING),
  );
}

describe("no business yet", () => {
  it("shows the business profile as the blocking first step", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-create-business")).toBeTruthy());
    expect(screen.getByTestId("data-hub-create-business").textContent).toMatch(
      /Start with your business profile/i,
    );
    expect(screen.getByTestId("data-hub-business-name")).toBeTruthy();
  });

  it("does not offer readiness or categories before a business exists", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-create-business")).toBeTruthy());
    expect(container.querySelector('[data-testid="data-hub-readiness"]')).toBeNull();
    expect(container.querySelector('[data-testid="data-hub-group-money"]')).toBeNull();
  });
});

describe("with a business", () => {
  it("renders real readiness counts from the onboarding contract", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-readiness")).toBeTruthy());
    const band = screen.getByTestId("data-hub-readiness");
    expect(band.textContent).toContain("1 of 3 starter items added");
    expect(band.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("33");
    // Plain-language phrase, never the raw "low" enum token.
    expect(band.textContent).toContain("Early days");
    expect(band.textContent).not.toMatch(/\blow\b/i);
  });

  it("states plainly that there is not enough data for a trustworthy first assessment", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-insufficient")).toBeTruthy());
    expect(screen.getByTestId("data-hub-insufficient").textContent).toMatch(
      /does not yet have enough reliable business information for a trustworthy first assessment/i,
    );
  });

  it("shows what is missing, why, and which decision it affects", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-missing")).toBeTruthy());
    const missing = screen.getByTestId("data-hub-missing");
    expect(missing.textContent).toContain("Expense records");
    expect(missing.textContent).toContain("know if work is actually profitable");
    expect(missing.textContent).toContain("margin, cost control");
    // F1: "Expense records" is financial-snapshot-backed — the readiness engine reads it exclusively
    // from a real OwnerFinancialSnapshot, so the CTA must point at the real structured entry point
    // (/owner/finance's "+ Add financial snapshot" form), never manual-entry or a generic upload.
    expect(missing.querySelector("a")!.getAttribute("href")).toBe("/owner/finance");
  });

  it("renders all four category groups with real supplied counts", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-group-money")).toBeTruthy());
    for (const group of ["money", "people", "customers", "operations"]) {
      expect(screen.getByTestId(`data-hub-group-${group}`)).toBeTruthy();
    }
    // One supplied category (revenue_sales) sits in Money.
    expect(screen.getByTestId("data-hub-group-money").textContent).toContain("1 of 6 added");
    expect(screen.getByTestId("data-hub-group-people").textContent).toContain("0 of 4 added");
  });

  it("links to both existing intake surfaces without duplicating them", async () => {
    mockWithBusiness();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-readiness")).toBeTruthy());
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/owner/manual-entry");
    expect(hrefs).toContain("/owner/intake");
    expect(hrefs).toContain("/owner/onboarding");
    // The hub does not host its own upload form.
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("is honest that integrations are not available rather than rendering a dead control", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-integrations")).toBeTruthy());
    const card = screen.getByTestId("data-hub-integrations");
    expect(card.textContent).toMatch(/not available yet/i);
    expect(card.querySelector("a")).toBeNull();
  });

  it("offers the first assessment only once the gate opens", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses")
        ? json({ businesses: [{ id: "b1", name: "Test Co" }] })
        : json({ ...ONBOARDING, canRunFirstDiagnosis: true, missingMinimum: [] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-readiness")).toBeTruthy());
    expect(container.querySelector('[data-testid="data-hub-insufficient"]')).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    // F2: /diagnosis requires CAPABILITIES.ENGAGEMENT_CREATE, which a self-serve owner (the only
    // audience for this owner-only page) never holds — it always 403s for them. /owner/finance is
    // their real, working first-diagnosis flow.
    expect(hrefs).toContain("/owner/finance");
    expect(hrefs).not.toContain("/diagnosis");
  });

  it("surfaces an error without crashing when the onboarding call fails", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses")
        ? json({ businesses: [{ id: "b1", name: "Test Co" }] })
        : json({ error: "boom" }, false),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("editing an existing business's type", () => {
  function mockWithEditableBusiness(businessType = "generic_local_service") {
    const patchCalls: Array<{ url: string; body: unknown }> = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/owner/recovery/businesses/")) {
        patchCalls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
        return json({ id: "b1", businessType: "hospitality_food_service" });
      }
      if (url.includes("/api/owner/businesses")) {
        return json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP", businessType }] });
      }
      return json(ONBOARDING);
    });
    return patchCalls;
  }

  it("renders the current business type via the canonical 8-option list, not a duplicated one", async () => {
    mockWithEditableBusiness("retail_storefront");
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-business-type-editor")).toBeTruthy());
    const editor = screen.getByTestId("data-hub-business-type-editor");
    const select = editor.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("retail_storefront");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual([
      "laundry_local_service",
      "generic_local_service",
      "retail_service_hybrid",
      "retail_storefront",
      "field_mobile_service",
      "appointment_capacity_service",
      "hospitality_food_service",
      "b2b_project_contract_service",
    ]);
  });

  it("changing the selection PATCHes the governed business-update endpoint and confirms success", async () => {
    const patchCalls = mockWithEditableBusiness("generic_local_service");
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-business-type-editor")).toBeTruthy());
    const select = screen.getByTestId("data-hub-business-type-editor").querySelector("select")!;

    fireEvent.change(select, { target: { value: "hospitality_food_service" } });

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0].url).toBe("/api/owner/recovery/businesses/b1");
    expect(patchCalls[0].body).toEqual({ businessType: "hospitality_food_service" });
    await waitFor(() =>
      expect(screen.getByTestId("data-hub-business-type-editor").textContent).toMatch(/saved/i),
    );
  });

  it("shows an error without crashing when the PATCH fails", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/owner/recovery/businesses/")) return json({ error: "boom" }, false);
      if (url.includes("/api/owner/businesses")) {
        return json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP", businessType: "generic_local_service" }] });
      }
      return json(ONBOARDING);
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-business-type-editor")).toBeTruthy());
    const select = screen.getByTestId("data-hub-business-type-editor").querySelector("select")!;

    fireEvent.change(select, { target: { value: "hospitality_food_service" } });

    await waitFor(() =>
      expect(screen.getByTestId("data-hub-business-type-editor").querySelector('[role="alert"]')).toBeTruthy(),
    );
  });
});
