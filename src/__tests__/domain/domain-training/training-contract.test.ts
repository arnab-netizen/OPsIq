import { describe, it, expect } from "vitest";
import {
  validateDomainContract,
  isDomainContractValid,
  assertValidDomainContract,
  InvalidDomainContractError,
  STANDARD_SCORING_RUBRIC,
  hasMinimumCases,
  type DomainContract,
} from "@/domain/domain-training/training-contract";
import { TrainingLevel, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const valid = (over: Partial<DomainContract> = {}): DomainContract => ({
  domainId: "D1",
  domainName: "Cash Survival",
  domainCategory: "economic_survival",
  archetypes: ["universal", "laundry"],
  requiredInputs: [{ key: "cash_on_hand", description: "current cash", critical: true }],
  optionalInputs: [{ key: "receivables", description: "money owed", critical: false }],
  minimumViableDataPack: ["cash_on_hand", "monthly_fixed_cost"],
  emergencyDataPack: ["cash_on_hand"],
  cannotAdviseThreshold: "LOW",
  diagnosticRubric: ["compute runway", "rank obligations"],
  decisionRules: ["if runway < 4 weeks → stabilize"],
  antiActionRules: ["no paid marketing under critical cash risk"],
  proofRules: [{ requirement: "bank/cash position", acceptableProofTypes: ["csv_upload", "screenshot"] }],
  verificationRules: [{ method: "re-check cash after collection", successMetric: "cash_on_hand recovered" }],
  stopRollbackRedesign: { stop: "stop if dispute", rollback: "pause collection", redesign: "rework if runway keeps falling" },
  severityRules: ["critical cash blocks growth"],
  confidenceRules: ["no HIGH confidence without verified bank position"],
  sideEffectMetrics: ["supplier reliability", "staff payroll", "quality"],
  learningEligibilityRules: ["no learning without verified outcome"],
  simulationCaseIds: [],
  scoringRubric: STANDARD_SCORING_RUBRIC,
  promotionGates: { minimumLevel: TrainingLevel.LEVEL_5_OUTCOME_VERIFIED, requiredScorePct: 90, hardFailOnUnsafe: true },
  ...over,
});

describe("domain training contract — module contract assertions", () => {
  it("validateDomainContract is a function", () => { expect(typeof validateDomainContract).toBe("function"); });
  it("isDomainContractValid is a function", () => { expect(typeof isDomainContractValid).toBe("function"); });
  it("assertValidDomainContract is a function", () => { expect(typeof assertValidDomainContract).toBe("function"); });
  it("InvalidDomainContractError is a class/function", () => { expect(typeof InvalidDomainContractError).toBe("function"); });
  it("STANDARD_SCORING_RUBRIC is defined", () => { expect(STANDARD_SCORING_RUBRIC).toBeDefined(); });
  it("hasMinimumCases is a function", () => { expect(typeof hasMinimumCases).toBe("function"); });
  it("TrainingLevel is an object", () => { expect(typeof TrainingLevel).toBe("object"); });
  it("MIN_CASES_PER_DOMAIN is a number", () => { expect(typeof MIN_CASES_PER_DOMAIN).toBe("number"); });
  it("valid is a function", () => { expect(typeof valid).toBe("function"); });
  it("valid() returns an object", () => { expect(typeof valid()).toBe("object"); });
  it("valid() has domainId field", () => { expect(valid()).toHaveProperty("domainId"); });
  it("valid().domainId equals 'D1'", () => { expect(valid().domainId).toBe("D1"); });
  it("isDomainContractValid(valid()) is true", () => { expect(isDomainContractValid(valid())).toBe(true); });
  it("InvalidDomainContractError.prototype is an instance of Error", () => { expect(InvalidDomainContractError.prototype).toBeInstanceOf(Error); });
});

describe("[F1] domain training contract validation", () => {
  it("accepts a complete contract", () => {
    expect(isDomainContractValid(valid())).toBe(true);
    expect(() => assertValidDomainContract(valid())).not.toThrow();
  });

  it("rejects missing required fields", () => {
    expect(validateDomainContract(valid({ domainId: "" }))).toContain("missing_domain_id");
    expect(validateDomainContract(valid({ requiredInputs: [] }))).toContain("missing_required_inputs");
    expect(validateDomainContract(valid({ archetypes: [] }))).toContain("missing_archetypes");
  });

  it("rejects a domain without proof rules", () => {
    expect(validateDomainContract(valid({ proofRules: [] }))).toContain("missing_proof_rules");
    expect(validateDomainContract(valid({ proofRules: [{ requirement: "", acceptableProofTypes: [] }] })))
      .toContain("incomplete_proof_rules");
  });

  it("rejects a domain without verification rules", () => {
    expect(validateDomainContract(valid({ verificationRules: [] }))).toContain("missing_verification_rules");
    expect(validateDomainContract(valid({ verificationRules: [{ method: "x", successMetric: "" }] })))
      .toContain("incomplete_verification_rules");
  });

  it("rejects a domain without stop/rollback/redesign rules", () => {
    expect(validateDomainContract(valid({ stopRollbackRedesign: { stop: "", rollback: "y", redesign: "z" } })))
      .toContain("missing_stop_rollback_redesign_rules");
  });

  it("rejects a domain without side-effect metrics or unsafe promotion gates", () => {
    expect(validateDomainContract(valid({ sideEffectMetrics: [] }))).toContain("missing_side_effect_metrics");
    expect(
      validateDomainContract(valid({ promotionGates: { minimumLevel: TrainingLevel.LEVEL_5_OUTCOME_VERIFIED, requiredScorePct: 90, hardFailOnUnsafe: false as unknown as true } }))
    ).toContain("missing_or_unsafe_promotion_gates");
  });

  it("assertValidDomainContract throws InvalidDomainContractError with violations", () => {
    try {
      assertValidDomainContract(valid({ proofRules: [], verificationRules: [] }));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidDomainContractError);
      expect((e as InvalidDomainContractError).violations).toEqual(
        expect.arrayContaining(["missing_proof_rules", "missing_verification_rules"])
      );
    }
  });

  it("hasMinimumCases enforces the 21-case floor", () => {
    expect(hasMinimumCases(valid({ simulationCaseIds: [] }))).toBe(false);
    expect(hasMinimumCases(valid({ simulationCaseIds: Array.from({ length: MIN_CASES_PER_DOMAIN }, (_, i) => `c${i}`) }))).toBe(true);
  });
});
