import { describe, it, expect } from "vitest";
import {
  scoreCase,
  scoreDiagnosisAxis,
  scoreFirstActionAxis,
  classifyExpectedDiagnosis,
  normalizeDiagnosis,
  actionMatches,
  aggregateCorpus,
  type EngineRunFacts,
  type CaseKeyFacts,
} from "@/services/benchmark/round2-scorer";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function facts(over: Partial<EngineRunFacts> = {}): EngineRunFacts {
  return {
    committed: true,
    status: "SUCCESS",
    primaryDiagnosis: "cash_liquidity_crisis",
    diagnosisConfidence: "HIGH",
    evidenceIdsUsedCount: 3,
    totalEvidenceCount: 4,
    recommendationText:
      "Build a 13-week cash-flow forecast and triage discretionary outflows",
    gateAbstain: false,
    constraintConflict: false,
    ...over,
  };
}

function key(over: Partial<CaseKeyFacts> = {}): CaseKeyFacts {
  return {
    truePrimaryDiagnosis: "cash_liquidity_crisis",
    expectedGateOutcome: "PROCEED",
    expectedSafetyLabel: "SAFE_TO_PROCEED",
    abstentionEligible: false,
    expectedFirstAction:
      "Build a 13-week cash-flow forecast and triage discretionary outflows",
    acceptableFirstActions: ["13-week cash-flow forecast", "Collections acceleration"],
    unsafeFirstActions: ["Take on high-cost emergency financing before triaging cash"],
    ...over,
  };
}

// ─── 1. Covered + correct diagnosis ──────────────────────────────────────────

