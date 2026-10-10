import { describe, expect, it } from "vitest";
import {
  firstRunHref,
  landingAfterLogin,
  landingAfterVerification,
  resolveFirstRunState,
  type FirstRunFacts,
} from "@/domain/owner-first-run/first-run-router";
import {
  firstTrustedInteraction,
  isFirstTrustedDecisionInteraction,
  timeToFirstValueSeconds,
} from "@/domain/owner-first-run/activation";
import {
  buildFirstMoneyRead,
  findOverclaims,
  firstMoneyReadStrings,
  FIRST_MONEY_READ_HEADING,
} from "@/domain/owner-first-run/first-money-read";
import { selectNextQuestion, MAX_PROGRESSIVE_QUESTIONS } from "@/domain/owner-first-run/next-question";
import { SMB_ARCHETYPES } from "@/domain/owner-mode/smb-archetype";
import { buildInputGuidance } from "@/domain/owner-mode/input-guidance";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";

const base: FirstRunFacts = { hasBusiness: false, firstReadSufficient: false, hasDiagnosis: false, hasTrustedInteraction: false };

describe("first-run router state transitions", () => {
  it("A: no business", () => expect(resolveFirstRunState(base)).toBe("NEEDS_BUSINESS"));
  it("B: business, insufficient evidence", () =>
    expect(resolveFirstRunState({ ...base, hasBusiness: true })).toBe("NEEDS_EVIDENCE"));
  it("C: sufficient evidence, no diagnosis", () =>
    expect(resolveFirstRunState({ ...base, hasBusiness: true, firstReadSufficient: true })).toBe("NEEDS_DIAGNOSIS"));
  it("D: diagnosis exists, no interaction", () =>
    expect(resolveFirstRunState({ ...base, hasBusiness: true, firstReadSufficient: true, hasDiagnosis: true })).toBe("FIRST_RESULT"));
  it("E: interaction complete", () =>
    expect(
      resolveFirstRunState({ hasBusiness: true, firstReadSufficient: true, hasDiagnosis: true, hasTrustedInteraction: true }),
    ).toBe("ESTABLISHED"));
  it("an interaction without a diagnosis never counts as established", () =>
    expect(resolveFirstRunState({ hasBusiness: true, firstReadSufficient: true, hasDiagnosis: false, hasTrustedInteraction: true })).toBe(
      "NEEDS_DIAGNOSIS",
    ));
  it("a diagnosis whose evidence later became insufficient still shows the result, not setup", () =>
    expect(resolveFirstRunState({ hasBusiness: true, firstReadSufficient: false, hasDiagnosis: true, hasTrustedInteraction: false })).toBe(
      "FIRST_RESULT",
    ));
  it("established owners go to the Cockpit and are never sent back to setup on login", () => {
    const e = { hasBusiness: true, firstReadSufficient: true, hasDiagnosis: true, hasTrustedInteraction: true };
    expect(landingAfterLogin(e)).toBe("/owner/cockpit");
    expect(landingAfterVerification(e)).toBe("/owner/cockpit");
    expect(firstRunHref("ESTABLISHED")).toBe("/owner/cockpit");
  });
  it("interrupted first run resumes on login; a viewed first result does not trap the owner", () => {
    expect(landingAfterLogin({ ...base, hasBusiness: true })).toBe("/owner/first-run");
    expect(landingAfterLogin({ hasBusiness: true, firstReadSufficient: true, hasDiagnosis: true, hasTrustedInteraction: false })).toBe(
      "/owner/cockpit",
    );
    expect(landingAfterVerification(base)).toBe("/owner/first-run");
  });
});

describe("FIRST_TRUSTED_DECISION_INTERACTION", () => {
  const at = "2026-10-10T10:00:00.000Z";
  it("requires a first result", () => expect(isFirstTrustedDecisionInteraction(false, [{ kind: "ACTION_ACCEPTED", at }])).toBe(false));
  it("counts accept, correct, improve", () => {
    for (const kind of ["ACTION_ACCEPTED", "EVIDENCE_CORRECTED", "IMPROVEMENT_REQUESTED"])
      expect(isFirstTrustedDecisionInteraction(true, [{ kind, at }])).toBe(true);
  });
  it("does not count views, rejects or defers", () => {
    for (const kind of ["RESULT_VIEWED", "ACTION_REJECTED", "ACTION_DEFERRED", "COCKPIT_REACHED"])
      expect(isFirstTrustedDecisionInteraction(true, [{ kind, at }])).toBe(false);
  });
  it("picks the earliest qualifying interaction and measures TIME_TO_FIRST_VALUE", () => {
    const first = firstTrustedInteraction(true, [
      { kind: "ACTION_ACCEPTED", at: "2026-10-10T10:05:00.000Z" },
      { kind: "EVIDENCE_CORRECTED", at: "2026-10-10T10:01:30.000Z" },
    ]);
    expect(first?.kind).toBe("EVIDENCE_CORRECTED");
    expect(timeToFirstValueSeconds("2026-10-10T10:00:00.000Z", first!.at)).toBe(90);
    expect(timeToFirstValueSeconds(at, "2026-10-10T09:00:00.000Z")).toBeNull();
  });
});

