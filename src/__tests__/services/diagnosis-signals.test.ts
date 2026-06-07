import { describe, it, expect } from "vitest";
import {
  extractProblemSignals,
  findingEvidence,
  deriveWhyThisMattersNow,
  deriveWhyFirst,
  deriveBottleneck,
  enrichFirstActionDescription,
  deriveWhatNotToDoYet,
  type SignalInput,
} from "@/services/diagnosis-signals";

const laundry: SignalInput = {
  businessType: "Laundry",
  problemStatement: "Customers do not return for repeat orders; very few come back.",
  mainIssue: "low_sales",
  monthlyRevenue: 50000,
  monthlyCosts: 40000,
  customerCount: 80,
};

const housekeeping: SignalInput = {
  businessType: "Commercial cleaning",
  problemStatement: "Lead flow is inconsistent — some weeks we get no inquiries; staff reliability is poor.",
  mainIssue: "low_sales",
  monthlyRevenue: 30000,
  monthlyCosts: 26000,
  customerCount: 25,
};

const restaurant: SignalInput = {
  businessType: "Cloud kitchen",
  problemStatement: "Delivery platform commissions crush our margins and costs keep rising.",
  mainIssue: "high_costs",
  monthlyRevenue: 40000,
  monthlyCosts: 47000,
  customerCount: 900,
};

const retail: SignalInput = {
  businessType: "Boutique retail",
  problemStatement: "Too much cash is locked in unsold inventory and conversion is low.",
  mainIssue: "cash_flow",
  monthlyRevenue: 60000,
  monthlyCosts: 52000,
  customerCount: 300,
};

describe("diagnosis specificity signals", () => {
  it("extracts different primary constraints for different statements in the same category", () => {
    // Both are mainIssue=low_sales, but the statements differ meaningfully.
    const a = extractProblemSignals(laundry);
    const b = extractProblemSignals(housekeeping);
    expect(a.primaryConstraint).toBe("weak_retention");
    expect(b.primaryConstraint).toBe("weak_lead_flow");
    expect(a.primaryConstraint).not.toBe(b.primaryConstraint);
  });

  it("findings cite concrete user facts as evidence (never empty/fabricated)", () => {
    const s = extractProblemSignals(laundry);
    const ev = findingEvidence(laundry, s);
    expect(ev.length).toBeGreaterThan(0);
    // references the user's own statement signal or numbers
    expect(ev).toMatch(/repeat-customer|customer|revenue|margin|problem/i);
  });

  it("negative margin is detected from numbers and drives cash-flow as primary", () => {
    const s = extractProblemSignals(restaurant);
    expect(s.metrics.negativeMargin).toBe(true);
    expect(s.primaryConstraint).toBe("cash_flow_pressure");
    expect(s.evidence.join(" ")).toMatch(/costs \(\$47,000\) exceed revenue \(\$40,000\)/);
  });

  it("top recommendation 'why first' is specific (names the binding constraint)", () => {
    const s = extractProblemSignals(laundry);
    const why = deriveWhyFirst(s, "revenue_generation", "high");
    expect(why).toMatch(/first because/i);
    expect(why).toMatch(/repeat-customer/i);
  });

  it("first action references the user's bottleneck / problem", () => {
    const s = extractProblemSignals(housekeeping);
    const enriched = enrichFirstActionDescription("Create a sales outreach plan.", s);
    expect(enriched).toMatch(/inconsistent lead flow/i);
    expect(enriched).toContain("Create a sales outreach plan.");
    const bottleneck = deriveBottleneck(s, "revenue_generation");
    expect(bottleneck.toLowerCase()).toContain("lead flow");
  });

  it("'what not to do yet' appears when applicable and is empty otherwise", () => {
    expect(deriveWhatNotToDoYet(extractProblemSignals(housekeeping)).join(" ")).toMatch(/don't hire more/i);
    expect(deriveWhatNotToDoYet(extractProblemSignals(laundry)).join(" ")).toMatch(/acquisition spend/i);
    expect(deriveWhatNotToDoYet(extractProblemSignals(retail)).join(" ")).toMatch(/inventory/i);
    // bare statement with no signals and balanced numbers → no guardrails
    const bare = extractProblemSignals({
      businessType: "Shop",
      problemStatement: "Things feel a bit off lately.",
      mainIssue: "unclear",
    });
    expect(deriveWhatNotToDoYet(bare)).toEqual([]);
  });

  it("why-this-matters-now is non-empty and deterministic", () => {
    const s = extractProblemSignals(laundry);
    const w1 = deriveWhyThisMattersNow(s, "revenue_generation", "high");
    const w2 = deriveWhyThisMattersNow(s, "revenue_generation", "high");
    expect(w1.length).toBeGreaterThan(0);
    expect(w1).toBe(w2);
  });

  it("is fully deterministic: same input → identical output", () => {
    const a = JSON.stringify(extractProblemSignals(restaurant));
    const b = JSON.stringify(extractProblemSignals(restaurant));
    expect(a).toBe(b);
  });
});
