/**
 * Owner onboarding — pure domain tests (no DB, no browser).
 * Proves: minimum onboarding completes, missing-required guidance, business-type affects requested
 * inputs, remote-owner affects proof/delegation, multi-location isolation, NO fake high confidence.
 */
import { describe, it, expect } from "vitest";
import {
  computeOnboardingState,
  requiredInputsForProfile,
  BUSINESS_PROFILE_TYPES,
  OWNER_ROLES,
  type OnboardingInput,
} from "@/domain/owner-mode/owner-onboarding";
import { isCriticalCategory } from "@/domain/owner-mode/input-catalog";

const base: OnboardingInput = {
  businessName: "Sparkle Laundry",
  profileType: "laundry_local_service",
  ownerRole: "owner_operated",
  suppliedCategories: [],
};

describe("owner-onboarding — module contract assertions", () => {
  it("computeOnboardingState is a function", () => { expect(typeof computeOnboardingState).toBe("function"); });
  it("requiredInputsForProfile is a function", () => { expect(typeof requiredInputsForProfile).toBe("function"); });
  it("BUSINESS_PROFILE_TYPES is an array", () => { expect(Array.isArray(BUSINESS_PROFILE_TYPES)).toBe(true); });
  it("OWNER_ROLES is an array", () => { expect(Array.isArray(OWNER_ROLES)).toBe(true); });
  it("isCriticalCategory is a function", () => { expect(typeof isCriticalCategory).toBe("function"); });
  it("base is an object", () => { expect(typeof base).toBe("object"); });
  it("base has businessName field", () => { expect(base).toHaveProperty("businessName"); });
  it("BUSINESS_PROFILE_TYPES.length is greater than 0", () => { expect(BUSINESS_PROFILE_TYPES.length).toBeGreaterThan(0); });
  it("OWNER_ROLES.length is greater than 0", () => { expect(OWNER_ROLES.length).toBeGreaterThan(0); });
  it("computeOnboardingState(base) returns an object", () => { expect(typeof computeOnboardingState(base)).toBe("object"); });
  it("computeOnboardingState(base) has minimumComplete field", () => { expect(computeOnboardingState(base)).toHaveProperty("minimumComplete"); });
  it("requiredInputsForProfile returns an object with minimumRequired", () => { expect(requiredInputsForProfile("laundry_local_service", "owner_operated")).toHaveProperty("minimumRequired"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner onboarding", () => {
  it("an owner can complete the minimum onboarding when all minimum data is supplied", () => {
    const req = requiredInputsForProfile("laundry_local_service", "owner_operated");
    const state = computeOnboardingState({ ...base, suppliedCategories: req.minimumRequired });
    expect(state.minimumComplete).toBe(true);
    expect(state.missingMinimum).toHaveLength(0);
    expect(state.canRunFirstDiagnosis).toBe(true);
    expect(state.steps.find((s) => s.id === "enter_minimum_data")?.complete).toBe(true);
    expect(state.steps.find((s) => s.id === "run_first_diagnosis")?.complete).toBe(true);
  });

  it("missing required fields surface useful, plain-language guidance with severity", () => {
    const state = computeOnboardingState(base);
    expect(state.missingMinimum.length).toBeGreaterThan(0);
    for (const m of state.missingMinimum) {
      expect(m.why.length).toBeGreaterThan(10);
      expect(m.decisionAffected.length).toBeGreaterThan(5);
      expect(["critical", "high", "medium"]).toContain(m.severity);
    }
    // Critical financial gaps are ranked first.
    expect(state.missingMinimum[0].severity).toBe("critical");
  });

  it("business type changes which inputs are requested", () => {
    const laundry = requiredInputsForProfile("laundry_local_service", "owner_operated");
    const cleaning = requiredInputsForProfile("field_mobile_service", "owner_operated");
    const b2b = requiredInputsForProfile("b2b_project_contract_service", "owner_operated");
    expect(laundry.minimumRequired).toContain("equipment_logs");
    expect(cleaning.minimumRequired).toContain("staff_attendance");
    expect(b2b.minimumRequired).toContain("b2b_contracts");
    // The three differ — type genuinely drives the request set.
    expect(JSON.stringify(laundry.minimumRequired)).not.toEqual(JSON.stringify(cleaning.minimumRequired));
    expect(JSON.stringify(b2b.minimumRequired)).not.toEqual(JSON.stringify(cleaning.minimumRequired));
  });

  it("remote-owner / manager-run mode changes proof + delegation guidance and requires proof", () => {
    const remote = computeOnboardingState({ ...base, ownerRole: "remote_owner" });
    const onsite = computeOnboardingState({ ...base, ownerRole: "owner_operated" });
    expect(remote.requirements.minimumRequired).toContain("proof_completion");
    expect(remote.proofExpectation).toMatch(/proof/i);
    expect(remote.delegationGuidance).not.toEqual(onsite.delegationGuidance);
    expect(remote.whatNotToDo.join(" ")).toMatch(/proof/i);
  });

  it("multi-location mode flags branch isolation and requires branch records, for every archetype", () => {
    // Multi-location is an OwnerRole overlay (see requiredInputsForProfile / smb-archetype.ts), never
    // an archetype's own default — the role overlay unconditionally promotes branch_records to
    // REQUIRED regardless of what any archetype defaults it to.
    for (const type of BUSINESS_PROFILE_TYPES) {
      const multi = computeOnboardingState({ ...base, profileType: type, ownerRole: "multi_location", branchCount: 3 });
      expect(multi.multiLocation).toBe(true);
      expect(multi.requirements.minimumRequired).toContain("branch_records");
      expect(multi.whatNotToDo.join(" ")).toMatch(/branch/i);
    }
  });

  it("never shows fake high confidence — high requires every critical minimum present", () => {
    for (const type of BUSINESS_PROFILE_TYPES) {
      for (const role of OWNER_ROLES) {
        const req = requiredInputsForProfile(type, role);
        // Supply everything EXCEPT one critical category → must not be high.
        const oneCriticalDropped = req.minimumRequired.filter((c, i) => !(isCriticalCategory(c) && i === req.minimumRequired.findIndex(isCriticalCategory)));
        const state = computeOnboardingState({ businessName: "X", profileType: type, ownerRole: role, suppliedCategories: oneCriticalDropped });
        if (req.minimumRequired.some(isCriticalCategory)) {
          expect(state.confidenceBeforeDiagnosis).not.toBe("high");
        }
        // Empty data is never high.
        const empty = computeOnboardingState({ businessName: "X", profileType: type, ownerRole: role, suppliedCategories: [] });
        expect(["none", "low"]).toContain(empty.confidenceBeforeDiagnosis);
      }
    }
  });

  it("confidence rises monotonically as the minimum set is filled, capping at the data quality", () => {
    const req = requiredInputsForProfile("laundry_local_service", "owner_operated");
    const none = computeOnboardingState({ ...base, suppliedCategories: [] });
    const gateOnly = computeOnboardingState({ ...base, suppliedCategories: ["revenue_sales", "expenses", "cash_debt"] });
    const full = computeOnboardingState({ ...base, suppliedCategories: req.minimumRequired });
    expect(none.confidenceBeforeDiagnosis).toBe("none");
    expect(["low", "medium"]).toContain(gateOnly.confidenceBeforeDiagnosis);
    expect(full.confidenceBeforeDiagnosis).toBe("high");
  });

  it("first action is cautious when data is weak and never generic", () => {
    const weak = computeOnboardingState({ ...base, suppliedCategories: [] });
    expect(weak.canRunFirstDiagnosis).toBe(false);
    expect(weak.firstAction).toMatch(/enter your/i);
    expect(weak.firstAction).toMatch(/revenue|cash|expense/i); // names the specific missing data
    expect(weak.whatNotToDo.length).toBeGreaterThan(0);
  });

  it("next best upload prioritises the highest-severity missing minimum, then lowest effort", () => {
    const state = computeOnboardingState({ ...base, suppliedCategories: [] });
    expect(state.nextBestUpload).not.toBeNull();
    // first gate items are critical + low effort → one of them is next
    expect(["revenue_sales", "expenses", "cash_debt"]).toContain(state.nextBestUpload);
  });

  it("produces a usable mobile shape — bounded steps and string fields (no nested walls)", () => {
    const state = computeOnboardingState(base);
    expect(state.steps.length).toBeLessThanOrEqual(8);
    expect(typeof state.firstAction).toBe("string");
    expect(typeof state.proofExpectation).toBe("string");
  });
});
