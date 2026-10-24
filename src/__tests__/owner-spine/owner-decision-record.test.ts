/**
 * Owner decision / commitment rules (pure): canonical candidate identity, state ↔ contract rules, null-vs-zero,
 * direction never defaulted, deterministic event fingerprints.
 */
import { describe, it, expect } from "vitest";
import {
  decisionRequestFingerprint, normalizeDecisionBody, normalizeOutcomeContract, outcomeContractInputSchema, parseOwnerCandidateId,
  recordOwnerDecisionSchema, stableStringify, OWNER_DECISION_STATES,
} from "@/domain/owner-spine/owner-decision-record";
import { ValidationError } from "@/infra/errors";

const U = "0b6f2d1e-3c4a-4b5d-8e6f-123456789abc";

describe("canonical candidate identity", () => {
  it("accepts only the deterministic persisted forms", () => {
    expect(parseOwnerCandidateId(`domain_action:finance:${U}`)).toMatchObject({ source: "domain_action", domain: "finance", sourceId: U });
    expect(parseOwnerCandidateId(`domain_action:recovery:${U}`)?.domain).toBe("recovery");
    expect(parseOwnerCandidateId(`compliance_item:${U}`)).toMatchObject({ source: "compliance_item", sourceId: U });
  });
  it("rejects display text, unsupported sources/domains, case variants and malformed ids (nothing is guessed)", () => {
    for (const bad of [
      "Right-size fixed costs", "", "domain_action:finance", `domain_action:finance:${U}:x`, `domain_action:customer:${U}`, `domain_action:portfolio:${U}`,
      `domain_action:Finance:${U}`, `domain_action:finance:${U.toUpperCase()}`, `business_risk:${U}`, `survival_reading:finance:FIN_X`, `evidence_refresh:${U}`,
      `safety_gate:${U}`, `compliance_item:${U}:extra`, `compliance_item:not-a-uuid`,
    ]) expect(parseOwnerCandidateId(bad), bad).toBeNull();
  });
});

describe("decision states", () => {
  it("are exactly ACCEPTED / REJECTED / DEFERRED / MODIFIED (no synonyms)", () => {
    expect([...OWNER_DECISION_STATES]).toEqual(["ACCEPTED", "REJECTED", "DEFERRED", "MODIFIED"]);
    expect(recordOwnerDecisionSchema.safeParse({ candidateId: "x", state: "APPROVED" }).success).toBe(false);
    expect(recordOwnerDecisionSchema.safeParse({ candidateId: "x", state: "accepted" }).success).toBe(false);
  });
  it("REJECTED / DEFERRED carry no execution contract; a revisit date belongs only to DEFERRED", () => {
    expect(normalizeDecisionBody({ state: "REJECTED" }).contract).toBeNull();
    expect(normalizeDecisionBody({ state: "DEFERRED", revisitAt: "2026-09-01T00:00:00.000Z" }).revisitAt).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(() => normalizeDecisionBody({ state: "REJECTED", contract: { targetValue: 3 } })).toThrow(ValidationError);
    expect(() => normalizeDecisionBody({ state: "DEFERRED", contract: { targetDirection: "up" } })).toThrow(ValidationError);
    expect(() => normalizeDecisionBody({ state: "ACCEPTED", revisitAt: "2026-09-01T00:00:00.000Z" })).toThrow(ValidationError);
    // an all-null contract object is not "a contract"
    expect(normalizeDecisionBody({ state: "REJECTED", contract: { targetValue: null, baselineValue: null } }).contract).toBeNull();
  });
  it("MODIFIED must state the action the owner will actually take", () => {
    expect(() => normalizeDecisionBody({ state: "MODIFIED", contract: {} })).toThrow(ValidationError);
    expect(normalizeDecisionBody({ state: "MODIFIED", contract: { commitmentDescription: "Do Y instead of X" } }).contract?.commitmentDescription).toBe("Do Y instead of X");
  });
});

