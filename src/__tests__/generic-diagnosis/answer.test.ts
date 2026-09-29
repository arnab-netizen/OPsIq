/**
 * Generic (consultant quick-intake) diagnosis — evidence-grounded answer contract.
 *
 * Pins: one main problem or an explicit abstention; every reason/evidence item carries provenance;
 * unknown is never zero; no canned advice; no percentage that is not calculated from this
 * business's own figures; confidence split into completeness / evidence strength / certainty.
 */
import { describe, it, expect } from "vitest";
import {
  buildGenericDiagnosisAnswer,
  economicsState,
  GENERIC_DIAGNOSIS_MAIN_ISSUES,
  type GenericDiagnosisInput,
  type GenericDiagnosisAnswer,
} from "@/domain/generic-diagnosis/answer";

const base: GenericDiagnosisInput = {
  businessName: "ZZ-TEST-SANDBOX",
  businessType: "bakery",
  problemStatement: "Things feel harder than last year.",
  mainIssue: "unclear",
};
const run = (over: Partial<GenericDiagnosisInput>) => buildGenericDiagnosisAnswer({ ...base, ...over });

/** Every rendered sentence of the answer. */
function allText(a: GenericDiagnosisAnswer): string {
  return JSON.stringify(a);
}

const SCENARIOS: Record<string, Partial<GenericDiagnosisInput>> = {
  A_minimal: { mainIssue: "unclear" },
  B_costs_exceed_revenue: { mainIssue: "high_costs", monthlyRevenue: 200000, monthlyCosts: 260000, customerCount: 800 },
  C_low_sales_profitable: { mainIssue: "low_sales", monthlyRevenue: 50000, monthlyCosts: 42000, customerCount: 400, problemStatement: "Sales feel slow." },
  D_costs_issue_profitable: { mainIssue: "high_costs", monthlyRevenue: 120000, monthlyCosts: 90000, problemStatement: "Our supplier costs keep going up." },
  E_operations_little_evidence: { mainIssue: "operations", problemStatement: "Everything takes too long." },
  F_retention: { mainIssue: "customer_retention", monthlyRevenue: 30000, monthlyCosts: 20000, customerCount: 1500 },
  G_cash_flow_profitable: { mainIssue: "cash_flow", monthlyRevenue: 80000, monthlyCosts: 75000, customerCount: 60 },
};

