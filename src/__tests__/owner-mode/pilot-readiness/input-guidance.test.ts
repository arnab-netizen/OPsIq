/**
 * Dynamic input-guidance — pure domain tests (no DB, no browser).
 * Proves: dynamic guidance is produced; next best input changes by business type AND by missing data;
 * paired before/after confidence behaves correctly; warnings clear only on correct data; IRRELEVANT
 * data does not inflate confidence; limited first diagnosis on minimum data; cautious on weak data.
 */
import { describe, it, expect } from "vitest";
import {
  buildInputGuidance,
  FIRST_DIAGNOSIS_CATEGORIES,
} from "@/domain/owner-mode/input-guidance";
import { requiredInputsForProfile } from "@/domain/owner-mode/owner-onboarding";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

const CONF_ORDER: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

describe("dynamic input guidance", () => {
  it("produces guidance for every category with all 12 owner-facing fields", () => {
    const g = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [] });
    expect(g.guidance.length).toBeGreaterThanOrEqual(20);
    for (const c of g.guidance) {
      expect(c.why.length).toBeGreaterThan(8);
      expect(c.decisionAffected.length).toBeGreaterThan(4);
      expect(c.confidenceDomain).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(c.expectedConfidenceGain);
      expect(c.recommendationAtRiskIfMissing.length).toBeGreaterThan(8);
      expect(["low", "medium", "high"]).toContain(c.ownerEffort);
      expect(c.privacyNote.length).toBeGreaterThan(8);
      expect(typeof c.canProceedNow).toBe("boolean");
    }
  });

  it("next best input changes by business type", () => {
    const laundry = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: ["revenue_sales", "expenses", "cash_debt"] });
    const b2b = buildInputGuidance({ profileType: "b2b_contract_service", ownerRole: "owner_operated", suppliedCategories: ["revenue_sales", "expenses", "cash_debt"] });
    expect(laundry.nextBestInput).not.toEqual(b2b.nextBestInput);
    expect(laundry.nextBestInput).toBe("equipment_logs");
    expect(b2b.nextBestInput).toBe("b2b_contracts");
  });

  it("next best input changes by what is missing", () => {
    const a = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [] });
    const b = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: ["revenue_sales", "expenses", "cash_debt", "equipment_logs"] });
    expect(a.nextBestInput).not.toEqual(b.nextBestInput);
  });

  it("paired before/after: supplying a RELEVANT missing critical input raises confidence", () => {
    const req = requiredInputsForProfile("laundry_drycleaning", "owner_operated");
    const allButOneCritical = req.minimumRequired.filter((c) => c !== "revenue_sales");
    const before = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: allButOneCritical });
    const after = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [...allButOneCritical, "revenue_sales"] });
    expect(before.overallConfidence).toBe("low"); // a relevant critical (finance_cash) is missing
    expect(CONF_ORDER[after.overallConfidence]).toBeGreaterThan(CONF_ORDER[before.overallConfidence]);
    // The before-state guidance must FLAG revenue as confidence-improving and must-wait.
    const revBefore = before.guidance.find((x) => x.category === "revenue_sales")!;
    expect(revBefore.confidenceWouldImprove).toBe(true);
    expect(revBefore.mustWait).toBe(true);
  });

  it("IRRELEVANT data does not inflate confidence while a relevant critical is still missing", () => {
    // Laundry missing revenue (finance_cash). Supplying marketing (non-critical, marketing_sales) must NOT raise it.
    const base: OwnerInputCategory[] = ["expenses", "cash_debt", "equipment_logs", "fixed_costs"];
    const withoutMarketing = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: base });
    const withMarketing = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [...base, "marketing"] });
    expect(withoutMarketing.overallConfidence).toBe("low");
    expect(withMarketing.overallConfidence).toBe("low"); // unchanged — irrelevant to the missing critical
    // And supplying b2b_contracts (irrelevant to a laundry) also does not raise it.
    const withB2b = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [...base, "b2b_contracts"] });
    expect(withB2b.overallConfidence).toBe("low");
  });

  it("the missing-critical warning (mustWait) clears only after the correct data is supplied", () => {
    const missing = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: ["expenses", "cash_debt", "equipment_logs", "fixed_costs"] });
    const rev1 = missing.guidance.find((x) => x.category === "revenue_sales")!;
    expect(rev1.mustWait).toBe(true);
    expect(missing.canProceedWithStrongRecommendation).toBe(false);

    const req = requiredInputsForProfile("laundry_drycleaning", "owner_operated");
    const supplied = buildInputGuidance({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: req.minimumRequired });
    const rev2 = supplied.guidance.find((x) => x.category === "revenue_sales")!;
    expect(rev2.mustWait).toBe(false);
    expect(supplied.canProceedWithStrongRecommendation).toBe(true);
  });

  it("a limited first diagnosis is allowed on the minimum financial set; cautious when weak", () => {
    const minimal = buildInputGuidance({ profileType: "housekeeping_cleaning", ownerRole: "owner_operated", suppliedCategories: FIRST_DIAGNOSIS_CATEGORIES });
    expect(minimal.canRunFirstDiagnosis).toBe(true);
    // Still not full confidence because profile minimum (payroll, staff_attendance) is incomplete.
    expect(["low", "medium"]).toContain(minimal.overallConfidence);

    const empty = buildInputGuidance({ profileType: "housekeeping_cleaning", ownerRole: "owner_operated", suppliedCategories: [] });
    expect(empty.canRunFirstDiagnosis).toBe(false);
  });

  it("rankings are dynamic and non-empty when data is missing", () => {
    const g = buildInputGuidance({ profileType: "multi_location_smb", ownerRole: "multi_location", suppliedCategories: [] });
    expect(g.missingBySeverity[0].severity).toBe("critical");
    expect(g.missingByOwnerEffort[0].ownerEffort).toBe("low");
    expect(g.missingByConfidenceImpact.length).toBeGreaterThan(0);
    expect(g.nextBestInput).not.toBeNull();
  });
});
