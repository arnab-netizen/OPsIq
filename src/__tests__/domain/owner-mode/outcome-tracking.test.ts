import { describe, it, expect } from "vitest";
import {
  OUTCOME_ENABLES_LEARNING,
  OUTCOME_INDICATES_HARM,
  OUTCOME_REQUIRES_ADJUDICATION,
  validateOutcome,
  outcomeAllowsLearning,
  type OutcomeInput,
} from "@/domain/owner-mode/outcome-tracking";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function base(overrides: Partial<OutcomeInput> = {}): OutcomeInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    actionId: "action-001",
    outcomeStatus: "worked",
    ownerReportedResult: "Supplier renegotiations reduced COGS by 8% in Q3.",
    actualMetricName: "cogs_pct",
    beforeValue: 42,
    afterValue: 38.6,
    evidenceQuality: "strong",
    ...overrides,
  };
}

// ─── Learning eligibility table ───────────────────────────────────────────────

describe("OUTCOME_ENABLES_LEARNING", () => {
  it("worked → enables learning", () => expect(OUTCOME_ENABLES_LEARNING.worked).toBe(true));
  it("partially_worked → enables learning", () => expect(OUTCOME_ENABLES_LEARNING.partially_worked).toBe(true));
  it("did_not_work → enables learning", () => expect(OUTCOME_ENABLES_LEARNING.did_not_work).toBe(true));
  it("made_worse → enables learning", () => expect(OUTCOME_ENABLES_LEARNING.made_worse).toBe(true));
  it("not_measurable → does not enable learning", () => expect(OUTCOME_ENABLES_LEARNING.not_measurable).toBe(false));
  it("too_early_to_judge → does not enable learning", () => expect(OUTCOME_ENABLES_LEARNING.too_early_to_judge).toBe(false));
  it("invalid_test → does not enable learning", () => expect(OUTCOME_ENABLES_LEARNING.invalid_test).toBe(false));
  it("executed_differently → does not enable learning", () => expect(OUTCOME_ENABLES_LEARNING.executed_differently).toBe(false));
  it("external_event_interference → does not enable learning", () => expect(OUTCOME_ENABLES_LEARNING.external_event_interference).toBe(false));
});

// ─── Harm table ───────────────────────────────────────────────────────────────

describe("OUTCOME_INDICATES_HARM", () => {
  it("made_worse → indicates harm", () => expect(OUTCOME_INDICATES_HARM.made_worse).toBe(true));
  it("worked → does not indicate harm", () => expect(OUTCOME_INDICATES_HARM.worked).toBe(false));
  it("did_not_work → does not indicate harm", () => expect(OUTCOME_INDICATES_HARM.did_not_work).toBe(false));
});

// ─── Adjudication table ───────────────────────────────────────────────────────

describe("OUTCOME_REQUIRES_ADJUDICATION", () => {
  it("made_worse → requires adjudication", () => expect(OUTCOME_REQUIRES_ADJUDICATION.made_worse).toBe(true));
  it("invalid_test → requires adjudication", () => expect(OUTCOME_REQUIRES_ADJUDICATION.invalid_test).toBe(true));
  it("executed_differently → requires adjudication", () => expect(OUTCOME_REQUIRES_ADJUDICATION.executed_differently).toBe(true));
  it("external_event_interference → requires adjudication", () => expect(OUTCOME_REQUIRES_ADJUDICATION.external_event_interference).toBe(true));
  it("worked → no adjudication needed", () => expect(OUTCOME_REQUIRES_ADJUDICATION.worked).toBe(false));
  it("did_not_work → no adjudication needed", () => expect(OUTCOME_REQUIRES_ADJUDICATION.did_not_work).toBe(false));
});

// ─── OUT-RULE-1: must link to recommendation or action ────────────────────────

