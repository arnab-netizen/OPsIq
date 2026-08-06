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
  it("routes each category to manual entry or upload, never to a dead end", () => {
    for (const category of OWNER_INPUT_CATEGORIES) {
      const target = inputTargetForCategory(category);
      expect(["manual-entry", "upload"]).toContain(target.route);
      expect(target.href.startsWith("/owner/")).toBe(true);
      expect(target.actionLabel.length).toBeGreaterThan(0);
    }
  });

  it("deep-links to the manual-entry section when the form covers the category", () => {
    const covered = MANUAL_ENTRY_SECTIONS[0];
    const target = inputTargetForCategory(covered.category);
    expect(target.route).toBe("manual-entry");
    expect(target.href).toBe(`/owner/manual-entry#${covered.id}`);
  });

  it("falls back to the governed upload path when no manual-entry section exists", () => {
    const uncovered = OWNER_INPUT_CATEGORIES.find((c) => manualEntrySectionForCategory(c) === null);
    expect(uncovered).toBeDefined();
    expect(inputTargetForCategory(uncovered!).href).toBe("/owner/intake");
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
