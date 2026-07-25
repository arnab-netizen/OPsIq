import { describe, it, expect } from "vitest";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import {
  BeginnerExplanationInput,
  BeginnerExplanation,
  JARGON_TERMS,
  PLAIN_LANGUAGE_MAP,
  containsJargon,
  toPlainLanguage,
  buildBeginnerExplanation,
  assertBeginnerSafe,
  BeginnerExplanationError,
} from "@/domain/owner-guidance/beginner-mode";

function input(overrides: Partial<BeginnerExplanationInput> = {}): BeginnerExplanationInput {
  return {
    headline: "Improve cash position this month",
    businessFunction: [BusinessFunction.CASH_FLOW],
    whatToDoFirst: ["Collect overdue payments"],
    whatNotToDo: ["Do not run a discount campaign"],
    proofToCollect: ["Bank statement showing the payment"],
    howToKnowItWorked: "Your bank balance is higher next month",
    ifIgnoredConsequence: "You may not have enough cash to pay your bills",
    dataIsWeak: false,
    ...overrides,
  };
}

describe("[module41] beginner mode — jargon detection + plain language", () => {
  it("[module41] detects jargon case-insensitively", () => {
    expect(containsJargon("watch your Accounts Receivable")).toBe(true);
    expect(containsJargon("your RUNWAY is short")).toBe(true);
    expect(containsJargon("collect overdue payments")).toBe(false);
  });

  it("[module41] every jargon term that has a plain mapping is detectable", () => {
    for (const term of Object.keys(PLAIN_LANGUAGE_MAP)) {
      expect(JARGON_TERMS.map((t) => t.toLowerCase())).toContain(term.toLowerCase());
    }
  });

  it("[module41] toPlainLanguage replaces mapped jargon terms", () => {
    const out = toPlainLanguage("Your accounts receivable is high and your runway is short");
    expect(out).toContain("money customers still owe you");
    expect(out).toContain("how long your cash lasts");
    expect(containsJargon(out)).toBe(false);
  });

  it("[module41] beginner explanation avoids jargon after conversion", () => {
    const exp = buildBeginnerExplanation(
      input({ headline: "Your accounts receivable and runway both need attention" })
    );
    expect(exp.plainReason).toContain("money customers still owe you");
    expect(exp.plainReason).toContain("how long your cash lasts");
    expect(exp.containsJargon).toBe(false);
  });
});

describe("[module41] beginner mode — required fields", () => {
  it("[module41] includes why it matters (concrete, function-specific)", () => {
    const exp = buildBeginnerExplanation(input({ businessFunction: [BusinessFunction.CASH_FLOW] }));
    expect(exp.whyItMatters.trim().length).toBeGreaterThan(0);
    expect(exp.whyItMatters).toContain("cash going in and out");
    expect(containsJargon(exp.whyItMatters)).toBe(false);
  });

  it("[module41] includes what to do first (non-empty)", () => {
    const exp = buildBeginnerExplanation(input());
    expect(exp.whatToDoFirst.length).toBeGreaterThan(0);
  });

  it("[module41] includes what not to do (non-empty)", () => {
    const exp = buildBeginnerExplanation(input());
    expect(exp.whatNotToDo.length).toBeGreaterThan(0);
  });

  it("[module41] states what happens if ignored", () => {
    const exp = buildBeginnerExplanation(input());
    expect(exp.whatHappensIfIgnored).toBe("You may not have enough cash to pay your bills");
  });

  it("[module41] throws when ifIgnoredConsequence is blank", () => {
    expect(() => buildBeginnerExplanation(input({ ifIgnoredConsequence: "   " }))).toThrow();
  });
});

describe("[module41] beginner mode — confidence capping", () => {
  it("[module41] caps confidence when data is weak", () => {
    const exp = buildBeginnerExplanation(input({ dataIsWeak: true }));
    expect(exp.confidenceCapped).toBe(true);
    expect(exp.confidenceNote.trim().length).toBeGreaterThan(0);
  });

  it("[module41] does not cap or note when data is sound", () => {
    const exp = buildBeginnerExplanation(input({ dataIsWeak: false }));
    expect(exp.confidenceCapped).toBe(false);
    expect(exp.confidenceNote).toBe("");
  });
});