describe("scenarios A–F: one answer, grounded in what was entered", () => {
  it("A minimal evidence → abstains and asks for the figures", () => {
    const a = run(SCENARIOS.A_minimal);
    expect(a.status).toBe("insufficient_evidence");
    expect(a.mainProblem.headline).toBe("I can't determine that yet.");
    expect(a.confidence.certainty.level).toBe("cannot_determine");
    expect(a.firstStep.title).toBe("Provide: monthly revenue");
    expect(a.missingInformation.map((m) => m.field)).toEqual(expect.arrayContaining(["Monthly revenue", "Monthly costs"]));
    expect(a.canConclude.length).toBeGreaterThan(0);
    expect(a.cannotConclude).toContain("Whether the business covers its costs.");
    expect(a.supporting.severity).toBeNull();
  });

  it("B revenue < costs → a clear economics problem grounded in the submitted numbers", () => {
    const a = run(SCENARIOS.B_costs_exceed_revenue);
    expect(a.status).toBe("concluded");
    expect(a.mainProblem.code).toBe("costs_exceed_revenue");
    expect(a.mainProblem.headline).toBe("Costs are higher than revenue — the business is short about 60,000 a month.");
    expect(a.why.map((r) => r.provenance)).toEqual(["owner_input", "calculated", "owner_statement"]);
    expect(a.evidence.find((e) => e.key === "monthlyGap")).toMatchObject({ value: "60,000", provenance: "calculated" });
    expect(a.evidence.find((e) => e.key === "marginPct")).toMatchObject({ value: "−30%", provenance: "calculated" });
    expect(a.firstStep.title).toBe("Find where the monthly gap comes from");
    expect(a.supporting.severity).toBe("critical"); // gap 60,000 > 25% of revenue
    // A gap can't say whether costs or revenue cause it — the concern stays untested.
    expect(a.statedConcern.status).toBe("not_yet_tested");
    expect(a.cannotConclude).toContain("Whether the gap comes from costs, from revenue, or both (no cost breakdown or revenue history entered).");
    // The headline number appears once in the lead; it is not repeated through every section.
    expect([a.whatThisMeans, a.firstStep.title, a.firstStep.why].join(" ")).not.toContain("60,000");
  });

  it("C low sales but profitable → no loss claimed, no cash claim without a cash figure; abstains on the sales trend", () => {
    const a = run(SCENARIOS.C_low_sales_profitable);
    expect(a.status).toBe("insufficient_evidence");
    expect(a.mainProblem.code).toBe("profitable_concern_unconfirmed");
    expect(allText(a)).not.toMatch(/short about|shortfall of|costs exceed|costs are higher/i);
    expect(allText(a)).not.toMatch(/cash crisis/i); // no cash balance was entered
    expect(a.canConclude[0]).toMatch(/covers its costs this month \(margin 16%\)/);
    expect(a.thenSteps[0].title).toBe("If revenue is falling, split it into number of customers × revenue per customer");
    expect(a.firstStep.title).toBe("Compare monthly revenue for the last 6 months");
    expect(a.doNotDoYet[0].title).toMatch(/Don't cut prices or costs in a hurry/);
  });

  it("D costs concern with healthy margin → no unsupported sales-process or 'misalignment' claims", () => {
    const a = run(SCENARIOS.D_costs_issue_profitable);
    expect(allText(a)).not.toMatch(/sales process|lead generation|misalign|churn|value proposition/i);
    expect(a.firstStep.title).toBe("Break monthly costs into lines and compare each with last year");
    expect(a.cannotConclude[0]).toMatch(/Which costs are too high/);
  });

  it("E operations complaint with little evidence → asks for operational evidence, invents no bottleneck", () => {
    const a = run(SCENARIOS.E_operations_little_evidence);
    expect(a.status).toBe("insufficient_evidence");
    expect(allText(a)).not.toMatch(/inefficien|not optimized|not documented|bottleneck is/i);
    expect(a.firstStep.title).toMatch(/^Provide: where work gets stuck/);
    expect(a.missingInformation.map((m) => m.field)).toEqual(expect.arrayContaining(["Monthly revenue", "Monthly costs", expect.stringMatching(/Where work gets stuck/)]));
  });

  it("the stated concern is quoted as the owner's own words, never promoted to a finding", () => {
    const a = run({ ...SCENARIOS.F_retention, problemStatement: "Customers never return after the first visit." });
    expect(a.evidence.find((e) => e.key === "problemStatement")).toMatchObject({
      value: "“Customers never return after the first visit.”",
      provenance: "owner_statement",
    });
    expect(a.why.some((r) => r.provenance === "owner_statement" && r.text === "Stated concern: customers not coming back.")).toBe(true);
    expect(a.statedConcern.status).toBe("not_yet_tested");
    expect(allText(a)).not.toMatch(/churn risk|at risk or declining|few return/i);
  });

  it("a stated concern under a loss is kept as a question to test, with its own follow-up step", () => {
    const a = run({ mainIssue: "low_sales", monthlyRevenue: 10000, monthlyCosts: 15000 });
    expect(a.mainProblem.code).toBe("costs_exceed_revenue");
    expect(a.statedConcern.status).toBe("not_yet_tested");
    expect(a.cannotConclude).toContain("Whether low sales is a cause of the gap.");
    expect(a.thenSteps.map((t) => t.title)).toContain("Compare monthly revenue for the last 6 months");
    // Deferring growth spend is explained against the stated concern, not silently contradicted.
    expect(a.doNotDoYet[0].why).toMatch(/If the gap turns out to be a sales problem/);
  });

  it("'not sure yet' is never spliced into a sentence as if it were a concern", () => {
    for (const s of [{}, { monthlyRevenue: 100, monthlyCosts: 200 }, { monthlyRevenue: 200, monthlyCosts: 100 }, { monthlyRevenue: 5 }]) {
      expect(allText(run({ ...s, mainIssue: "unclear" }))).not.toMatch(/flagged not sure yet|about not sure yet|whether not sure yet|concern: not sure yet/i);
    }
    expect(run({ mainIssue: "unclear" }).why[0].text).toBe("No specific concern was chosen.");
  });
});

describe("unknown is not zero", () => {
  it("revenue missing vs revenue 0", () => {
    expect(economicsState({ monthlyCosts: 5000 })).toBe("partial");
    expect(economicsState({ monthlyRevenue: 0, monthlyCosts: 5000 })).toBe("no_revenue_loss");
    const missing = run({ monthlyCosts: 5000 });
    const zero = run({ monthlyRevenue: 0, monthlyCosts: 5000 });
    expect(missing.status).toBe("insufficient_evidence");
    expect(missing.missingInformation.map((m) => m.field)).toContain("Monthly revenue");
    expect(missing.evidence.some((e) => e.key === "monthlyRevenue")).toBe(false);
    expect(zero.status).toBe("concluded");
    expect(zero.mainProblem.code).toBe("no_revenue_against_costs");
    // No revenue gives no scale to judge the gap against: high, never auto-escalated as critical.
    expect(zero.supporting.severity).toBe("high");
    expect(run({ monthlyRevenue: 0, monthlyCosts: 1 }).supporting.severity).toBe("high");
    expect(zero.evidence.find((e) => e.key === "monthlyRevenue")?.value).toBe("0");
  });

  it("costs missing vs costs 0", () => {
    expect(economicsState({ monthlyRevenue: 5000 })).toBe("partial");
    expect(economicsState({ monthlyRevenue: 5000, monthlyCosts: 0 })).toBe("profit");
    const missing = run({ monthlyRevenue: 5000, mainIssue: "high_costs" });
    const zero = run({ monthlyRevenue: 5000, monthlyCosts: 0, mainIssue: "high_costs" });
    expect(missing.status).toBe("insufficient_evidence");
    expect(missing.missingInformation.map((m) => m.field)).toContain("Monthly costs");
    expect(zero.canConclude[0]).toMatch(/margin 100%/);
  });

  it("customers missing vs customers 0", () => {
    const missing = run({ monthlyRevenue: 5000, monthlyCosts: 4000 });
    const zero = run({ monthlyRevenue: 5000, monthlyCosts: 4000, customerCount: 0 });
    expect(missing.evidence.some((e) => e.key === "customerCount")).toBe(false);
    expect(missing.dataWarnings).toEqual([]);
    expect(zero.evidence.find((e) => e.key === "customerCount")?.value).toBe("0");
    expect(zero.dataWarnings[0]).toMatch(/0 customers was entered with revenue above 0/);
    expect(zero.supporting.revenuePerCustomer).toBeNull(); // never divides by a fake count
  });

  it("revenue 0 and costs 0 reported → no activity, not a healthy or failing business", () => {
    const a = run({ monthlyRevenue: 0, monthlyCosts: 0 });
    expect(a.mainProblem.code).toBe("no_trading_activity_reported");
    expect(a.status).toBe("insufficient_evidence");
    expect(a.supporting.marginPct).toBeNull();
  });

  it("completeness counts only figures actually entered", () => {
    expect(run({}).confidence.dataCompleteness.provided).toBe(0);
    expect(run({ monthlyRevenue: 0 }).confidence.dataCompleteness.provided).toBe(1);
    expect(run({ monthlyRevenue: 0, monthlyCosts: 0, customerCount: 0 }).confidence.dataCompleteness.provided).toBe(3);
  });
});

describe("materiality, rounding and bad values", () => {
  it("a gap under 1% of revenue is breaking even, not a concluded loss", () => {
    expect(economicsState({ monthlyRevenue: 100000, monthlyCosts: 100000.4 })).toBe("breakeven");
    expect(economicsState({ monthlyRevenue: 100000, monthlyCosts: 100999 })).toBe("breakeven");
    expect(economicsState({ monthlyRevenue: 100000, monthlyCosts: 101000 })).toBe("loss");
    const a = run({ monthlyRevenue: 100000, monthlyCosts: 100000.4, mainIssue: "high_costs" });
    expect(a.status).toBe("insufficient_evidence");
    expect(a.supporting.severity).toBeNull();
    expect(a.canConclude[0]).toMatch(/roughly breaks even/);
    expect(allText(a)).not.toMatch(/short about 0|the 0 monthly gap|not losing money/);
  });

  it("small amounts keep their decimals; margins keep one decimal", () => {
    const a = run({ monthlyRevenue: 40, monthlyCosts: 30, customerCount: 100 });
    expect(a.evidence.find((e) => e.key === "revenuePerCustomer")?.value).toBe("0.4");
    const b = run({ monthlyRevenue: 80000, monthlyCosts: 75000 });
    expect(b.evidence.find((e) => e.key === "marginPct")?.value).toBe("6.3%");
  });

  it("negative or non-finite figures are never used as evidence", () => {
    const a = run({ monthlyRevenue: -100, monthlyCosts: 50 });
    expect(a.supporting.economics).toBe("partial");
    expect(a.evidence.some((e) => e.key === "monthlyRevenue")).toBe(false);
    expect(run({ monthlyRevenue: Number.NaN, monthlyCosts: Number.POSITIVE_INFINITY }).supporting.economics).toBe("unknown");
  });

  it("revenue 0 and costs 0 still gives a 'then' step for every concern", () => {
    for (const mainIssue of GENERIC_DIAGNOSIS_MAIN_ISSUES) {
      const a = run({ mainIssue, monthlyRevenue: 0, monthlyCosts: 0 });
      expect(a.thenSteps.length, mainIssue).toBeGreaterThanOrEqual(1);
      expect(a.thenSteps[0].title).not.toBe(a.firstStep.title);
    }
  });

  it("suspicious combinations are flagged, not silently used", () => {
    expect(run({ monthlyRevenue: 5000, monthlyCosts: 0 }).dataWarnings.join(" ")).toMatch(/costs of 0 were entered with revenue above 0/);
    expect(run({ monthlyRevenue: 0, monthlyCosts: 0, customerCount: 50 }).dataWarnings.join(" ")).toMatch(/revenue and costs are both 0/);
  });
});

describe("confidence semantics and provenance", () => {
  it("certainty never claims more than the evidence: description only → can't tell; figures → owner-reported", () => {
    const none = run({});
    expect(none.confidence.evidenceStrength.level).toBe("description_only");
    expect(none.confidence.certainty.level).toBe("cannot_determine");
    const b = run(SCENARIOS.B_costs_exceed_revenue);
    expect(b.confidence.evidenceStrength.label).toMatch(/not yet checked against records/);
    // One month of unverified figures never earns "high".
    expect(b.confidence.certainty.level).toBe("medium");
    expect(b.confidence.certainty.label).toBe("Medium — one month of reported figures");
    expect(b.missingInformation.map((m) => m.field)).toContain("Revenue and costs for each of the last 3–6 months");
    expect(allText(b)).not.toMatch(/100%|very sure|verified evidence/i);
  });

  it("every evidence item and reason says where it came from; owner figures are never called verified", () => {
    for (const s of Object.values(SCENARIOS)) {
      const a = run(s);
      for (const e of a.evidence) expect(["owner_input", "owner_statement", "calculated"]).toContain(e.provenance);
      for (const r of a.why) expect(["owner_input", "owner_statement", "calculated"]).toContain(r.provenance);
    }
  });
});

describe("no canned advice, no unsupported numbers", () => {
  it("materially different businesses get different first steps", () => {
    const firsts = Object.values(SCENARIOS).map((s) => run(s).firstStep.title);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it("the only percentages are margins calculated from this business's figures", () => {
    for (const s of Object.values(SCENARIOS)) {
      const a = run(s);
      const pcts = allText(a).match(/[-−]?\d+(\.\d+)?%/g) ?? [];
      const m = a.supporting.marginPct;
      const allowed = m === null ? [] : [`${m < 0 ? "−" : ""}${Math.abs(m)}%`];
      for (const p of pcts) expect(allowed).toContain(p);
    }
  });

  it("exactly one first step; always a 'then'; follow-up steps never compete with it", () => {
    for (const s of Object.values(SCENARIOS)) {
      const a = run(s);
      expect(a.firstStep.title.length).toBeGreaterThan(0);
      expect(a.thenSteps.length).toBeGreaterThanOrEqual(1);
      expect(a.thenSteps.length).toBeLessThanOrEqual(2);
      expect(a.thenSteps.map((t) => t.title)).not.toContain(a.firstStep.title);
    }
  });

  it("under a loss it never advises spending more on growth", () => {
    const a = run(SCENARIOS.B_costs_exceed_revenue);
    expect([a.firstStep, ...a.thenSteps].map((s) => s.title).join(" ")).not.toMatch(/marketing|hire|expand|invest/i);
    expect(a.doNotDoYet[0].title).toMatch(/Don't add new fixed costs or spend more on growth/);
  });

  it("is deterministic and covers every main issue", () => {
    for (const mainIssue of GENERIC_DIAGNOSIS_MAIN_ISSUES) {
      const input = { ...base, mainIssue, monthlyRevenue: 1000, monthlyCosts: 900 };
      expect(buildGenericDiagnosisAnswer(input)).toEqual(buildGenericDiagnosisAnswer(input));
    }
  });

  it("keywords in the description never create facts", () => {
    const a = run({ problemStatement: "Our stockholders want returns; the team leader has burnout in the marketplace." });
    expect(allText(a)).not.toMatch(/inventory|repeat-customer|lead flow|cash-flow pressure|market visibility/i);
  });
});