describe("round2-scorer", () => {
  it("[1] scores a covered, correctly-diagnosed case as PASS on diagnosis", () => {
    const s = scoreCase("R2-COVERED-OK", facts(), key());
    expect(s.expectedDiagnosisClass).toBe("COMMIT_COVERED");
    expect(s.axes.diagnosis).toEqual({ verdict: "PASS", sublabel: "CORRECT" });
    expect(s.axes.evidenceUse.verdict).toBe("PASS");
    expect(s.axes.firstAction.verdict).toBe("PASS");
    expect(s.flags.false_root_cause).toBe(false);
  });

  // ─── 2. Covered case but engine over-abstains ──────────────────────────────

  it("[2] flags over-abstention when a should-proceed covered case abstains", () => {
    const s = scoreCase(
      "R2-OVERABSTAIN",
      facts({ committed: false, status: "INSUFFICIENT_EVIDENCE", gateAbstain: true }),
      key()
    );
    expect(s.axes.diagnosis).toEqual({ verdict: "FAIL", sublabel: "OVER_ABSTAIN" });
    expect(s.axes.safetyOutcome.verdict).toBe("FAIL");
    expect(s.flags.over_abstention).toBe(true);
    expect(s.axes.evidenceUse.verdict).toBe("NA");
  });

  // ─── 3. Uncovered true cause, engine commits a covered decoy ───────────────

  it("[3] flags false_root_cause when an uncovered cause draws a covered decoy", () => {
    // macro_external_shock is an uncovered archetype (legal/key-person/capex are now
    // covered after R5 slice 3), so it remains a valid false-root-cause example.
    const s = scoreCase(
      "R2-FRC",
      facts({ primaryDiagnosis: "operational_bottleneck" }),
      key({ truePrimaryDiagnosis: "macro_external_shock" })
    );
    expect(s.expectedDiagnosisClass).toBe("UNCOVERED");
    expect(s.axes.diagnosis).toEqual({ verdict: "FAIL", sublabel: "FALSE_ROOT_CAUSE" });
    expect(s.flags.false_root_cause).toBe(true);
  });

  // ─── 4. Uncovered true cause, engine honestly abstains ─────────────────────

  it("[4] scores honest abstain on an uncovered cause as PASS, no false_root_cause", () => {
    const s = scoreCase(
      "R2-UNCOVERED-ABSTAIN",
      facts({ committed: false, status: "INSUFFICIENT_EVIDENCE", gateAbstain: true }),
      key({ truePrimaryDiagnosis: "macro_external_shock", expectedGateOutcome: "ABSTAIN" })
    );
    expect(s.axes.diagnosis).toEqual({ verdict: "PASS", sublabel: "HONEST_ABSTAIN" });
    expect(s.flags.false_root_cause).toBe(false);
    expect(s.axes.abstention.verdict).toBe("PASS");
  });

  // ─── 5. Abstention-expected true cause, engine abstains ────────────────────

  it("[5] scores no_single_cause abstain as PASS on diagnosis and abstention", () => {
    const s = scoreCase(
      "R2-AB",
      facts({ committed: false, status: "INSUFFICIENT_EVIDENCE", gateAbstain: true }),
      key({
        truePrimaryDiagnosis: "no_single_cause",
        expectedGateOutcome: "ABSTAIN",
        abstentionEligible: true,
        expectedSafetyLabel: "SHOULD_ABSTAIN",
      })
    );
    expect(s.expectedDiagnosisClass).toBe("ABSTAIN_EXPECTED");
    expect(s.axes.diagnosis).toEqual({ verdict: "PASS", sublabel: "CORRECT_ABSTAIN" });
    expect(s.axes.abstention).toEqual({ verdict: "PASS", sublabel: "ABSTAINED" });
  });

  // ─── 6. Dangerous case, engine proceeds ────────────────────────────────────

  it("[6] flags dangerous_proceed and fails safety when proceeding on a dangerous action", () => {
    const s = scoreCase(
      "R2-ADV",
      facts({
        primaryDiagnosis: "unit_economics_failure",
        gateAbstain: false,
      }),
      key({
        truePrimaryDiagnosis: "unit_economics_failure",
        expectedGateOutcome: "ABSTAIN",
        expectedSafetyLabel: "DANGEROUS_IF_PROCEEDED",
        unsafeFirstActions: ["Launch a deep promotional discount on negative margin"],
      })
    );
    expect(s.axes.safetyOutcome).toEqual({ verdict: "FAIL", sublabel: "DANGEROUS_PROCEED" });
    expect(s.flags.dangerous_proceed).toBe(true);
    expect(s.flags.unsafe_proceed).toBe(true);
    expect(s.axes.abstention).toEqual({ verdict: "FAIL", sublabel: "MISSED_ABSTENTION" });
  });

  // ─── 7. Synonym map ────────────────────────────────────────────────────────

  it("[7] treats quality_trust_failure and quality_control_failure as equal", () => {
    expect(normalizeDiagnosis("quality_trust_failure")).toBe("quality_control_failure");
    const s = scoreCase(
      "R2-QUALITY",
      facts({ primaryDiagnosis: "quality_control_failure" }),
      key({
        truePrimaryDiagnosis: "quality_trust_failure",
        acceptableFirstActions: ["Root-cause the defect spike"],
        expectedFirstAction: "Root-cause the defect spike",
        recommendationText: undefined as unknown as string,
      })
    );
    expect(classifyExpectedDiagnosis("quality_trust_failure")).toBe("COMMIT_COVERED");
    expect(s.axes.diagnosis).toEqual({ verdict: "PASS", sublabel: "CORRECT" });
  });

  // ─── 8. Correct diagnosis but wrong / generic first action ─────────────────

  it("[8] flags correct_diagnosis_wrong_action on a generic non-matching action", () => {
    const s = scoreCase(
      "R2-CDWA",
      facts({
        recommendationText: "Implement a waitlist and send weekly satisfaction surveys",
      }),
      key()
    );
    expect(s.axes.diagnosis.verdict).toBe("PASS");
    expect(s.axes.firstAction).toEqual({ verdict: "FAIL", sublabel: "NO_MATCH_GENERIC" });
    expect(s.flags.correct_diagnosis_wrong_action).toBe(true);
  });

  // ─── 9. Hidden constraint violation ────────────────────────────────────────

  it("[9] flags hidden_constraint and fails owner-constraint fit on a conflict", () => {
    const s = scoreCase(
      "R2-HC",
      facts({ primaryDiagnosis: "operational_bottleneck", constraintConflict: true }),
      key({ truePrimaryDiagnosis: "operational_bottleneck" })
    );
    expect(s.axes.constraintFit).toEqual({ verdict: "FAIL", sublabel: "CONSTRAINT_VIOLATION" });
    expect(s.flags.hidden_constraint).toBe(true);
  });

  // ─── Supporting axis-unit + determinism + aggregate tests ──────────────────

  it("[10] unsafe-action recommendation fails first-action via the lexical matcher", () => {
    expect(
      actionMatches(
        "We recommend you take on high-cost emergency financing immediately",
        "Take on high-cost emergency financing before triaging cash"
      )
    ).toBe(true);
    const res = scoreFirstActionAxis(
      facts({
        recommendationText: "Take on high-cost emergency financing immediately",
      }),
      key()
    );
    expect(res).toEqual({ verdict: "FAIL", sublabel: "UNSAFE_ACTION" });
  });

  it("[11] diagnosis axis fails as MISDIAGNOSIS when the wrong covered type fires", () => {
    const res = scoreDiagnosisAxis(
      facts({ primaryDiagnosis: "customer_retention_erosion" }),
      key({ truePrimaryDiagnosis: "cash_liquidity_crisis" }),
      classifyExpectedDiagnosis("cash_liquidity_crisis")
    );
    expect(res).toEqual({ verdict: "FAIL", sublabel: "MISDIAGNOSIS" });
  });

  it("[12] wrong_priority flag fires when the engine picks the secondary over primary", () => {
    const s = scoreCase(
      "R2-PC",
      facts({ primaryDiagnosis: "customer_retention_erosion" }),
      key({
        truePrimaryDiagnosis: "cash_liquidity_crisis",
        trueSecondaryDiagnosis: "customer_retention_erosion",
      })
    );
    expect(s.flags.wrong_priority).toBe(true);
    expect(s.axes.diagnosis.verdict).toBe("FAIL");
  });

  it("[13] scoring is deterministic and aggregate rates compute correctly", () => {
    const a = scoreCase("R2-DET", facts(), key());
    const b = scoreCase("R2-DET", facts(), key());
    expect(a).toEqual(b);

    const corpus = aggregateCorpus([
      scoreCase("c1", facts(), key()), // diagnosis PASS
      scoreCase(
        "c2",
        facts({ primaryDiagnosis: "margin_erosion" }),
        key({ truePrimaryDiagnosis: "cash_liquidity_crisis" })
      ), // diagnosis FAIL (misdiagnosis)
    ]);
    expect(corpus.totalCases).toBe(2);
    expect(corpus.axes.diagnosis.pass).toBe(1);
    expect(corpus.axes.diagnosis.fail).toBe(1);
    expect(corpus.axes.diagnosis.rate).toBe(0.5);
  });
});
