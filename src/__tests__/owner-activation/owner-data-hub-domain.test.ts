/**
 * Owner Data Hub domain model — proves the hub's presentation layer is complete, honest and
 * derived only from the existing input catalog.
 */
import { describe, it, expect } from "vitest";
import {
  OWNER_DATA_GROUPS,
  groupedCategories,
  inputTargetForCategory,
  manualEntrySectionForCategory,
  buildOwnerDataHubView,
  OWNER_DATA_CATEGORY_COUNT,
  BUSINESS_TYPE_OPTIONS,
} from "@/domain/owner-mode/owner-data-hub";
import { BUSINESS_TYPES } from "@/domain/founder-recovery/types";
import { OWNER_INPUT_CATEGORIES, INPUT_CATALOG } from "@/domain/owner-mode/input-catalog";
import { MANUAL_ENTRY_SECTIONS } from "@/domain/owner-mode/owner-manual-entry-form";

describe("owner data hub — grouping covers the whole catalog", () => {
  it("every catalog category appears in exactly one group", () => {
    const grouped = groupedCategories();
    expect(grouped.length).toBe(OWNER_INPUT_CATEGORIES.length);
    expect(new Set(grouped).size).toBe(grouped.length); // no duplicates
    for (const category of OWNER_INPUT_CATEGORIES) {
      expect(grouped).toContain(category);
    }
  });

  it("exposes the catalog size so the UI never hardcodes a count", () => {
    expect(OWNER_DATA_CATEGORY_COUNT).toBe(OWNER_INPUT_CATEGORIES.length);
  });

  it("every group has an owner-language label and purpose", () => {
    for (const group of OWNER_DATA_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.purpose.length).toBeGreaterThan(0);
      expect(group.categories.length).toBeGreaterThan(0);
    }
  });
});

describe("owner data hub — every category has a reachable input surface", () => {
  it("routes each category to a real structured entry point (finance snapshot, manual entry, or upload), never to a dead end", () => {
    for (const category of OWNER_INPUT_CATEGORIES) {
      const target = inputTargetForCategory(category);
      expect(["finance-snapshot", "manual-entry", "upload"]).toContain(target.route);
      expect(target.href.startsWith("/owner/")).toBe(true);
      expect(target.actionLabel.length).toBeGreaterThan(0);
    }
  });

  it("deep-links to the manual-entry section when the form covers the category and it is not financial-snapshot-backed", () => {
    const covered = MANUAL_ENTRY_SECTIONS[0];
    const target = inputTargetForCategory(covered.category);
    expect(target.route).toBe("manual-entry");
    expect(target.href).toBe(`/owner/manual-entry#${covered.id}`);
  });

  it("falls back to the governed upload path when no manual-entry section exists and the category is not financial-snapshot-backed", () => {
    const uncovered = OWNER_INPUT_CATEGORIES.find(
      (c) => manualEntrySectionForCategory(c) === null && inputTargetForCategory(c).route !== "finance-snapshot",
    );
    expect(uncovered).toBeDefined();
    expect(inputTargetForCategory(uncovered!).href).toBe("/owner/intake");
  });

  // F1: the readiness engine reads revenue/expenses/fixed costs/payroll/cash-debt-EMI exclusively
  // from the real OwnerFinancialSnapshot (see owner-onboarding.service.ts's
  // FINANCIAL_SNAPSHOT_BACKED_CATEGORIES) — so their CTA must point at /owner/finance's real
  // structured snapshot form, never at a manual-entry note or a generic upload page.
  it("routes every financial-snapshot-backed category straight to /owner/finance", () => {
    for (const category of ["revenue_sales", "expenses", "fixed_costs", "payroll", "cash_debt"] as const) {
      const target = inputTargetForCategory(category);
      expect(target.route).toBe("finance-snapshot");
      expect(target.href).toBe("/owner/finance");
    }
  });

  // F5: `staff_attendance`'s only two real data paths are a persisted OwnerCapacitySnapshot
  // (equipment/revenue-utilization data, not per-employee attendance) and a confirmed manual-entry
  // note under the "Owner workload" section — neither is real staff attendance/output data, so the
  // owner-facing label must not claim it collects that.
  it("staff_attendance is honestly labeled 'Owner workload', matching the one real manual-entry section that feeds it", () => {
    expect(INPUT_CATALOG.staff_attendance.label).toBe("Owner workload");
    expect(INPUT_CATALOG.staff_attendance.label).not.toMatch(/attendance/i);
    expect(INPUT_CATALOG.staff_attendance.label).not.toMatch(/output/i);
    const section = MANUAL_ENTRY_SECTIONS.find((s) => s.category === "staff_attendance")!;
    expect(section.title).toBe("Owner workload");
  });
});