describe("[module41] beginner mode — professional review warning", () => {
  it("[module41] warns for compliance-sensitive guidance", () => {
    const exp = buildBeginnerExplanation(input({ businessFunction: [BusinessFunction.RISK_COMPLIANCE] }));
    expect(exp.professionalReviewWarning).toBe(
      "Check with your accountant/lawyer before acting on tax/legal/compliance points."
    );
  });

  it("[module41] warns for payroll (tax/legal-sensitive) guidance", () => {
    const exp = buildBeginnerExplanation(input({ businessFunction: [BusinessFunction.PAYROLL] }));
    expect(exp.professionalReviewWarning).not.toBeNull();
  });

  it("[module41] no warning for non-sensitive guidance", () => {
    const exp = buildBeginnerExplanation(input({ businessFunction: [BusinessFunction.MARKETING] }));
    expect(exp.professionalReviewWarning).toBeNull();
  });
});

describe("[module41] beginner mode — assertBeginnerSafe", () => {
  function explanation(overrides: Partial<BeginnerExplanation> = {}): BeginnerExplanation {
    return {
      plainReason: "x",
      whyItMatters: "x",
      whatHappensIfIgnored: "bad things",
      whatToDoFirst: ["do this"],
      whatNotToDo: ["not this"],
      proofToCollect: ["proof"],
      howToKnowItWorked: "x",
      professionalReviewWarning: null,
      confidenceCapped: false,
      confidenceNote: "",
      containsJargon: false,
      ...overrides,
    };
  }

  it("[module41] passes a complete explanation", () => {
    expect(() => assertBeginnerSafe(explanation())).not.toThrow();
  });

  it("[module41] throws when whatToDoFirst missing", () => {
    expect(() => assertBeginnerSafe(explanation({ whatToDoFirst: [] }))).toThrow(BeginnerExplanationError);
  });

  it("[module41] throws when whatNotToDo missing", () => {
    expect(() => assertBeginnerSafe(explanation({ whatNotToDo: [] }))).toThrow(BeginnerExplanationError);
  });

  it("[module41] throws when whatHappensIfIgnored blank", () => {
    try {
      assertBeginnerSafe(explanation({ whatHappensIfIgnored: "  " }));
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BeginnerExplanationError);
      expect((e as BeginnerExplanationError).code).toBe("BEGINNER_EXPLANATION_UNSAFE");
      expect((e as BeginnerExplanationError).reasons).toContain("missing_what_happens_if_ignored");
    }
  });
});

describe("[module41] beginner mode — assertBeginnerSafe error code", () => {
  it("[module41] BeginnerExplanationError has code BEGINNER_EXPLANATION_UNSAFE when whatToDoFirst is empty", () => {
    try {
      assertBeginnerSafe({
        plainReason: "reason",
        whyItMatters: "matters",
        whatToDoFirst: [],
        whatNotToDo: ["not this"],
        proofToCollect: [],
        howToKnowItWorked: "track it",
        whatHappensIfIgnored: "bad things",
        professionalReviewWarning: null,
        confidenceCapped: false,
        confidenceNote: "",
        containsJargon: false,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BeginnerExplanationError);
      expect((e as BeginnerExplanationError).code).toBe("BEGINNER_EXPLANATION_UNSAFE");
    }
  });
});

describe("[module41] beginner mode — worked example", () => {
  it("[module41] builds a complete explanation for 'not ready to grow yet'", () => {
    const exp = buildBeginnerExplanation(
      input({
        headline: "Your business is not ready to grow yet",
        businessFunction: [BusinessFunction.GROWTH_READINESS],
        whatToDoFirst: [
          "Collect overdue payments",
          "Fix the open complaints",
          "Reduce the overload on you and your staff",
          "Recheck your cash position",
        ],
        whatNotToDo: [
          "No discount campaign",
          "No low-margin B2B deals",
          "No hiring right now",
        ],
        proofToCollect: ["Updated cash report", "Closed-complaint log"],
        howToKnowItWorked: "Cash is steady and complaints are down",
        ifIgnoredConsequence: "Growing now could break your business and drain your cash",
        dataIsWeak: false,
      })
    );

    expect(exp.plainReason).toBe("Your business is not ready to grow yet");
    expect(exp.whyItMatters).toContain("ready to grow");
    expect(exp.whatHappensIfIgnored).toContain("drain your cash");
    expect(exp.whatToDoFirst).toHaveLength(4);
    expect(exp.whatNotToDo).toHaveLength(3);
    expect(exp.proofToCollect).toHaveLength(2);
    expect(exp.professionalReviewWarning).toBeNull();
    expect(exp.containsJargon).toBe(false);
    expect(() => assertBeginnerSafe(exp)).not.toThrow();
  });
});
