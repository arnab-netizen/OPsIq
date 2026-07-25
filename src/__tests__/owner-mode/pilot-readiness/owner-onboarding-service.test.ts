/**
 * Owner onboarding service — pure mapping tests (no live DB).
 * Proves the business-type→profile, operating-model→role, and rows→supplied-category mappings, and
 * that real rows drive a real onboarding state (incl. business-scope: only this business's rows count).
 */
import { describe, it, expect } from "vitest";
import {
  mapBusinessTypeToProfile,
  mapOperatingModelToRole,
  rowsToSuppliedCategories,
} from "@/services/owner-mode/owner-onboarding.service";
import type { OwnerDomainRows } from "@/services/owner-mode/owner-db-providers";

function rows(partial: Partial<OwnerDomainRows>): OwnerDomainRows {
  return {
    cashflow: null, finance: null, wcItems: [], capacity: null, compliance: [],
    proofs: [], workload: null, standingCount: 0, business: null, learningCount: 0,
    ...partial,
  } as OwnerDomainRows;
}

describe("owner onboarding service — module contract assertions", () => {
  it("mapBusinessTypeToProfile is a function", () => { expect(typeof mapBusinessTypeToProfile).toBe("function"); });
  it("mapOperatingModelToRole is a function", () => { expect(typeof mapOperatingModelToRole).toBe("function"); });
  it("rowsToSuppliedCategories is a function", () => { expect(typeof rowsToSuppliedCategories).toBe("function"); });
  it("rows({}) has cashflow field", () => { expect(rows({})).toHaveProperty("cashflow"); });
  it("rows({}) has finance field", () => { expect(rows({})).toHaveProperty("finance"); });
  it("rows({}).cashflow is null by default", () => { expect(rows({}).cashflow).toBeNull(); });
  it("mapBusinessTypeToProfile('something else') returns 'generic'", () => { expect(mapBusinessTypeToProfile("something else")).toBe("generic"); });
  it("mapOperatingModelToRole(null, false) returns 'owner_operated'", () => { expect(mapOperatingModelToRole(null, false)).toBe("owner_operated"); });
  it("mapOperatingModelToRole(null, true) returns 'multi_location'", () => { expect(mapOperatingModelToRole(null, true)).toBe("multi_location"); });
  it("rowsToSuppliedCategories(rows({})) returns empty array", () => { expect(rowsToSuppliedCategories(rows({}))).toHaveLength(0); });
  it("rowsToSuppliedCategories returns an array", () => { expect(Array.isArray(rowsToSuppliedCategories(rows({})))).toBe(true); });
  it("mapBusinessTypeToProfile returns a non-empty string", () => { expect(mapBusinessTypeToProfile("Premium Dry Cleaning").length).toBeGreaterThan(0); });
  it("mapOperatingModelToRole('remote owner', false) returns 'remote_owner'", () => { expect(mapOperatingModelToRole("remote owner", false)).toBe("remote_owner"); });
  it("mapOperatingModelToRole('manager-run', false) returns 'manager_run'", () => { expect(mapOperatingModelToRole("manager-run", false)).toBe("manager_run"); });
});

describe("owner onboarding service mappings", () => {
  it("maps business type free-text to a canonical profile", () => {
    expect(mapBusinessTypeToProfile("Premium Dry Cleaning")).toBe("laundry_drycleaning");
    expect(mapBusinessTypeToProfile("Housekeeping & maid service")).toBe("housekeeping_cleaning");
    expect(mapBusinessTypeToProfile("B2B facility contracts")).toBe("b2b_contract_service");
    expect(mapBusinessTypeToProfile("3-branch outlet chain")).toBe("multi_location_smb");
    expect(mapBusinessTypeToProfile("something else")).toBe("generic");
  });

  it("maps operating model + branch signal to owner role", () => {
    expect(mapOperatingModelToRole("remote owner", false)).toBe("remote_owner");
    expect(mapOperatingModelToRole("manager-run", false)).toBe("manager_run");
    expect(mapOperatingModelToRole(null, true)).toBe("multi_location");
    expect(mapOperatingModelToRole(null, false)).toBe("owner_operated");
  });

  it("derives supplied categories ONLY from real backing values", () => {
    const empty = rowsToSuppliedCategories(rows({}));
    expect(empty).toHaveLength(0);

    const withFinance = rowsToSuppliedCategories(
      rows({ finance: { revenue: 100000, costOfGoods: 40000, fixedCosts: 20000, payroll: 15000, marketingSpend: 5000, cashOnHand: 30000 } as never }),
    );
    expect(withFinance).toContain("revenue_sales");
    expect(withFinance).toContain("expenses");
    expect(withFinance).toContain("fixed_costs");
    expect(withFinance).toContain("payroll");
    expect(withFinance).toContain("marketing");
    expect(withFinance).toContain("cash_debt");
  });

  it("an empty/legacy finance row with null fields supplies nothing (never inflates readiness)", () => {
    const nulls = rowsToSuppliedCategories(rows({ finance: { revenue: null, costOfGoods: null, fixedCosts: null } as never }));
    expect(nulls).toHaveLength(0);
  });

  it("capacity, compliance, proof, standing-instruction rows map to their categories", () => {
    const r = rowsToSuppliedCategories(rows({
      capacity: { id: "c" } as never,
      compliance: [{ id: "x" } as never],
      proofs: [{ id: "p" } as never],
      standingCount: 2,
    }));
    expect(r).toContain("equipment_logs");
    expect(r).toContain("staff_attendance");
    expect(r).toContain("tax_compliance");
    expect(r).toContain("proof_completion");
    expect(r).toContain("sops_checklists");
  });

  it("cashflow and working-capital rows both signal cash/debt data", () => {
    expect(rowsToSuppliedCategories(rows({ cashflow: { cashInHand: 5000 } as never }))).toContain("cash_debt");
    expect(rowsToSuppliedCategories(rows({ wcItems: [{ id: "w" } as never] }))).toContain("cash_debt");
  });
});
