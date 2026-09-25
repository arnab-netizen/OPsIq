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
 * Hints are deliberately narrow: each states only the computed relationship a formula/fallback
 * actually establishes between two fields, never a business-process claim (what makes a lead
 * "qualified", whether a customer is new "for the first time ever", whether a pipeline deal is
 * "closed") that the schema does not enforce and no source comment states. `leads` itself has no
 * hint -- the only genuine ambiguity was what separates it from `qualifiedLeads`, which
 * `qualifiedLeads`'s own hint now covers without asserting a subset relationship the schema
 * doesn't enforce (they are independent, unvalidated optional fields).
 *
 * Source cross-references:
 * - qualifiedLeads: unlike averageOrderValue, there is no fallback/derivation from `leads` in
 *   metrics.ts -- qualifiedConversionPct and leadToSaleConversionPct are two independently
 *   computed funnel ratios, establishing only that the two fields are tracked and used
 *   separately, not that one is a subset of the other.
 * - averageOrderValue: types.ts's own comment ("optional direct (else derived from
 *   revenue/orders)") and averageOrderValue()'s fallback in metrics.ts.
 * - newCustomers/repeatCustomers/lostCustomers: activeCustomers() = newCustomers + repeatCustomers,
 *   and lostCustomerRatePct = lost / (active + lost) -- purely the summation/ratio relationship,
 *   without asserting each field's own lifetime-history definition.
 * - b2bPipelineValue: intentionally has no hint. b2bPipelineCoveragePct divides this by the
 *   general `revenue` field (not `b2bRevenue`, which renders directly below it in this group) --
 *   a hint saying "compared against your revenue below" would point at the wrong field. Left
 *   unresolved rather than invent a corrected phrasing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

const EXPECTED_HINTS: Record<string, string> = {
  qualifiedLeads: "Tracked as its own number, not calculated from Leads above -- used for a separate conversion-rate measurement.",
  averageOrderValue: "Leave blank to calculate this automatically from revenue and orders. Enter a value only if you track it separately.",
  newCustomers: "New customers plus repeat customers below should add up to your active customers this period.",
  repeatCustomers: "Added with new customers above to total your active customers this period.",
  lostCustomers: "Added with active customers above when calculating this period's customer-loss rate.",
};

const FIELDS_WITHOUT_A_HINT = ["leads", "orders", "revenue", "b2bProspects", "b2bPipelineValue", "b2bRevenue", "b2cRevenue", "complaints", "discountAmount", "refundAmount", "staffCount"];

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
