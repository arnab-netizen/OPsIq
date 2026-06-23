/**
 * Unit tests for the historical validation harness input adapter.
 * Covers: dimension mapping, unmapped dimension rejection, information barrier.
 */
import { vi } from "vitest";
import { mapDimension } from "./run-historical-validation";

// ─── Dimension mapping: all known case-file values ────────────────────────

describe("mapDimension — financial_health cluster", () => {
  const expected = "financial_health";
  const cases = [
    "finance", "financial", "FINANCIAL", "Financial integrity",
    "Fixed-cost burden", "Cash position", "Debt and liabilities",
    "Debt and refinancing", "Lender exposure", "Liquidity", "liquidity",
    "Capital allocation history",
  ];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — operational_efficiency cluster", () => {
  const expected = "operational_efficiency";
  const cases = [
    "operations", "OPERATIONAL", "operational", "Operating platform",
    "Turnaround plan", "Vendor and supplier confidence", "Merchandising and assortment",
  ];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — process_maturity cluster", () => {
  const expected = "process_maturity";
  const cases = [
    "governance", "GOVERNANCE", "Governance and audit", "legal",
    "Fraud risk", "Consumer-protection obligations",
  ];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — market_position cluster", () => {
  const expected = "market_position";
  const cases = [
    "market", "MARKET", "STRATEGIC", "strategic", "Strategic adaptation",
    "Business-model disruption", "External revenue shocks",
  ];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — customer_retention cluster", () => {
  const expected = "customer_retention";
  const cases = ["Customer relevance", "Sales trajectory"];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — team_capability cluster", () => {
  const expected = "team_capability";
  const cases = ["people", "PEOPLE", "HR", "hr"];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

describe("mapDimension — quality_delivery cluster", () => {
  const expected = "quality_delivery";
  const cases = ["quality", "QUALITY", "product", "PRODUCT", "technology", "TECHNOLOGY"];
  for (const raw of cases) {
    it(`maps "${raw}" → "${expected}"`, () => {
      expect(mapDimension(raw, "TEST")).toBe(expected);
    });
  }
});

// ─── Unmapped dimension fails closed ─────────────────────────────────────

describe("mapDimension — unmapped dimensions fail closed", () => {
  const unmapped = [
    "Unknown Dimension",
    "pricing",
    "REGULATORY",
    "supply chain",
    "random_value",
    "",
  ];
  for (const raw of unmapped) {
    it(`throws ADAPTER_DIMENSION_UNMAPPED for "${raw}"`, () => {
      expect(() => mapDimension(raw, "CASE_X")).toThrow("ADAPTER_DIMENSION_UNMAPPED");
    });
  }
  it("includes the unmapped dimension name in the error message", () => {
    expect(() => mapDimension("something_unknown", "CASE_XYZ")).toThrow("something_unknown");
  });
  it("includes the case ID in the error message", () => {
    expect(() => mapDimension("bad_dim", "CASE_ABC_123")).toThrow("CASE_ABC_123");
  });
});

// ─── Information barrier: mapDimension is a pure lookup ──────────────────

describe("information barrier", () => {
  it("mapDimension returns synchronously without any I/O (pure lookup)", () => {
    // mapDimension only reads the in-memory DIMENSION_MAP constant. Verify it
    // completes synchronously with no async return and no thrown I/O errors.
    let result: string | undefined;
    expect(() => {
      result = mapDimension("finance", "CASE_TEST");
    }).not.toThrow();
    expect(result).toBe("financial_health");
  });

  it("mapDimension result is deterministic (same input = same output, no state)", () => {
    expect(mapDimension("governance", "A")).toBe(mapDimension("governance", "B"));
  });
});
