/**
 * Controlled Beta Cohort evidence model — pure domain contract.
 *
 * The properties that matter most: telemetry never becomes evidence; UNKNOWN is a real state that is never coerced;
 * the ledger is append-only with latest-statement-wins; TIME_TO_FIRST_TRUSTED_VALUE follows its documented definition;
 * the expansion gate starts and stays CLOSED unless genuine-owner evidence satisfies every criterion.
 */
import { describe, it, expect } from "vitest";
import {
  assignmentInputSchema, buildOwnerView, computeFirstTrustedValue, DAY_MS, emptyAutomaticFacts, evaluateExpansionGate,
  evidenceEntrySchema, evidenceInputSchema, reduceLedger, sanitiseCohortText, type CohortAssignment, type CohortAutomaticFacts,
  type CohortKind, type EvidenceEntry, type LedgerEntry,
} from "@/domain/beta-cohort/evidence";

const T0 = new Date("2026-10-20T09:00:00.000Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60_000);
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const entry = (e: EvidenceEntry, recordedAt: Date): LedgerEntry => ({ id: id(), recordedAt, actorId: null, entry: evidenceEntrySchema.parse(e) });
const obs = (over: Record<string, unknown>) => ({ entryType: "OBSERVATION", source: "OPERATOR_OBSERVED", ...over }) as EvidenceEntry;

function facts(over: Partial<CohortAutomaticFacts> = {}): CohortAutomaticFacts {
  return {
    ...emptyAutomaticFacts(at(-60 * 24)), accountFound: true, signupAt: at(-60), emailVerifiedAt: at(0), firstRunStartedAt: at(2),
    firstFindingAt: at(10), firstResultViewedAt: at(11), ...over,
  };
}
const assignment = (kind: CohortKind = "REAL_OWNER", code = "CB1-001"): CohortAssignment => ({ betaRequestId: id(), cohortId: "CB1", ownerCode: code, kind, assignedAt: at(-1000) });

describe("input validation", () => {
  it("rejects an empty observation, unknown fields and a missing date for DONE", () => {
    expect(evidenceEntrySchema.safeParse({ entryType: "OBSERVATION", source: "OPERATOR_OBSERVED" }).success).toBe(false);
    expect(evidenceEntrySchema.safeParse(obs({ understanding: "YES", surprise: 1 })).success).toBe(false);
    expect(evidenceEntrySchema.safeParse(obs({ realWorldAction: "DONE" })).success).toBe(false);
    expect(evidenceEntrySchema.safeParse(obs({ realWorldAction: "NOT_DONE", actionTakenOn: "2026-10-01" })).success).toBe(false);
    expect(evidenceEntrySchema.safeParse(obs({ realWorldAction: "DONE", actionTakenOn: "2026-10-01" })).success).toBe(true);
  });

  it("enforces the owner-code shape and that it belongs to the cohort", () => {
    const base = { betaRequestId: "6f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e11", cohortId: "CB1", kind: "REAL_OWNER", idempotencyKey: "assign-key-1" };
    expect(assignmentInputSchema.safeParse({ ...base, ownerCode: "CB1-001" }).success).toBe(true);
    expect(assignmentInputSchema.safeParse({ ...base, ownerCode: "CB2-001" }).success).toBe(false);
    expect(assignmentInputSchema.safeParse({ ...base, ownerCode: "cb1-1" }).success).toBe(false);
    expect(assignmentInputSchema.safeParse({ ...base, ownerCode: "CB1-001", kind: "FAKE" }).success).toBe(false);
  });

  it("T+7: PROVED needs the action done, a described signal AND a stated causal basis; CAUSAL_EVIDENCE needs notes", () => {
    const f = (over: Record<string, unknown>) => evidenceEntrySchema.safeParse({
      entryType: "FOLLOW_UP_T7", source: "OWNER_STATED", actionTaken: "DONE", recommendationStillRelevant: "YES",
      measurableSignalChanged: "YES", signalNote: "late payments fewer", ownerUsefulness: "YES", shouldChangeConclusion: "NO",
      outcome: "PROVED", causalBasis: "CORRELATION_ONLY", ...over,
    });
    expect(f({}).success).toBe(true);
    expect(f({ causalBasis: "NOT_ESTABLISHED" }).success).toBe(false); // correlation not even claimed → cannot be PROVED
    expect(f({ causalBasis: undefined }).success).toBe(false); // defaults to NOT_ESTABLISHED
    expect(f({ signalNote: undefined }).success).toBe(false);
    expect(f({ measurableSignalChanged: "UNKNOWN", signalNote: undefined }).success).toBe(false);
    expect(f({ actionTaken: "NOT_DONE" }).success).toBe(false);
    expect(f({ causalBasis: "CAUSAL_EVIDENCE" }).success).toBe(false);
    expect(f({ causalBasis: "CAUSAL_EVIDENCE", notes: "controlled, nothing else changed" }).success).toBe(true);
    // The honest default: UNKNOWN outcome with nothing established is always valid.
    expect(f({ outcome: "UNKNOWN", measurableSignalChanged: "UNKNOWN", signalNote: undefined, causalBasis: "NOT_ESTABLISHED", actionTaken: "UNKNOWN" }).success).toBe(true);
  });

  it("the envelope rejects unknown top-level keys", () => {
    expect(evidenceInputSchema.safeParse({ betaRequestId: "6f1c2f6a-7a56-4a66-8f2b-9a8b3c0d1e11", idempotencyKey: "key-12345", entry: obs({ trust: "YES" }), email: "x@y.com" }).success).toBe(false);
  });
});

describe("free-text hygiene", () => {
  it("redacts emails, URLs and token-like strings, strips control characters and bounds length", () => {
    const out = sanitiseCohortText("mail a@b.com see https://x.y/z?t=1 tok 0123456789abcdef0123456789abcdef01\u0000\u0007 end", 500);
    expect(out).not.toMatch(/a@b\.com|https?:|0123456789abcdef/);
    expect(out).toContain("[redacted-email]");
    expect(out).toContain("[redacted-url]");
    expect(out).toContain("[redacted-token]");
    expect(out).not.toMatch(/[\u0000-\u0008]/);
    expect(sanitiseCohortText("ordinary words ".repeat(60), 100)).toHaveLength(100);
    expect(sanitiseCohortText("x".repeat(900), 100)).toBe("[redacted-token]"); // a long unbroken run is token-like and is never stored
  });
});

describe("telemetry is never evidence; UNKNOWN is never coerced", () => {
  it("with no entries every evidence field is UNKNOWN / NONE", () => {
    const s = reduceLedger([]);
    expect([s.understanding, s.trust, s.wouldTakeAction, s.realWorldAction, s.outcome]).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(s.severity).toBe("NONE");
    expect(s.followUp).toBeNull();
    expect(s.t7DueAt).toBeNull();
  });

  it("an in-product ACCEPT, a USEFUL rating and a return visit leave understanding, trust, real-world action and outcome UNKNOWN", () => {
    const view = buildOwnerView({
      assignment: assignment(),
      automatic: facts({
        productDecision: { state: "ACCEPTED", decidedAt: at(20) },
        productFeedback: { rating: "USEFUL", reason: null, at: at(21) },
        ownerReportedOutcome: { status: "worked", at: at(30) },
        firstReturnVisitAt: at(60 * 30),
      }),
      entries: [], now: at(60 * 40),
    });
    expect(view.evidence.understanding).toBe("UNKNOWN");
    expect(view.evidence.trust).toBe("UNKNOWN");
    expect(view.evidence.realWorldAction).toBe("UNKNOWN");
    expect(view.evidence.outcome).toBe("UNKNOWN");
    expect(view.firstTrustedValue).toBeNull();
    expect(view.t7.status).toBe("NOT_SCHEDULED");
  });

  it("recording trust alone does not set understanding, and an explicit UNKNOWN is preserved (not NO)", () => {
    const s = reduceLedger([entry(obs({ trust: "PARTIAL" }), at(1)), entry(obs({ understanding: "UNKNOWN" }), at(2))]);
    expect(s.trust).toBe("PARTIAL");
    expect(s.understanding).toBe("UNKNOWN");
    expect(s.understanding).not.toBe("NO");
  });

  it("latest statement wins, history is retained, and ordering is by time then id", () => {
    const s = reduceLedger([
      entry(obs({ understanding: "NO" }), at(1)),
      entry(obs({ understanding: "YES" }), at(5)),
      entry(obs({ understanding: "PARTIAL" }), at(3)),
    ]);
    expect(s.understanding).toBe("YES");
    expect(s.entryCount).toBe(3);
  });

  it("a duplicate of the same statement changes nothing", () => {
    const e = obs({ trust: "YES", understanding: "YES" });
    const once = reduceLedger([entry(e, at(1))]);
    const twice = reduceLedger([entry(e, at(1)), entry(e, at(1))]);
    expect({ ...twice, entryCount: 0 }).toEqual({ ...once, entryCount: 0 });
  });
});

describe("real-world action and T+7 scheduling", () => {
  it("DONE with a date schedules T+7 exactly seven days later; NOT_DONE clears it; the follow-up completes it", () => {
    const done = reduceLedger([entry(obs({ realWorldAction: "DONE", actionTakenOn: "2026-10-21" }), at(5))]);
    expect(done.actionTakenOn).toBe("2026-10-21");
    expect(done.t7DueAt?.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    const reverted = reduceLedger([entry(obs({ realWorldAction: "DONE", actionTakenOn: "2026-10-21" }), at(5)), entry(obs({ realWorldAction: "NOT_DONE" }), at(9))]);
    expect(reverted.t7DueAt).toBeNull();
    expect(reverted.realWorldAction).toBe("NOT_DONE");
  });

  it("status moves NOT_SCHEDULED → NOT_DUE → DUE → OVERDUE → COMPLETED", () => {
    const e = [entry(obs({ realWorldAction: "DONE", actionTakenOn: "2026-10-21" }), at(5))];
    const view = (now: Date, extra: LedgerEntry[] = []) => buildOwnerView({ assignment: assignment(), automatic: facts(), entries: [...e, ...extra], now }).t7.status;
    expect(view(new Date("2026-10-27T23:00:00Z"))).toBe("NOT_DUE");
    expect(view(new Date("2026-10-28T08:00:00Z"))).toBe("DUE");
    expect(view(new Date(new Date("2026-10-28T00:00:00Z").getTime() + 3 * DAY_MS))).toBe("OVERDUE");
    const followUp = entry({
      entryType: "FOLLOW_UP_T7", source: "OWNER_STATED", actionTaken: "DONE", recommendationStillRelevant: "YES", measurableSignalChanged: "UNKNOWN",
      ownerUsefulness: "PARTIAL", shouldChangeConclusion: "UNKNOWN", outcome: "UNKNOWN", causalBasis: "NOT_ESTABLISHED",
    }, at(60 * 24 * 8));
    expect(view(new Date("2026-11-30T00:00:00Z"), [followUp])).toBe("COMPLETED");
  });

  it("the follow-up records the outcome and causal basis exactly as stated and never upgrades them", () => {
    const s = reduceLedger([entry({
      entryType: "FOLLOW_UP_T7", source: "OWNER_STATED", actionTaken: "DONE", recommendationStillRelevant: "YES", measurableSignalChanged: "YES",
      signalNote: "fewer overdue invoices", ownerUsefulness: "YES", shouldChangeConclusion: "NO", outcome: "PARTIAL", causalBasis: "CORRELATION_ONLY",
    }, at(1))]);
    expect(s.outcome).toBe("PARTIAL");
    expect(s.followUp?.causalBasis).toBe("CORRELATION_ONLY");
    expect(s.realWorldAction).toBe("DONE");
  });
});

describe("issues and severity", () => {
  const issue = (severity: "P0" | "P1" | "P2", trustBlocker = false, summary = "x") =>
    entry({ entryType: "ISSUE", severity, category: "TRUST", summary, trustBlocker }, at(1));

  it("severity is the worst OPEN issue; resolving removes it; NONE when nothing is open", () => {
    const p2 = issue("P2", true);
    const p1 = issue("P1");
    expect(reduceLedger([p2, p1]).severity).toBe("P1");
    const resolved = entry({ entryType: "ISSUE_RESOLUTION", issueId: p1.id, resolutionNote: "fixed" }, at(9));
    const s = reduceLedger([p2, p1, resolved]);
    expect(s.severity).toBe("P2");
    expect(s.openP2TrustBlockers).toBe(1);
    const all = reduceLedger([p2, p1, resolved, entry({ entryType: "ISSUE_RESOLUTION", issueId: p2.id, resolutionNote: "ok" }, at(10))]);
    expect(all.severity).toBe("NONE");
    expect(all.openIssues).toHaveLength(0);
  });

  it("only P2 issues flagged trustBlocker count as P2 trust blockers", () => {
    expect(reduceLedger([issue("P2", false)]).openP2TrustBlockers).toBe(0);
    expect(reduceLedger([issue("P1", true)]).openP2TrustBlockers).toBe(0);
  });
});

describe("TIME_TO_FIRST_TRUSTED_VALUE — exact definition", () => {
  it("is null while the owner has not been shown a finding, however positive the statements", () => {
    expect(computeFirstTrustedValue(facts({ firstResultViewedAt: null }), [entry(obs({ understanding: "YES", trust: "YES" }), at(30))])).toBeNull();
    expect(computeFirstTrustedValue(facts({ firstFindingAt: null }), [entry(obs({ understanding: "YES", trust: "YES" }), at(30))])).toBeNull();
  });

  it("requires understanding = YES (PARTIAL/NO/UNKNOWN do not qualify) and trust != NO", () => {
    for (const u of ["PARTIAL", "NO", "UNKNOWN"] as const) {
      expect(computeFirstTrustedValue(facts(), [entry(obs({ understanding: u, trust: "YES" }), at(30))])).toBeNull();
    }
    expect(computeFirstTrustedValue(facts(), [entry(obs({ understanding: "YES", trust: "NO" }), at(30))])).toBeNull();
  });

  it("measures from email verification, to the moment of the qualifying statement", () => {
    const v = computeFirstTrustedValue(facts(), [entry(obs({ understanding: "YES", trust: "YES", observedAt: at(40).toISOString() }), at(90))])!;
    expect(v.startedFrom).toBe("EMAIL_VERIFIED");
    expect(v.secondsFromVerification).toBe(40 * 60);
    expect(v.trustWasExplicit).toBe(true);
    expect(v.stillHolds).toBe(true);
  });

  it("falls back to password set, then first-run start, when verification is not instrumented", () => {
    const e = [entry(obs({ understanding: "YES" }), at(30))];
    expect(computeFirstTrustedValue(facts({ emailVerifiedAt: null, passwordSetAt: at(1) }), e)?.startedFrom).toBe("PASSWORD_SET");
    expect(computeFirstTrustedValue(facts({ emailVerifiedAt: null, passwordSetAt: null }), e)?.startedFrom).toBe("FIRST_RUN_STARTED");
    expect(computeFirstTrustedValue(facts({ emailVerifiedAt: null, passwordSetAt: null, firstRunStartedAt: null }), e)?.secondsFromVerification).toBeNull();
  });

  it("is never earlier than the finding or the moment it was shown, even if the statement claims an earlier time", () => {
    const v = computeFirstTrustedValue(facts(), [entry(obs({ understanding: "YES", trust: "YES", observedAt: at(5).toISOString() }), at(20))])!;
    expect(v.reachedAt.toISOString()).toBe(at(11).toISOString());
  });

  it("trust UNKNOWN counts as not-rejected but is reported as not explicit; a later NO withdraws it (stillHolds=false) without erasing when it was first reached", () => {
    const e1 = entry(obs({ understanding: "YES" }), at(30));
    const v1 = computeFirstTrustedValue(facts(), [e1])!;
    expect(v1.trustWasExplicit).toBe(false);
    const v2 = computeFirstTrustedValue(facts(), [e1, entry(obs({ trust: "NO" }), at(60))])!;
    expect(v2.reachedAt.toISOString()).toBe(at(30).toISOString());
    expect(v2.stillHolds).toBe(false);
  });
});

describe("next operator step", () => {
  const step = (a: Partial<CohortAutomaticFacts>, entries: LedgerEntry[] = [], now = at(100)) =>
    buildOwnerView({ assignment: assignment(), automatic: facts(a), entries, now }).nextOperatorStep;

  it("walks the journey in order", () => {
    expect(step({ signupAt: null })).toMatch(/Waiting for signup/);
    expect(step({ emailVerifiedAt: null })).toMatch(/not verified/);
    expect(step({ firstResultViewedAt: null })).toMatch(/first read/);
    expect(step({})).toMatch(/understand/i);
    expect(step({}, [entry(obs({ understanding: "YES" }), at(20))])).toMatch(/accurate enough/);
    expect(step({}, [entry(obs({ understanding: "YES", trust: "YES", wouldTakeAction: "YES" }), at(20))])).toMatch(/actually take the action/);
  });

  it("an open P0/P1 outranks everything", () => {
    const e = [entry({ entryType: "ISSUE", severity: "P1", category: "BAD_RECOMMENDATION", summary: "contradicts evidence", trustBlocker: true }, at(1))];
    expect(step({ signupAt: null }, e)).toMatch(/open P1/);
  });
});

describe("expansion gate", () => {
  /** A genuine owner who has fully satisfied the journey. */
  function genuine(code: string, over: Partial<CohortAutomaticFacts> = {}, extra: LedgerEntry[] = []) {
    return buildOwnerView({
      assignment: assignment("REAL_OWNER", code),
      automatic: facts({ firstReturnVisitAt: at(60 * 30), returnVisitCount: 2, ...over }),
      entries: [entry(obs({ understanding: "YES", trust: "YES", realWorldAction: "DONE", actionTakenOn: "2026-10-21" }), at(30)), ...extra],
      now: at(60 * 40),
    });
  }

  it("starts CLOSED with no owners", () => {
    const g = evaluateExpansionGate([]);
    expect(g.gate).toBe("CLOSED");
    expect(g.realOwnersCounted).toBe(0);
    expect(g.unmet.length).toBeGreaterThan(0);
  });

  it("QA mechanics and fixture businesses are shown but never counted", () => {
    const qa = buildOwnerView({ assignment: assignment("QA_MECHANICS", "CB1-009"), automatic: facts(), entries: [], now: at(100) });
    const fixture = genuine("CB1-010", { isFixtureBusiness: true });
    const noAccount = genuine("CB1-011", { accountFound: false });
    expect(qa.countedInGate).toBe(false);
    expect(fixture.countedInGate).toBe(false);
    expect(noAccount.countedInGate).toBe(false);
    expect(evaluateExpansionGate([qa, fixture, noAccount]).realOwnersCounted).toBe(0);
  });

  it("three genuine owners satisfying every criterion with no open issues OPEN the gate", () => {
    const g = evaluateExpansionGate([genuine("CB1-001"), genuine("CB1-002"), genuine("CB1-003")]);
    expect(g.unmet).toEqual([]);
    expect(g.gate).toBe("OPEN");
    expect(g.criteria.REAL_OWNER_ACTION).toBe("OBSERVED");
    expect(g.criteria.RETURN_USAGE).toBe("OBSERVED");
  });

  it("two genuine owners are not enough, however good", () => {
    expect(evaluateExpansionGate([genuine("CB1-001"), genuine("CB1-002")]).gate).toBe("CLOSED");
  });

  it("QA accounts cannot make up the numbers", () => {
    const qa = buildOwnerView({ assignment: assignment("QA_MECHANICS", "CB1-004"), automatic: facts({ firstReturnVisitAt: at(1) }), entries: [entry(obs({ understanding: "YES", trust: "YES" }), at(30))], now: at(100) });
    expect(evaluateExpansionGate([genuine("CB1-001"), genuine("CB1-002"), qa]).gate).toBe("CLOSED");
  });

  it("an open P0, an open P1 or an open P2 trust blocker each keep it CLOSED; a plain P2 does not", () => {
    const base = [genuine("CB1-001"), genuine("CB1-002")];
    const withIssue = (sev: "P0" | "P1" | "P2", trustBlocker: boolean) =>
      evaluateExpansionGate([...base, genuine("CB1-003", {}, [entry({ entryType: "ISSUE", severity: sev, category: "TRUST", summary: "x", trustBlocker }, at(35))])]);
    expect(withIssue("P0", false).gate).toBe("CLOSED");
    expect(withIssue("P1", false).gate).toBe("CLOSED");
    expect(withIssue("P2", true).gate).toBe("CLOSED");
    expect(withIssue("P2", false).gate).toBe("OPEN");
  });

  it("understanding must be explicit YES; telemetry-only owners do not satisfy it", () => {
    const telemetryOnly = (code: string) => buildOwnerView({
      assignment: assignment("REAL_OWNER", code),
      automatic: facts({ productDecision: { state: "ACCEPTED", decidedAt: at(20) }, productFeedback: { rating: "USEFUL", reason: null, at: at(21) }, firstReturnVisitAt: at(500) }),
      entries: [], now: at(60 * 40),
    });
    const g = evaluateExpansionGate([telemetryOnly("CB1-001"), telemetryOnly("CB1-002"), telemetryOnly("CB1-003")]);
    expect(g.gate).toBe("CLOSED");
    expect(g.criteria.REAL_OWNER_UNDERSTANDING).toBe("NOT_YET");
    expect(g.criteria.REAL_OWNER_ACTION).toBe("NOT_YET");
  });
});