describe("evidence quality drives confidence deterministically", () => {
  const snap: FinancialSnapshotInput = {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "GBP",
    revenue: 10000,
    costOfGoodsOrServices: 3000,
    fixedCosts: 2000,
    salaryPayroll: 1000,
    loanEmiDebtPayments: 0,
    receivables: 0,
    payables: 0,
    ownerWithdrawals: 0,
    orderCount: 10,
    customerCount: 10,
    discountAmount: 0,
    refundAmount: 0,
    cashOnHand: 5000,
  };
  const opts = { now: new Date("2026-10-05T00:00:00Z") };
  it("ACTUAL and unspecified are identical (legacy rows unchanged)", () => {
    const none = calculateDataConfidence(snap, opts).dataConfidenceScore;
    expect(calculateDataConfidence({ ...snap, evidenceQuality: null }, opts).dataConfidenceScore).toBe(none);
    expect(calculateDataConfidence({ ...snap, evidenceQuality: "ACTUAL" }, opts).dataConfidenceScore).toBe(none);
    expect(calculateDataConfidence(snap, opts).confidenceTier).toBe("HIGH");
  });
  it("a good estimate cannot read HIGH; a rough guess cannot read MEDIUM", () => {
    expect(calculateDataConfidence({ ...snap, evidenceQuality: "GOOD_ESTIMATE" }, opts).confidenceTier).toBe("MEDIUM");
    expect(calculateDataConfidence({ ...snap, evidenceQuality: "ROUGH_ESTIMATE" }, opts).confidenceTier).toBe("LOW");
  });
  it("strictly ordered: actual > good > rough", () => {
    const s = (q: "ACTUAL" | "GOOD_ESTIMATE" | "ROUGH_ESTIMATE") => calculateDataConfidence({ ...snap, evidenceQuality: q }, opts).dataConfidenceScore;
    expect(s("ACTUAL")).toBeGreaterThan(s("GOOD_ESTIMATE"));
    expect(s("GOOD_ESTIMATE")).toBeGreaterThan(s("ROUGH_ESTIMATE"));
  });
  it("never goes below zero", () => expect(calculateDataConfidence({ periodStart: "2020-01-01", periodEnd: "2020-01-31", currency: "", evidenceQuality: "ROUGH_ESTIMATE" }, opts).dataConfidenceScore).toBe(0));
});

describe("first Money read is correctly scoped", () => {
  const finding = {
    title: "Cash covers about 12 days of costs",
    summary: "Short cover means a late payment could stop you paying suppliers.",
    sourceMetric: "Cash days of costs",
    sourceValue: 12,
    evidence: ["Cash in hand is small compared with monthly costs"],
    missingData: [],
  };
  const action = {
    title: "Chase overdue customer payments this week",
    description: "List unpaid invoices and contact the largest first.",
    ownerRole: "Owner",
    expectedTimeframeDays: 7,
    verificationMetric: "Cash in hand",
  };
  const read = buildFirstMoneyRead({ finding, action, confidenceScore: 55, evidenceQuality: "ROUGH_ESTIMATE", missingEvidence: ["Receivables"] });
  it("uses the honest heading and money-only scope", () => {
    expect(read.heading).toBe(FIRST_MONEY_READ_HEADING);
    expect(read.scope).toMatch(/money figures only/);
  });
  it("answers the eleven questions from supplied facts only", () => {
    expect(read.noticed).toBe(finding.title);
    expect(read.actualValue).toBe(12);
    expect(read.owner).toBe("Owner");
    expect(read.timing).toBe("Within 7 days");
    expect(read.watchMetric).toBe("Cash in hand");
    expect(read.missingEvidence).toEqual(["Receivables"]);
    expect(read.isEstimated).toBe(true);
    expect(read.evidenceQualityLabel).toBe("A rough guess");
    expect(read.confidenceTier).toBe("LOW");
  });
  it("never overclaims whole-business scope", () => {
    expect(findOverclaims(firstMoneyReadStrings(read))).toEqual([]);
    expect(findOverclaims(["Your biggest business problem"])).toEqual(["biggest business problem"]);
  });
  it("with no finding it does not invent a problem or action", () => {
    const empty = buildFirstMoneyRead({ finding: null, action: null, confidenceScore: 80, evidenceQuality: "ACTUAL", missingEvidence: [] });
    expect(empty.status).toBe("NO_ATTENTION_FOUND");
    expect(empty.recommendedAction).toBeNull();
    expect(empty.actualValue).toBeNull();
    expect(empty.isEstimated).toBe(false);
  });
});

