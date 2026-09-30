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
        "This is where you tell OpsIQ about your business and keep its information up to date. The more real information you add, the more specific its findings become — and it will always tell you what is still missing."
      )
    ).toBeTruthy();
  });
});

describe("first-read gate vs starter/profile evidence (A1-A3)", () => {
  const withEquipment = {
    ...ONBOARDING,
    suppliedCategories: [],
    requirements: {
      minimumRequired: ["revenue_sales", "expenses", "cash_debt", "equipment_logs"],
      recommended: [],
      optional: [],
    },
    minimumSuppliedCount: 0,
    minimumRequiredCount: 4,
    missingMinimum: [
      { category: "revenue_sales", label: "Revenue records", severity: "critical", why: "w", decisionAffected: "d" },
      { category: "equipment_logs", label: "Machine / equipment logs", severity: "critical", why: "w2", decisionAffected: "d2" },
    ],
  };
  function mock() {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses")
        ? json({ businesses: [{ id: "b1", name: "Test Co", currency: "GBP" }] })
        : json(withEquipment),
    );
  }

  it("A1: non-gate equipment evidence is never labelled as blocking the first read", async () => {
    mock();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-missing")).toBeTruthy());
    const items = Array.from(screen.getByTestId("data-hub-missing").querySelectorAll("li"));
    const equipment = items.find((li) => li.textContent!.includes("Machine / equipment logs"))!;
    expect(equipment.textContent).toContain("Improves confidence");
    expect(equipment.textContent).not.toMatch(/Urgent/);
    const group = screen.getByTestId("data-hub-group-operations").textContent!;
    expect(group).not.toMatch(/Needed for first read/);
  });

  it("A2: missing revenue stays clearly blocking", async () => {
    mock();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-missing")).toBeTruthy());
    const items = Array.from(screen.getByTestId("data-hub-missing").querySelectorAll("li"));
    expect(items.find((li) => li.textContent!.includes("Revenue records"))!.textContent).toContain("Urgent");
  });

  it("A3: first-read essentials and starter/profile evidence are presented separately", async () => {
    mock();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-readiness")).toBeTruthy());
    const band = screen.getByTestId("data-hub-readiness").textContent!;
    expect(band).toContain("First-read essentials: 0 of 3 added");
    expect(screen.getByTestId("data-hub-starter-profile").textContent).toContain("0 of 4 starter items added");
  });
});

describe("one obvious first-value path (F1, F4-F6)", () => {
  it("leads with one primary path to the Finance quick snapshot; manual entry and CSV stay available but secondary", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-primary-path")).toBeTruthy());
    const primary = screen.getByTestId("data-hub-primary-path");
    expect(primary.getAttribute("href")).toBe("/owner/finance");
    expect(primary.textContent).toContain("Enter my basic numbers");
    expect(primary.textContent).toMatch(/four numbers are enough/i);
    expect(primary.textContent).toMatch(/never invented/i);
    const secondary = screen.getByTestId("data-hub-secondary-paths");
    const hrefs = Array.from(secondary.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/owner/manual-entry");
    expect(hrefs).toContain("/owner/intake");
    expect(secondary.textContent).toContain("Add other business information");
    expect(secondary.textContent).toContain("Paste spreadsheet or CSV data");
    // Exactly one primary path.
    expect(document.querySelectorAll('[data-testid="data-hub-primary-path"]')).toHaveLength(1);
  });
});

describe("with a business", () => {
  it("renders real readiness counts from the onboarding contract", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-readiness")).toBeTruthy());
    const band = screen.getByTestId("data-hub-readiness");
    expect(band.textContent).toContain("1 of 3 starter items added");
    expect(band.textContent).toContain("First-read essentials: 1 of 3 added");
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

  it("renders all four category groups summarized as what's known / what's missing, not raw counts", async () => {
    mockWithBusiness();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("data-hub-group-money")).toBeTruthy());
    for (const group of ["money", "people", "customers", "operations"]) {
      expect(screen.getByTestId(`data-hub-group-${group}`)).toBeTruthy();
    }
    // One supplied category (revenue_sales) sits in Money — named plainly, not as a raw count.
    const money = screen.getByTestId("data-hub-group-money").textContent!;
    expect(money).toContain("Knows: Revenue / sales records");
    expect(money).toContain("Missing:");
    // Nothing supplied in People — says so in plain language rather than "0 of 4 added".
    expect(screen.getByTestId("data-hub-group-people").textContent).toContain("Nothing recorded yet");
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
