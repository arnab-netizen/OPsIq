/**
 * Every finding code a domain rule file can emit must have an EXPLICIT business-priority class in
 * the canonical arbiter's table — a new rule code must never silently fall back to a default class.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  OWNER_PRIORITY_CLASS_BY_CODE,
  OWNER_PRIORITY_CLASSES,
  classifyOwnerFindingCode,
} from "@/domain/owner-spine/owner-decision";

const ROOT = path.resolve(__dirname, "../../domain");
const RULE_FILES: Array<[string, RegExp]> = [
  ["owner-finance/risk-rules.ts", /"(FIN_[A-Z0-9_]+)"/g],
  ["owner-finance/opportunity-rules.ts", /"(FIN_[A-Z0-9_]+)"/g],
  ["owner-cashflow/risk-rules.ts", /"(CF_[A-Z0-9_]+)"/g],
  ["owner-cashflow/opportunity-rules.ts", /"(CF_[A-Z0-9_]+)"/g],
  ["owner-sales/risk-rules.ts", /"(SALES_[A-Z0-9_]+)"/g],
  ["owner-sales/opportunity-rules.ts", /"(SALES_[A-Z0-9_]+)"/g],
  ["owner-operations/risk-rules.ts", /"(OPS_[A-Z0-9_]+)"/g],
  ["owner-operations/opportunity-rules.ts", /"(OPS_[A-Z0-9_]+)"/g],
  ["owner-sop/risk-rules.ts", /"(SOP_[A-Z0-9_]+)"/g],
  ["owner-sop/opportunity-rules.ts", /"(SOP_[A-Z0-9_]+)"/g],
  ["owner-marketing/risk-rules.ts", /"(MKT_[A-Z0-9_]+)"/g],
  ["owner-marketing/opportunity-rules.ts", /"(MKT_[A-Z0-9_]+)"/g],
  ["owner-strategy/risk-rules.ts", /"(STR_[A-Z0-9_]+)"/g],
  ["owner-strategy/opportunity-rules.ts", /"(STR_[A-Z0-9_]+)"/g],
  ["founder-recovery/diagnosis.ts", /code: "([A-Z0-9_]+)"/g],
];

function emittedCodes(): string[] {
  const codes = new Set<string>();
  for (const [file, re] of RULE_FILES) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(re)) codes.add(m[1]);
  }
  return [...codes].sort();
}

describe("canonical owner priority class table", () => {
  it("discovers the domain rule codes (sanity: the scan is not empty)", () => {
    expect(emittedCodes().length).toBeGreaterThan(100);
  });

  it("classifies every emitted finding code explicitly (no silent fallback)", () => {
    const unclassified = emittedCodes().filter((c) => !(c in OWNER_PRIORITY_CLASS_BY_CODE));
    expect(unclassified).toEqual([]);
  });

  it("assigns each code to exactly one known class", () => {
    for (const cls of Object.values(OWNER_PRIORITY_CLASS_BY_CODE)) {
      expect(OWNER_PRIORITY_CLASSES).toContain(cls);
    }
  });

  it("an unknown code can never outrank a known danger class", () => {
    expect(classifyOwnerFindingCode("ZZZ_BRAND_NEW_RULE")).toBe("GROWTH_OPPORTUNITY");
    expect(classifyOwnerFindingCode("NEWDOMAIN_MISSING_CRITICAL_DATA")).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(classifyOwnerFindingCode("NEWDOMAIN_OPP_DATA_QUALITY")).toBe("PROCESS_OPTIMISATION");
  });

  it("classes follow the documented business precedence", () => {
    expect(OWNER_PRIORITY_CLASSES).toEqual([
      "SAFETY_COMPLIANCE",
      "SURVIVAL_CASH",
      "CUSTOMER_SERVICE_FAILURE",
      "OVERLOAD_BLOCKING",
      "PROFIT_LOSS",
      "BLOCKED_EXECUTION",
      "MISSING_CRITICAL_EVIDENCE",
      "GROWTH_OPPORTUNITY",
      "PROCESS_OPTIMISATION",
    ]);
  });
});
