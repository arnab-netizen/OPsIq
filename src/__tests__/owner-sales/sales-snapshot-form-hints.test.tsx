/**
 * Owner Sales page — snapshot form field hints.
 *
 * Hints were added only where SALES_FIELDS' field name alone is genuinely ambiguous and
 * src/domain/owner-sales/{types,metrics}.ts supports a specific clarification (see the source
 * comment above SALES_FIELDS in owner/sales/page.tsx). This test checks the hint text actually
 * rendered for each of those fields against that source, confirms fields with no listed ambiguity
 * render no hint, and confirms each rendered hint is programmatically associated with its input
 * (not just visually adjacent) -- it does not merely assert every hint string is non-empty.
 *
 * Source cross-references:
 * - qualifiedLeads / leads: qualifiedConversionPct and leadToSaleConversionPct
 *   (src/domain/owner-sales/metrics.ts) are two distinct funnel ratios, confirming qualifiedLeads
 *   is a subset of leads, not a separate count.
 * - averageOrderValue: types.ts's own comment ("optional direct (else derived from
 *   revenue/orders)") and averageOrderValue()'s fallback in metrics.ts.
 * - newCustomers/repeatCustomers/lostCustomers: activeCustomers() = newCustomers + repeatCustomers,
 *   and lostCustomerRatePct = lost / (active + lost) -- lost customers placed no order this period.
 * - b2bPipelineValue: b2bPipelineCoveragePct = b2bPipelineValue / revenue, confirming pipeline
 *   value is distinct from (not counted within) realized b2bRevenue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

const EXPECTED_HINTS: Record<string, string> = {
  leads: "All inquiries or contacts this period, before qualifying them.",
  qualifiedLeads: "Leads you've screened as good prospects — a subset of the leads above, not a separate count.",
  averageOrderValue: "Leave blank to calculate this automatically from revenue and orders. Enter a value only if you track it separately.",
  newCustomers: "Customers who ordered from you for the first time this period.",
  repeatCustomers: "Existing customers who ordered again this period.",
  lostCustomers: "Customers who had ordered before but placed no order this period.",
  b2bPipelineValue: "Value of B2B deals still in progress, not yet closed — separate from the B2B revenue you've already earned below.",
};

const FIELDS_WITHOUT_A_HINT = ["orders", "revenue", "b2bProspects", "b2bRevenue", "b2cRevenue", "complaints", "discountAmount", "refundAmount", "staffCount"];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }
      if (url.includes("/api/owner/sales/dashboard")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A], selectedBusinessId: BIZ_A.id, hasData: false, latestSnapshot: null, missingCriticalData: [] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Sales page — snapshot form hints", () => {
  it("renders the exact expected hint text for each field with a supported clarification", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add sales snapshot"));

    for (const [name, expectedText] of Object.entries(EXPECTED_HINTS)) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      expect(input, `expected an input named ${name}`).toBeTruthy();
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    }
  });

  it("programmatically associates each hint with its input via aria-describedby", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add sales snapshot"));

    for (const [name, expectedText] of Object.entries(EXPECTED_HINTS)) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      const describedById = input.getAttribute("aria-describedby");
      expect(describedById, `expected ${name} to have aria-describedby`).toBeTruthy();
      const description = document.getElementById(describedById!);
      expect(description, `expected a description node for ${name}`).toBeTruthy();
      expect(description).toHaveTextContent(expectedText);
    }
  });

  it("renders no hint text and no aria-describedby for fields with no supported clarification", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add sales snapshot"));

    for (const name of FIELDS_WITHOUT_A_HINT) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      expect(input, `expected an input named ${name}`).toBeTruthy();
      expect(input).not.toHaveAttribute("aria-describedby");
    }
  });
});