describe("OUT-RULE-1: recommendationId or actionId required", () => {
  it("violation when neither provided", () => {
    const result = validateOutcome(base({ recommendationId: undefined, actionId: undefined }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("OUT-RULE-1"))).toBe(true);
  });

  it("valid when only recommendationId provided", () => {
    const result = validateOutcome(base({ actionId: undefined }));
    expect(result.violations.some((v) => v.includes("OUT-RULE-1"))).toBe(false);
  });

  it("valid when only actionId provided", () => {
    const result = validateOutcome(base({ recommendationId: undefined }));
    expect(result.violations.some((v) => v.includes("OUT-RULE-1"))).toBe(false);
  });
});

// ─── OUT-RULE-2: external_event_interference requires description ──────────────

describe("OUT-RULE-2: externalEventDescription required for external_event_interference", () => {
  it("violation when status is external_event_interference without description", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "external_event_interference", externalEventDescription: undefined })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-2"))).toBe(true);
  });

  it("violation when description is whitespace", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "external_event_interference", externalEventDescription: "   " })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-2"))).toBe(true);
  });

  it("valid when external_event_interference with description", () => {
    const result = validateOutcome(
      base({
        outcomeStatus: "external_event_interference",
        externalEventDescription: "Major supplier went bankrupt mid-quarter.",
      })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-2"))).toBe(false);
  });

  it("no violation for worked outcome without description", () => {
    const result = validateOutcome(base({ externalEventDescription: undefined }));
    expect(result.violations.some((v) => v.includes("OUT-RULE-2"))).toBe(false);
  });
});

// ─── OUT-RULE-3: made_worse requires ownerReportedResult ──────────────────────

describe("OUT-RULE-3: ownerReportedResult required for made_worse", () => {
  it("violation when made_worse without ownerReportedResult", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "made_worse", ownerReportedResult: undefined })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-3"))).toBe(true);
  });

  it("valid when made_worse with ownerReportedResult", () => {
    const result = validateOutcome(
      base({
        outcomeStatus: "made_worse",
        ownerReportedResult: "Margin dropped further after supplier switch.",
      })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-3"))).toBe(false);
  });

  it("no violation for did_not_work without ownerReportedResult", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "did_not_work", ownerReportedResult: undefined })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-3"))).toBe(false);
  });
});

// ─── OUT-RULE-5: measurement window ──────────────────────────────────────────

