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

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
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
  // The business name is typed once at signup; with no business the owner is taken to the single first-run
  // surface (which prefills it) instead of being asked to create a business by hand on this page.
  it("sends the owner to the first-run surface, not a second business-name form", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("first-run-redirect")).toBeTruthy());
    const link = screen.getByRole("link", { name: /continue/i });
    expect(link.getAttribute("href")).toBe("/owner/first-run");
    expect(container.querySelector('[data-testid="data-hub-business-name"]')).toBeNull();
    expect(container.querySelector('input[name="name"]')).toBeNull();
  });

  it("does not offer readiness or categories before a business exists", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("first-run-redirect")).toBeTruthy());
    expect(container.querySelector('[data-testid="data-hub-readiness"]')).toBeNull();
    expect(container.querySelector('[data-testid="data-hub-group-money"]')).toBeNull();
  });
});

describe("page heading (shared PageHeader primitive)", () => {
  // Locks in the swap from a page-specific hand-rolled <h1> to the shared PageHeader primitive
  // (matching every other owner page) -- guards against a regression back to a duplicated or
  // missing heading, or dropped description text. Renders regardless of business state, so the
  // simplest (zero-business) mock is enough here.
  it("renders exactly one H1 with the exact title", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    renderPage();
    const heading = await screen.findByRole("heading", { level: 1, name: "My Business" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(heading.textContent).toBe("My Business");
  });

  it("preserves the exact description text under the heading", async () => {
    fetchMock.mockImplementation(() => json({ businesses: [] }));
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "My Business" });
    expect(
      screen.getByText(
        "Tell OpsIQ the basics and it will do the rest. You can add more detail whenever you like — it will always say what is still missing."
      )
    ).toBeTruthy();
  });
});

const FIRST_READ_MET = {
  sufficient: true,
  revenueKnown: true,
  costKnown: true,
  cashKnown: true,
  missing: [],
  basis: "completed",
};

describe("before the first read: one dominant quick-start path", () => {
  it("shows the quick financial picture and NONE of the category taxonomy", async () => {
    mockWithBusiness();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("quick-financial-picture-form")).toBeTruthy());
    expect(screen.getByTestId("data-hub-quick-start")).toBeTruthy();
    // No readiness band, missing-items list or category groups compete with the quick path.
    for (const id of ["data-hub-readiness", "data-hub-missing", "data-hub-group-money", "data-hub-group-operations", "data-hub-next-action", "data-hub-more-detail"]) {
      expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
    }
    expect(container.textContent).not.toMatch(/Needed for first read/);
  });

  it("shows exactly four numeric quick fields, no textarea, one primary action", async () => {
    mockWithBusiness();
    const { container } = renderPage();
    const form = await screen.findByTestId("quick-financial-picture-form");
    const textInputs = form.querySelectorAll('input[type="text"]');
    expect(textInputs).toHaveLength(4);
    expect(form.querySelector("textarea")).toBeNull();
    expect(form.querySelectorAll('[data-testid="quick-primary-action"]')).toHaveLength(1);
    // Currency is the business's own — shown, never asked.
    expect(form.textContent).toContain("(GBP)");
    expect(container.querySelector('input[name="currency"]')).toBeNull();
  });

  it("keeps manual entry, CSV and guided setup available but collapsed and secondary", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-other-ways")).toBeTruthy());
    const other = screen.getByTestId("data-hub-other-ways") as HTMLDetailsElement;
    expect(other.open).toBe(false);
    const hrefs = Array.from(other.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/owner/manual-entry");
    expect(hrefs).toContain("/owner/intake");
    expect(hrefs).toContain("/owner/onboarding");
    expect(screen.getByTestId("data-hub-integrations").textContent).toMatch(/not available yet/i);
  });

  it("is honest about saved-but-incomplete numbers without showing a checklist", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses")
        ? json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP" }] })
        : json({ ...ONBOARDING, firstRead: { ...FIRST_READ_MET, sufficient: false, cashKnown: false, missing: ["cashOnHand"] } }),
    );
    renderPage();
    const note = await screen.findByTestId("data-hub-existing-partial");
    expect(note.textContent).toMatch(/still needs cash in hand/);
  });
});

describe("after the first read is possible", () => {
  const READY = {
    ...ONBOARDING,
    canRunFirstDiagnosis: true,
    firstRead: FIRST_READ_MET,
    suppliedCategories: ["revenue_sales", "fixed_costs", "cash_debt"],
    requirements: {
      minimumRequired: ["revenue_sales", "expenses", "cash_debt", "equipment_logs"],
      recommended: [],
      optional: [],
    },
    minimumSuppliedCount: 2,
    minimumRequiredCount: 4,
    missingMinimum: [
      { category: "expenses", label: "Expense records", severity: "critical", why: "w", decisionAffected: "d" },
      { category: "equipment_logs", label: "Machine / equipment logs", severity: "critical", why: "w2", decisionAffected: "d2" },
    ],
    nextBestUpload: "equipment_logs",
  };
  function mockReady() {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses")
        ? json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP" }] })
        : json(READY),
    );
  }

  it("says enough for a first read WITHOUT claiming the whole business is known", async () => {
    mockReady();
    renderPage();
    const band = (await screen.findByTestId("data-hub-readiness")).textContent!;
    expect(band).toContain("Enough for a first read");
    expect(band).toMatch(/does not mean OpsIQ knows the whole business/);
    expect(band).not.toMatch(/100%|setup complete|fully set up/i);
    expect(screen.getByTestId("data-hub-starter-profile").textContent).toContain("2 of 4 starter items added");
  });

  it("asks ONE next question prominently, not a list of every missing category", async () => {
    mockReady();
    renderPage();
    const next = await screen.findByTestId("data-hub-next-question");
    expect(next.textContent).toContain("One thing would make this more reliable");
    expect(next.textContent).toContain("Machine / equipment logs");
    expect(next.textContent).not.toContain("Expense records");
  });

  it("keeps the full detail behind 'Add more detail' and never labels non-blocking items as blocking", async () => {
    mockReady();
    renderPage();
    const more = (await screen.findByTestId("data-hub-more-detail")) as HTMLDetailsElement;
    expect(more.open).toBe(false);
    const missing = more.querySelector('[data-testid="data-hub-missing"]')!;
    // Fixed-cost evidence satisfies the cost fact, so "Expense records" must not read as blocking.
    for (const li of Array.from(missing.querySelectorAll("li"))) {
      expect(li.textContent).toContain("Improves confidence");
      expect(li.textContent).not.toMatch(/Urgent/);
    }
    expect(more.querySelector('[data-testid="data-hub-group-money"]')).toBeTruthy();
    expect(more.textContent).not.toMatch(/Needed for first read/);
  });

  it("offers the first assessment once the gate opens, through the working Finance flow", async () => {
    mockReady();
    const { container } = renderPage();
    await screen.findByTestId("data-hub-readiness");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    // F2: /diagnosis requires CAPABILITIES.ENGAGEMENT_CREATE, which a self-serve owner never holds.
    expect(hrefs).toContain("/owner/finance");
    expect(hrefs).not.toContain("/diagnosis");
    expect(container.querySelector('[data-testid="quick-financial-picture-form"]')).toBeNull();
  });
});

describe("with a business", () => {
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