describe("outcome contract: unknown is null, zero is zero, direction is never defaulted", () => {
  it("null/omitted means unknown for every measurable field", () => {
    expect(normalizeOutcomeContract({})).toEqual({
      commitmentDescription: null, verificationMetric: null, baselineValue: null, baselineProvenance: null, targetDirection: "unknown",
      targetValue: null, observationWindowDays: null, intendedCompletionAt: null, expectedMeasurementSource: null,
    });
    expect(normalizeOutcomeContract(null).targetValue).toBeNull();
  });
  it("an explicit 0 is a known zero (baseline and target), not null", () => {
    const c = normalizeOutcomeContract({ baselineValue: 0, baselineProvenance: "OWNER_REPORTED", targetValue: 0 });
    expect(c.baselineValue).toBe(0);
    expect(c.targetValue).toBe(0);
    expect(c.baselineProvenance).toBe("OWNER_REPORTED");
  });
  it("a baseline value needs its provenance; a provenance (other than UNKNOWN) needs a baseline value", () => {
    expect(() => normalizeOutcomeContract({ baselineValue: 5 })).toThrow(ValidationError);
    expect(() => normalizeOutcomeContract({ baselineValue: 0 })).toThrow(ValidationError);
    expect(() => normalizeOutcomeContract({ baselineProvenance: "MEASURED" })).toThrow(ValidationError);
    expect(normalizeOutcomeContract({ baselineValue: 5, baselineProvenance: "UNKNOWN" }).baselineProvenance).toBe("UNKNOWN");
  });
  it("direction is up / down / unknown only; omitted = unknown, and a metric name never implies a direction", () => {
    expect(normalizeOutcomeContract({ targetDirection: "up" }).targetDirection).toBe("up");
    expect(normalizeOutcomeContract({ targetDirection: "down" }).targetDirection).toBe("down");
    expect(normalizeOutcomeContract({ targetDirection: null }).targetDirection).toBe("unknown");
    for (const metric of ["revenue_growth_pct", "profit", "complaint_count", "cost"]) {
      expect(normalizeOutcomeContract({ verificationMetric: metric }).targetDirection).toBe("unknown");
    }
    expect(outcomeContractInputSchema.safeParse({ targetDirection: "sideways" }).success).toBe(false);
    expect(outcomeContractInputSchema.safeParse({ targetDirection: "UP" }).success).toBe(false);
  });
  it("window must be a positive whole number of days; non-finite numbers are rejected", () => {
    for (const bad of [0, -1, 1.5, 4000]) expect(outcomeContractInputSchema.safeParse({ observationWindowDays: bad }).success).toBe(false);
    expect(outcomeContractInputSchema.safeParse({ observationWindowDays: 30 }).success).toBe(true);
    expect(outcomeContractInputSchema.safeParse({ targetValue: Number.NaN }).success).toBe(false);
    expect(outcomeContractInputSchema.safeParse({ baselineValue: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
  it("the server alone supplies conclusions: a contract cannot carry measurement/attainment/resolution fields", () => {
    for (const forbidden of ["measurementResult", "targetAttainment", "issueResolution", "causalAttribution", "learningEligibility", "afterValue"]) {
      expect(outcomeContractInputSchema.safeParse({ [forbidden]: "IMPROVED" }).success, forbidden).toBe(false);
    }
  });
});

describe("decision event fingerprint", () => {
  const body = normalizeDecisionBody({ state: "ACCEPTED", ownerReason: "ok", contract: { targetValue: 0, targetDirection: "down" } });
  it("is deterministic and independent of key order", () => {
    const a = decisionRequestFingerprint({ candidateId: "c", actorId: "u", body });
    expect(a).toBe(decisionRequestFingerprint({ candidateId: "c", actorId: "u", body: { ...body } }));
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe(stableStringify({ a: [2, { c: 0, d: 1 }], b: 1 }));
  });
  it("changes with the candidate, the actor, the state, a zero-vs-null target and the direction", () => {
    const base = decisionRequestFingerprint({ candidateId: "c", actorId: "u", body });
    expect(decisionRequestFingerprint({ candidateId: "c2", actorId: "u", body })).not.toBe(base);
    expect(decisionRequestFingerprint({ candidateId: "c", actorId: "u2", body })).not.toBe(base);
    expect(decisionRequestFingerprint({ candidateId: "c", actorId: "u", body: normalizeDecisionBody({ state: "DEFERRED" }) })).not.toBe(base);
    expect(decisionRequestFingerprint({ candidateId: "c", actorId: "u", body: normalizeDecisionBody({ state: "ACCEPTED", ownerReason: "ok", contract: { targetValue: null, targetDirection: "down" } }) })).not.toBe(base);
    expect(decisionRequestFingerprint({ candidateId: "c", actorId: "u", body: normalizeDecisionBody({ state: "ACCEPTED", ownerReason: "ok", contract: { targetValue: 0, targetDirection: "up" } }) })).not.toBe(base);
  });
});