describe("OUT-RULE-5: measurementPeriodEnd must be after start", () => {
  const start = new Date("2026-01-01");
  const end = new Date("2026-04-01");

  it("violation when end is before start", () => {
    const result = validateOutcome(
      base({ measurementPeriodStart: end, measurementPeriodEnd: start })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-5"))).toBe(true);
  });

  it("violation when end equals start", () => {
    const result = validateOutcome(
      base({ measurementPeriodStart: start, measurementPeriodEnd: start })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-5"))).toBe(true);
  });

  it("no violation when end is after start", () => {
    const result = validateOutcome(
      base({ measurementPeriodStart: start, measurementPeriodEnd: end })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-5"))).toBe(false);
  });
});

// ─── OUT-RULE-6: actualMetricName required with values ───────────────────────

describe("OUT-RULE-6: actualMetricName required when values provided", () => {
  it("violation when beforeValue provided without metricName", () => {
    const result = validateOutcome(base({ actualMetricName: undefined, beforeValue: 42 }));
    expect(result.violations.some((v) => v.includes("OUT-RULE-6"))).toBe(true);
  });

  it("violation when afterValue provided without metricName", () => {
    const result = validateOutcome(base({ actualMetricName: undefined, afterValue: 38.6 }));
    expect(result.violations.some((v) => v.includes("OUT-RULE-6"))).toBe(true);
  });

  it("no violation when no values and no metricName", () => {
    const result = validateOutcome(
      base({ actualMetricName: undefined, beforeValue: undefined, afterValue: undefined })
    );
    expect(result.violations.some((v) => v.includes("OUT-RULE-6"))).toBe(false);
  });
});

// ─── Delta computation ────────────────────────────────────────────────────────

describe("delta computation", () => {
  it("computes absoluteChange correctly", () => {
    const result = validateOutcome(base({ beforeValue: 42, afterValue: 38.6 }));
    expect(result.absoluteChange).toBeCloseTo(-3.4, 2);
  });

  it("computes percentageChange correctly", () => {
    const result = validateOutcome(base({ beforeValue: 42, afterValue: 38.6 }));
    expect(result.percentageChange).toBeCloseTo(-8.1, 0);
  });

  it("absoluteChange is null when values not provided", () => {
    const result = validateOutcome(
      base({ beforeValue: undefined, afterValue: undefined, actualMetricName: undefined })
    );
    expect(result.absoluteChange).toBeNull();
  });

  it("percentageChange is null when baseline is 0", () => {
    const result = validateOutcome(base({ beforeValue: 0, afterValue: 10 }));
    expect(result.percentageChange).toBeNull();
  });

  it("positive delta for improvement", () => {
    const result = validateOutcome(base({ beforeValue: 28, afterValue: 35 }));
    expect(result.absoluteChange).toBeCloseTo(7, 2);
    expect(result.percentageChange).toBeCloseTo(25, 0);
  });
});

// ─── enablesLearning / indicatesHarm / requiresAdjudication ──────────────────

describe("outcome flags", () => {
  it("worked outcome → enablesLearning=true, indicatesHarm=false, requiresAdjudication=false", () => {
    const result = validateOutcome(base());
    expect(result.enablesLearning).toBe(true);
    expect(result.indicatesHarm).toBe(false);
    expect(result.requiresAdjudication).toBe(false);
  });

  it("made_worse outcome → enablesLearning=true, indicatesHarm=true, requiresAdjudication=true", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "made_worse", ownerReportedResult: "Things got worse after action." })
    );
    expect(result.enablesLearning).toBe(true);
    expect(result.indicatesHarm).toBe(true);
    expect(result.requiresAdjudication).toBe(true);
  });

  it("too_early_to_judge → enablesLearning=false", () => {
    const result = validateOutcome(base({ outcomeStatus: "too_early_to_judge" }));
    expect(result.enablesLearning).toBe(false);
  });

  it("not_measurable → enablesLearning=false", () => {
    const result = validateOutcome(base({ outcomeStatus: "not_measurable" }));
    expect(result.enablesLearning).toBe(false);
  });

  it("did_not_work → enablesLearning=true, indicatesHarm=false", () => {
    const result = validateOutcome(base({ outcomeStatus: "did_not_work" }));
    expect(result.enablesLearning).toBe(true);
    expect(result.indicatesHarm).toBe(false);
  });
});

// ─── outcomeAllowsLearning helper ────────────────────────────────────────────

describe("outcomeAllowsLearning", () => {
  it("worked → allows learning", () => {
    const result = validateOutcome(base());
    expect(outcomeAllowsLearning(result)).toBe(true);
  });

  it("made_worse → does not allow learning (requires adjudication)", () => {
    const result = validateOutcome(
      base({ outcomeStatus: "made_worse", ownerReportedResult: "Got worse." })
    );
    expect(outcomeAllowsLearning(result)).toBe(false);
  });

  it("invalid outcome (violation) → does not allow learning", () => {
    const result = validateOutcome(base({ recommendationId: undefined, actionId: undefined }));
    expect(outcomeAllowsLearning(result)).toBe(false);
  });

  it("too_early_to_judge → does not allow learning", () => {
    const result = validateOutcome(base({ outcomeStatus: "too_early_to_judge" }));
    expect(outcomeAllowsLearning(result)).toBe(false);
  });
});

// ─── Valid complete inputs ─────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("worked outcome with metrics is valid", () => {
    const result = validateOutcome(base());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("partially_worked outcome is valid", () => {
    const result = validateOutcome(base({ outcomeStatus: "partially_worked" }));
    expect(result.valid).toBe(true);
  });

  it("external event interference with description is valid", () => {
    const result = validateOutcome(
      base({
        outcomeStatus: "external_event_interference",
        externalEventDescription: "Macro shock: key raw material shortage disrupted supply chain.",
        externalEventFlag: true,
      })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => validateOutcome(base({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => validateOutcome(base({ workspaceId: "   " }))).toThrow();
  });
});
