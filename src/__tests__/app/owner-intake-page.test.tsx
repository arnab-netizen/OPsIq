/**
 * Owner UI — Data Intake page (owner-visibility proof).
 *
 * Post-merge live-verification found /owner/intake exposing raw internal field identifiers
 * (e.g. domain field names like "cashOnHand") in the confirm-candidate preview table/error list,
 * plus an inconsistent lowercase "confirmed" badge next to Title Case badges elsewhere on the
 * same page. This proves both are fixed: humanized labels render, the raw camelCase identifier
 * never leaks as its own text node, and the "Confirmed" badge matches the page's Title Case
 * convention.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/owner/intake" }));

import OwnerIntakePage from "@/app/(authenticated)/owner/intake/page";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const BUSINESS = { id: "b1", name: "Acme", businessType: "retail", currency: "INR", isActive: true };

function mockFetch(intakes: unknown[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, json: async () => body } as unknown as Response);
    if (url.includes("/api/owner/businesses")) {
      return json({ businesses: [BUSINESS] });
    }
    if (url.includes("/api/owner/intake/dashboard")) {
      return json({ intakes, hasData: intakes.length > 0 });
    }
    if (url.includes("/uploads") && init?.method === "POST") {
      return json({
        id: "intake-1",
        targetDomain: "finance",
        source: "csv_upload",
        rowCount: 1,
        validationStatus: "valid",
        normalizationStatus: "normalized",
        unmappedColumns: [],
        errorReport: [{ row: 1, field: "cashOnHand", message: "Value looks unusually low." }],
        records: [{ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", cashOnHand: 1000 }],
      });
    }
    return json({});
  });
}

describe("Owner Data Intake page", () => {
  it("humanizes internal field identifiers in the candidate preview table and error list, without leaking the raw camelCase token", async () => {
    mockFetch();
    const { container, findByText, getByLabelText } = renderWithProvider(<OwnerIntakePage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Data Intake"));

    fireEvent.click(await findByText("+ Upload data"));
    fireEvent.change(getByLabelText("Target domain"), { target: { value: "finance" } });
    fireEvent.change(getByLabelText("Source"), { target: { value: "csv_upload" } });
    fireEvent.change(container.querySelector("#intake-csv-text")!, {
      target: { value: "periodStart,periodEnd,currency,cashOnHand\n2026-05-01,2026-05-31,INR,1000" },
    });
    fireEvent.click(await findByText("Validate + normalize"));

    await findByText("Candidate — review before confirming");
    const text = container.textContent ?? "";

    // Real field label (authored on the finance IntakeFieldSpec) and the generic humanizer
    // fallback both render in place of the raw identifiers.
    expect(text).toContain("Period start");
    expect(text).toContain("Cash on hand");
    expect(text).not.toContain("cashOnHand");
    expect(text).not.toContain("periodStart");
  });

  it("shows the owner-confirmed badge as Title Case, matching every other badge on the page", async () => {
    mockFetch([
      {
        id: "intake-1",
        targetDomain: "finance",
        source: "csv_upload",
        rowCount: 1,
        createdAt: "2026-05-01T00:00:00Z",
        validationStatus: "valid",
        ownerConfirmed: true,
      },
    ]);
    const { findByText, queryByText } = renderWithProvider(<OwnerIntakePage />);
    await findByText("Confirmed");
    expect(queryByText("confirmed")).toBeNull();
  });

  // Live production verification (post-#488) found "Intake history" rendering raw
  // OwnerInputCategory values ("cash_debt", "equipment_logs") -- these come from the
  // manual-entry write path (owner-manual-entry.service.ts persists the raw category as
  // targetDomain), a different source than the CSV-upload path's 5-value DOMAIN_LABEL map that
  // PR #488 already covered for the candidate-preview table.
  it("humanizes manual-entry OwnerInputCategory values in the intake history list, without leaking the raw snake_case identifier", async () => {
    mockFetch([
      {
        id: "intake-1",
        targetDomain: "cash_debt",
        source: "manual_form",
        rowCount: 1,
        createdAt: "2026-05-01T00:00:00Z",
        validationStatus: "valid",
        ownerConfirmed: true,
      },
      {
        id: "intake-2",
        targetDomain: "equipment_logs",
        source: "manual_form",
        rowCount: 1,
        createdAt: "2026-05-02T00:00:00Z",
        validationStatus: "valid",
        ownerConfirmed: true,
      },
    ]);
    const { container, findByText } = renderWithProvider(<OwnerIntakePage />);
    await findByText("Intake history (2)");
    const text = container.textContent ?? "";

    // Real canonical labels from domain/owner-mode/input-catalog.ts's INPUT_CATALOG.
    expect(text).toContain("Cash / debt / EMI obligations");
    expect(text).toContain("Machine / equipment logs");
    expect(text).not.toContain("cash_debt");
    expect(text).not.toContain("equipment_logs");
  });

  it("still humanizes CSV-upload targetDomain values (DOMAIN_LABEL) in the intake history list, unchanged from before", async () => {
    mockFetch([
      {
        id: "intake-1",
        targetDomain: "finance",
        source: "csv_upload",
        rowCount: 3,
        createdAt: "2026-05-01T00:00:00Z",
        validationStatus: "valid",
        ownerConfirmed: true,
      },
    ]);
    const { container, findByText } = renderWithProvider(<OwnerIntakePage />);
    await findByText("Intake history (1)");
    const text = container.textContent ?? "";
    expect(text).toContain("Finance");
  });

  it("falls back to a human-readable label (never raw or blank) for a targetDomain outside both known taxonomies", async () => {
    mockFetch([
      {
        id: "intake-1",
        targetDomain: "some_future_category",
        source: "manual_form",
        rowCount: 1,
        createdAt: "2026-05-01T00:00:00Z",
        validationStatus: "valid",
        ownerConfirmed: true,
      },
    ]);
    const { container, findByText } = renderWithProvider(<OwnerIntakePage />);
    await findByText("Intake history (1)");
    const text = container.textContent ?? "";
    expect(text).toContain("Some future category");
    expect(text).not.toContain("some_future_category");
  });
});
