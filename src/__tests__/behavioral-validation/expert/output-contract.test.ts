import { describe, it, expect } from "vitest";
import { validateOutputContract, buildContractReport, CONTRACT_SECTIONS } from "@/behavioral-validation/expert/output-contract";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const cash = SEED_CASES.find((c) => c.id === "A1")!; // high-risk + finance + operational + high-sensitivity
const compliance = SEED_CASES.find((c) => c.flags.complianceRisk)!;

describe("expert output-contract — module contract assertions", () => {
  it("validateOutputContract is a function", () => { expect(typeof validateOutputContract).toBe("function"); });
  it("buildContractReport is a function", () => { expect(typeof buildContractReport).toBe("function"); });
  it("CONTRACT_SECTIONS is an array", () => { expect(Array.isArray(CONTRACT_SECTIONS)).toBe(true); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("cash is defined", () => { expect(cash).toBeDefined(); });
  it("compliance is defined", () => { expect(compliance).toBeDefined(); });
  it("CONTRACT_SECTIONS.length equals 22", () => { expect(CONTRACT_SECTIONS.length).toBe(22); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("validateOutputContract(cash, baseAdvise(cash)) returns an object", () => { expect(typeof validateOutputContract(cash, baseAdvise(cash))).toBe("object"); });
  it("validateOutputContract(cash, baseAdvise(cash)).passed is true", () => { expect(validateOutputContract(cash, baseAdvise(cash)).passed).toBe(true); });
  it("validateOutputContract result has missingRequired field", () => { expect(validateOutputContract(cash, baseAdvise(cash))).toHaveProperty("missingRequired"); });
  it("buildContractReport([]) returns an object", () => { expect(typeof buildContractReport([])).toBe("object"); });
  it("buildContractReport([]) has passRate field", () => { expect(buildContractReport([])).toHaveProperty("passRate"); });
});

describe("expert output contract", () => {
  it("defines 22 contract sections", () => {
    expect(CONTRACT_SECTIONS.length).toBe(22);
  });

  it("missing root cause fails the contract", () => {
    const v = validateOutputContract(cash, { ...baseAdvise(cash), rootCause: undefined });
    expect(v.passed).toBe(false);
    expect(v.missingRequired).toContain("rootCause");
  });

  it("missing what-not-to-do fails in a high-risk case", () => {
    const v = validateOutputContract(cash, { ...baseAdvise(cash), whatNotToDo: [] });
    expect(v.missingRequired).toContain("whatNotToDo");
  });

  it("missing calculation trace fails a finance case", () => {
    const v = validateOutputContract(cash, { ...baseAdvise(cash), calculationTrace: [] });
    expect(v.missingRequired).toContain("calculationTrace");
  });

  it("missing proof fails an operational case", () => {
    const v = validateOutputContract(cash, { ...baseAdvise(cash), proofRequired: [] });
    expect(v.missingRequired).toContain("proofRequired");
  });

  it("missing reassessment fails a high-risk case", () => {
    const v = validateOutputContract(cash, { ...baseAdvise(cash), reassessmentTrigger: undefined });
    expect(v.missingRequired).toContain("reassessment");
  });

  it("missing professional-review fails a compliance case", () => {
    const v = validateOutputContract(compliance, { ...baseAdvise(compliance), professionalReview: undefined });
    expect(v.missingRequired).toContain("professionalReview");
  });

  it("the base advisor satisfies the contract on its relevant cases", () => {
    const failures = SEED_CASES.filter((c) => !validateOutputContract(c, baseAdvise(c)).passed);
    expect(failures.map((c) => c.id)).toEqual([]);
  });

  it("a contract report aggregates pass rate and most-missed sections", () => {
    const report = buildContractReport(SEED_CASES.map((c) => validateOutputContract(c, baseAdvise(c))));
    expect(report.count).toBe(SEED_CASES.length);
    expect(report.passRate).toBe(100);
  });
});
