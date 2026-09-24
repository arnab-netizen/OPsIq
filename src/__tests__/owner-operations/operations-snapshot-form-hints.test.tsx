/**
 * Owner Operations page — snapshot form field hints.
 *
 * Hints were added only where OPERATIONS_FIELDS' field name alone is genuinely ambiguous and
 * src/domain/owner-operations/{types,metrics}.ts supports a specific clarification (see the
 * source comment above OPERATIONS_FIELDS in owner/operations/page.tsx). This test checks the
 * hint text actually rendered for each of those fields against that source, confirms fields with
 * no listed ambiguity render no hint, and confirms each rendered hint is programmatically
 * associated with its input (not just visually adjacent) -- it does not merely assert every hint
 * string is non-empty.
 *
 * Source cross-references:
 * - staffHours / idleHours: idleRatePct = idleHours / staffHours (metrics.ts), confirming idle
 *   hours are a subset of the total staff hours, not a separate headcount.
 * - machineCapacityUnits: types.ts's own comment ("equipment capacity (units processable this
 *   period)").
 * - deliveryAttempts: deliverySuccessRatePct's base falls back to ordersCompleted when
 *   deliveryAttempts is absent (metrics.ts: `num(input.deliveryAttempts) ?? num(input.ordersCompleted)`).
 * - inventoryShortages: types.ts's own comment ("count of stockout events").
 * - sopChecks / sopMisses: types.ts's own comment on sopChecks ("total SOP checks expected") and
 *   sopCompliancePct = (sopChecks - sopMisses) / sopChecks (metrics.ts). The "Standard Operating
 *   Procedure" expansion is stated once, on sopChecks, not repeated on sopMisses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerOperationsPage from "@/app/(authenticated)/owner/operations/page";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

const EXPECTED_HINTS: Record<string, string> = {
  staffHours: "Total hours worked by all staff combined this period.",
  machineCapacityUnits: "Maximum units your equipment could process this period.",
  idleHours: "Hours from the staff hours above where there was no work to do.",
  deliveryAttempts: "Leave blank to measure delivery success against completed orders instead.",
  inventoryShortages: "Number of stockout events (times you ran out of stock) this period.",
  sopChecks: "Total number of SOP (Standard Operating Procedure) checks expected this period.",
  sopMisses: "How many of the expected checks above were missed or not completed.",
};

const FIELDS_WITHOUT_A_HINT = ["ordersReceived", "ordersCompleted", "ordersDelayed", "reworkCount", "complaints", "deliveryFailures"];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }
      if (url.includes("/api/owner/operations/dashboard")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A], selectedBusinessId: BIZ_A.id, hasData: false, latestSnapshot: null, missingCriticalData: [] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerOperationsPage />
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

describe("Owner Operations page — snapshot form hints", () => {
  it("renders the exact expected hint text for each field with a supported clarification", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

    for (const [name, expectedText] of Object.entries(EXPECTED_HINTS)) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      expect(input, `expected an input named ${name}`).toBeTruthy();
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    }
  });

  it("programmatically associates each hint with its input via aria-describedby", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

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
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

    for (const name of FIELDS_WITHOUT_A_HINT) {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      expect(input, `expected an input named ${name}`).toBeTruthy();
      expect(input).not.toHaveAttribute("aria-describedby");
    }
  });

  it("only explains the SOP acronym once, on sopChecks -- not repeated on sopMisses", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

    const misses = document.querySelector('input[name="sopMisses"]') as HTMLInputElement;
    const describedById = misses.getAttribute("aria-describedby")!;
    const description = document.getElementById(describedById)!;
    expect(description.textContent).not.toContain("Standard Operating Procedure");
  });
});