describe("progressive OBQ question selection", () => {
  const firstReadOk = { sufficient: true, basis: "completed", missing: [] } as never;
  const guide = (type: string, supplied: string[]) =>
    buildInputGuidance({ profileType: type as never, ownerRole: "owner_operated" as never, suppliedCategories: supplied as never, firstRead: firstReadOk });

  it("does not ask before the first read is ready", () => {
    const g = buildInputGuidance({ profileType: "retail_storefront" as never, ownerRole: "owner_operated" as never, suppliedCategories: [] });
    expect(selectNextQuestion({ guidance: g, skipped: [], answeredCount: 0 })).toEqual({ done: true, reason: "FIRST_READ_NOT_READY" });
  });
  it("is deterministic and explains what/why/what-it-could-change/effort", () => {
    const g = guide("retail_storefront", ["revenue_sales", "expenses", "cash_debt"]);
    const a = selectNextQuestion({ guidance: g, skipped: [], answeredCount: 0 });
    const b = selectNextQuestion({ guidance: g, skipped: [], answeredCount: 0 });
    expect(a).toEqual(b);
    if (!a.done) {
      expect(a.question.why.length).toBeGreaterThan(0);
      expect(a.question.couldChange.length).toBeGreaterThan(0);
      expect(a.question.effortLabel.length).toBeGreaterThan(0);
    }
  });
  it("never asks an optional-tier category and never repeats a skipped one", () => {
    const g = guide("retail_storefront", ["revenue_sales", "expenses", "cash_debt"]);
    const skipped: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = selectNextQuestion({ guidance: g, skipped, answeredCount: 0 });
      if (r.done) break;
      const tier = g.guidance.find((x) => x.category === r.question.category)!.tier;
      expect(tier).not.toBe("optional");
      expect(skipped).not.toContain(r.question.category);
      skipped.push(r.question.category);
    }
    expect(skipped.length).toBeLessThan(20);
  });
  it("cannot loop: stops at the question limit", () => {
    const g = guide("retail_storefront", ["revenue_sales", "expenses", "cash_debt"]);
    expect(selectNextQuestion({ guidance: g, skipped: [], answeredCount: MAX_PROGRESSIVE_QUESTIONS })).toEqual({
      done: true,
      reason: "QUESTION_LIMIT",
    });
  });
  it("stops when every worthwhile question has been skipped", () => {
    const g = guide("retail_storefront", ["revenue_sales", "expenses", "cash_debt"]);
    const all = g.guidance.map((x) => x.category);
    const r = selectNextQuestion({ guidance: g, skipped: all, answeredCount: 0 });
    expect(r.done).toBe(true);
  });
  it("business archetype can change the ranking", () => {
    const supplied = ["revenue_sales", "expenses", "cash_debt"];
    const picks = new Set(
      [...SMB_ARCHETYPES].map((t) => {
        const r = selectNextQuestion({ guidance: guide(t, supplied), skipped: [], answeredCount: 0 });
        return r.done ? `done:${r.reason}` : r.question.category;
      }),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("progressive OBQ relevance", () => {
  const supplied = ["revenue_sales", "expenses", "cash_debt"] as never;
  it("never asks about categories that cannot change a money read (e.g. proof of completion)", () => {
    for (const t of SMB_ARCHETYPES) {
      const g = buildInputGuidance({ profileType: t, ownerRole: "owner_operated", suppliedCategories: supplied, firstRead: { sufficient: true } as never });
      const skipped: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = selectNextQuestion({ guidance: g, skipped, answeredCount: 0 });
        if (r.done) break;
        expect(r.question.category).not.toBe("proof_completion");
        const meta = g.guidance.find((x) => x.category === r.question.category)!;
        expect(["finance_cash", "margin_pricing", "working_capital"].includes(meta.confidenceDomain) || meta.tier === "minimum").toBe(true);
        skipped.push(r.question.category);
      }
    }
  });
  it("a B2B contract firm is asked about its contracts (archetype minimum) while a storefront is not", () => {
    const ask = (t: string) => {
      const g = buildInputGuidance({ profileType: t as never, ownerRole: "owner_operated", suppliedCategories: supplied, firstRead: { sufficient: true } as never });
      const seen: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = selectNextQuestion({ guidance: g, skipped: seen, answeredCount: 0 });
        if (r.done) break;
        seen.push(r.question.category);
      }
      return seen;
    };
    expect(ask("b2b_project_contract_service")).toContain("b2b_contracts");
    expect(ask("retail_storefront")).not.toContain("b2b_contracts");
  });
  it("higher-value evidence outranks lower-value evidence at the same severity", () => {
    const g = buildInputGuidance({ profileType: "b2b_project_contract_service", ownerRole: "owner_operated", suppliedCategories: supplied, firstRead: { sufficient: true } as never });
    const r = selectNextQuestion({ guidance: g, skipped: [], answeredCount: 0 });
    expect(r.done).toBe(false);
    if (!r.done) {
      const picked = g.guidance.find((x) => x.category === r.question.category)!;
      // the first pick is the top of the catalog ordering: critical severity, highest gain among the candidates
      expect(picked.severity).toBe("critical");
      expect(picked.expectedConfidenceGain).toBe("high");
    }
  });
});