describe("owner data hub — business type options match the accepted enum", () => {
  it("offers exactly the business types the governed create endpoint accepts", () => {
    // Regression: the hub originally offered retail/food_beverage/services/trades/manufacturing/other,
    // none of which are in BUSINESS_TYPES, so every business-profile submission returned 400.
    expect(BUSINESS_TYPE_OPTIONS.map((o) => o.value)).toEqual([...BUSINESS_TYPES]);
  });

  it("gives every accepted type an owner-facing label", () => {
    for (const option of BUSINESS_TYPE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.label).not.toBe(option.value); // not the raw enum key
    }
  });
});

describe("owner data hub — status reflects real supplied data only", () => {
  it("marks nothing as supplied when the workspace is empty", () => {
    const view = buildOwnerDataHubView({ suppliedCategories: [], minimumRequired: [], recommended: [] });
    for (const group of view) {
      expect(group.suppliedCount).toBe(0);
      for (const cat of group.categories) expect(cat.status).not.toBe("supplied");
    }
  });

  it("marks a category supplied only when it is in the supplied list", () => {
    const view = buildOwnerDataHubView({
      suppliedCategories: ["revenue_sales"],
      minimumRequired: ["revenue_sales", "expenses"],
      recommended: [],
    });
    const money = view.find((g) => g.id === "money")!;
    expect(money.categories.find((c) => c.category === "revenue_sales")!.status).toBe("supplied");
    expect(money.categories.find((c) => c.category === "expenses")!.status).toBe("missing_required");
    expect(money.suppliedCount).toBe(1);
  });

  it("distinguishes required, recommended and optional", () => {
    const view = buildOwnerDataHubView({
      suppliedCategories: [],
      minimumRequired: ["revenue_sales"],
      recommended: ["marketing"],
    });
    const all = view.flatMap((g) => g.categories);
    expect(all.find((c) => c.category === "revenue_sales")!.status).toBe("missing_required");
    expect(all.find((c) => c.category === "marketing")!.status).toBe("missing_recommended");
    expect(all.find((c) => c.category === "equipment_logs")!.status).toBe("optional");
  });

  it("carries the catalog's why / decision / at-risk copy through unchanged (no invented copy)", () => {
    const view = buildOwnerDataHubView({
      suppliedCategories: [],
      minimumRequired: [],
      recommended: [],
    });
    const revenue = view.flatMap((g) => g.categories).find((c) => c.category === "revenue_sales")!;
    expect(revenue.why).toBe(INPUT_CATALOG.revenue_sales.why);
    expect(revenue.decisionAffected).toBe(INPUT_CATALOG.revenue_sales.decisionAffected);
    expect(revenue.recommendationAtRiskIfMissing).toBe(
      INPUT_CATALOG.revenue_sales.recommendationAtRiskIfMissing,
    );
    expect(revenue.label).toBe(INPUT_CATALOG.revenue_sales.label);
  });

  it("never reports more supplied than the group holds", () => {
    const view = buildOwnerDataHubView({
      suppliedCategories: [...OWNER_INPUT_CATEGORIES],
      minimumRequired: [],
      recommended: [],
    });
    for (const group of view) {
      expect(group.suppliedCount).toBe(group.totalCount);
    }
  });
});
