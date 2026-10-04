/**
 * Process-execution learning gate inputs fail closed (PR #585 amendment). No favourable default is ever invented.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildProcessLearningGateInput,
  gateOutcomeStatusFor,
  PROCESS_LEARNING_GATE_FACT_SOURCES,
  type ProcessLearningFacts,
} from "@/domain/execution/process-learning-gate-inputs";
import {
  AiMutationAttemptStatus,
  AttributionStatus,
  determineLearningEligibility,
  ImplementationQualityStatus,
  isLearningEligible,
  LearningEligibilityStatus,
  OutcomeStatus,
  OwnerLearningApproval,
  ProfitImpactConfidence,
  ProofGateStatus,
} from "@/domain/execution/learning-gate";

const FULL: ProcessLearningFacts = {
  classification: "SUCCESS",
  proofStatus: ProofGateStatus.ACCEPTED,
  proofRequired: true,
  implementationQuality: ImplementationQualityStatus.HIGH_QUALITY,
  attributionStatus: AttributionStatus.DIRECT,
  profitImpactRequired: false,
  profitImpactConfidence: ProfitImpactConfidence.MEASURED,
  ownerLearningApproval: OwnerLearningApproval.APPROVED,
  aiMutationAttempt: AiMutationAttemptStatus.NONE,
};

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("process learning gate inputs", () => {
  it("with no supplied facts nothing can be built: every required gate fact is unproven", () => {
    const r = buildProcessLearningGateInput({ classification: "SUCCESS" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toEqual(["proofStatus", "implementationQuality", "attributionStatus", "profitImpact", "ownerLearningApproval", "aiMutationStatus"]);
    }
  });
  it("7/8/9. a missing proof status, attribution or implementation quality each fail closed", () => {
    for (const [key, name] of [["proofStatus", "proofStatus"], ["attributionStatus", "attributionStatus"], ["implementationQuality", "implementationQuality"]] as const) {
      const r = buildProcessLearningGateInput({ ...FULL, [key]: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toContain(name);
    }
  });
  it("every source of a required fact is NONE today (no favourable default exists)", () => {
    expect(Object.values(PROCESS_LEARNING_GATE_FACT_SOURCES).every((v) => v === "NONE")).toBe(true);
  });
  it("with all real facts the unchanged gate decides", () => {
    const r = buildProcessLearningGateInput(FULL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(determineLearningEligibility(r.input)).toBe(LearningEligibilityStatus.ELIGIBLE_VERIFIED_SUCCESS);
  });
  it("12. external interference maps to ATTRIBUTION_UNCLEAR and the gate refuses it even with every other fact favourable", () => {
    expect(gateOutcomeStatusFor("EXTERNAL_EVENT_INTERFERENCE")).toBe(OutcomeStatus.ATTRIBUTION_UNCLEAR);
    const r = buildProcessLearningGateInput({ ...FULL, classification: "EXTERNAL_EVENT_INTERFERENCE" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const e = determineLearningEligibility(r.input);
      expect(isLearningEligible(e)).toBe(false);
      expect(e).toBe(LearningEligibilityStatus.BLOCKED_ATTRIBUTION_UNCLEAR);
    }
  });
  it("14. a disputed proof stays blocked", () => {
    const r = buildProcessLearningGateInput({ ...FULL, proofStatus: ProofGateStatus.DISPUTED });
    expect(r.ok && determineLearningEligibility(r.input)).toBe(LearningEligibilityStatus.BLOCKED_DISPUTED);
  });
  it("the service no longer contains the fabricated favourable gate defaults", () => {
    const src = read("src/services/owner-mode/owner-outcome-verification.service.ts");
    expect(src).not.toMatch(/ProofGateStatus\.ACCEPTED|ImplementationQualityStatus\.ACCEPTABLE|AttributionStatus\.LIKELY|OwnerLearningApproval\.NOT_REQUIRED|AiMutationAttemptStatus\.NONE|ESTIMATED_FROM_OWNER_INPUT/);
    expect(src).toContain("buildProcessLearningGateInput");
  });
  it("the learning gate itself is unchanged", () => {
    const src = read("src/domain/execution/learning-gate.ts");
    expect(src).toContain("Fail closed: any unmapped outcome is insufficient.");
    expect(Object.keys(LearningEligibilityStatus)).toHaveLength(12);
  });
});

describe("owner-visible surfaces show explicit external interference (13)", () => {
  it("cockpit and Now View label it explicitly, not as no-measurable-impact or success", () => {
    const cockpit = read("src/components/owner/MinimumOwnerCockpit.tsx");
    const now = read("src/services/owner-guidance/owner-now-view.service.ts");
    expect(cockpit).toMatch(/EXTERNAL_EVENT_INTERFERENCE: "External event interfered/);
    expect(now).toMatch(/EXTERNAL_EVENT_INTERFERENCE: "External event interfered"/);
    expect(cockpit).toMatch(/c === "PARTIAL_SUCCESS" \|\| c === "EXTERNAL_EVENT_INTERFERENCE" \? "warning-accessible"/);
    expect(cockpit).not.toMatch(/EXTERNAL_EVENT_INTERFERENCE:[^\n]*(No measurable|Success|Failure)/);
  });
});
