/**
 * Unit tests for startup-evidence-evaluation.ts
 * Tests: classifyEvidenceFreshness, detectEvidenceConflicts, hasStaleEvidence
 */
import { describe, it, expect } from "vitest";
import {
  classifyEvidenceFreshness,
  classifyAllEvidence,
  detectEvidenceConflicts,
  hasStaleEvidence,
  type EvidenceForEvaluation,
} from "@/domain/owner-strategy/startup-evidence-evaluation";

const BASE_DATE = new Date("2024-06-01T00:00:00Z");

function makeEvidence(overrides: Partial<EvidenceForEvaluation> = {}): EvidenceForEvaluation {
  return {
    id: "ev-1",
    sourceType: "FIELD_OBSERVATION",
    evidenceType: "CUSTOMER_DEMAND",
    retrievedAt: new Date("2024-03-01T00:00:00Z"),   // 92 days before BASE_DATE
    expiresAt: null,
    currentVerificationRequired: false,
    reliabilityScore: 70,
    confidence: 75,
    observedResult: "Customers confirmed demand",
    hypothesisId: null,
    materialClaim: null,
    ...overrides,
  };
}

describe("classifyEvidenceFreshness", () => {
  it("returns CURRENT_VERIFICATION_REQUIRED when flag is set, regardless of date", () => {
    const ev = makeEvidence({ currentVerificationRequired: true });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("CURRENT_VERIFICATION_REQUIRED");
  });

  it("FIELD_OBSERVATION stale threshold is 90 days — just past returns STALE", () => {
    const ev = makeEvidence({ retrievedAt: new Date("2024-03-01T00:00:00Z"), sourceType: "FIELD_OBSERVATION" });
    // 92 days after 2024-03-01 = stale for FIELD_OBSERVATION (threshold 90d)
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("STALE");
  });

  it("AUTHORITATIVE_PRIMARY at 180 days is NO_EXPIRY_POLICY (well within 365d threshold)", () => {
    const ev = makeEvidence({
      sourceType: "AUTHORITATIVE_PRIMARY",
      retrievedAt: new Date("2023-12-05T00:00:00Z"),  // ~178 days before Jun 1 2024
    });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    // Without explicit expiresAt, policy is NO_EXPIRY_POLICY when within threshold
    expect(result.state).toBe("NO_EXPIRY_POLICY");
  });

  it("UNVERIFIED stale threshold is 30 days", () => {
    const ev = makeEvidence({
      sourceType: "UNVERIFIED",
      retrievedAt: new Date("2024-04-15T00:00:00Z"),  // 47 days before Jun 1 2024
    });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("STALE");
  });

  it("evidence nearing explicit expiry threshold returns NEARING_EXPIRY", () => {
    const tenDaysOut = new Date(BASE_DATE.getTime() + 10 * 24 * 60 * 60 * 1000);
    const ev = makeEvidence({ expiresAt: tenDaysOut, retrievedAt: new Date("2024-05-01T00:00:00Z") });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("NEARING_EXPIRY");
  });

  it("explicitly expired evidence returns STALE", () => {
    const expired = new Date(BASE_DATE.getTime() - 1 * 24 * 60 * 60 * 1000);
    const ev = makeEvidence({ expiresAt: expired });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("STALE");
  });

  it("fresh evidence with explicit expiry far out returns FRESH", () => {
    const farOut = new Date(BASE_DATE.getTime() + 90 * 24 * 60 * 60 * 1000);
    const ev = makeEvidence({ expiresAt: farOut, retrievedAt: new Date("2024-05-20T00:00:00Z") });
    const result = classifyEvidenceFreshness(ev, BASE_DATE);
    expect(result.state).toBe("FRESH");
  });
});

describe("detectEvidenceConflicts", () => {
  it("returns no conflicts when evidence has no material claim", () => {
    const ev1 = makeEvidence({ id: "ev-1", materialClaim: null });
    const ev2 = makeEvidence({ id: "ev-2", materialClaim: null });
    const freshness = classifyAllEvidence([ev1, ev2], BASE_DATE);
    expect(detectEvidenceConflicts([ev1, ev2], freshness)).toHaveLength(0);
  });

  it("detects MATERIAL conflict when both high-reliability sources disagree on same claim", () => {
    const claim = "customer_demand_exists";
    const ev1 = makeEvidence({ id: "ev-1", materialClaim: claim, observedResult: "customers confirmed positive demand", reliabilityScore: 80, confidence: 80, retrievedAt: new Date("2024-05-28T00:00:00Z") });
    const ev2 = makeEvidence({ id: "ev-2", materialClaim: claim, observedResult: "customers denied interest, no demand found", reliabilityScore: 80, confidence: 80, retrievedAt: new Date("2024-05-29T00:00:00Z") });
    const freshness = classifyAllEvidence([ev1, ev2], BASE_DATE);
    const conflicts = detectEvidenceConflicts([ev1, ev2], freshness);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("MATERIAL");
    expect(conflicts[0].propagatesToReadiness).toBe(true);
  });

  it("prefers fresher source in resolution when one is stale", () => {
    const claim = "regulatory_approval";
    const staleDate = new Date("2023-01-01T00:00:00Z");  // stale FIELD_OBSERVATION
    const freshDate = new Date("2024-05-20T00:00:00Z");
    const ev1 = makeEvidence({ id: "ev-1", materialClaim: claim, observedResult: "regulatory approval confirmed", sourceType: "FIELD_OBSERVATION", retrievedAt: staleDate });
    const ev2 = makeEvidence({ id: "ev-2", materialClaim: claim, observedResult: "regulatory approval denied rejected", sourceType: "FIELD_OBSERVATION", retrievedAt: freshDate });
    const freshness = classifyAllEvidence([ev1, ev2], BASE_DATE);
    const conflicts = detectEvidenceConflicts([ev1, ev2], freshness);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].resolution).toBe("PREFER_B");
  });

  it("no conflicts when evidence on same claim does not contradict", () => {
    const claim = "supplier_available";
    const ev1 = makeEvidence({ id: "ev-1", materialClaim: claim, observedResult: "supplier confirmed availability", retrievedAt: new Date("2024-05-20T00:00:00Z") });
    const ev2 = makeEvidence({ id: "ev-2", materialClaim: claim, observedResult: "supplier confirmed positive", retrievedAt: new Date("2024-05-21T00:00:00Z") });
    const freshness = classifyAllEvidence([ev1, ev2], BASE_DATE);
    expect(detectEvidenceConflicts([ev1, ev2], freshness)).toHaveLength(0);
  });
});

describe("hasStaleEvidence", () => {
  it("returns false for all-fresh evidence", () => {
    const ev = makeEvidence({ retrievedAt: new Date("2024-05-31T00:00:00Z"), sourceType: "AUTHORITATIVE_PRIMARY" });
    const freshness = classifyAllEvidence([ev], BASE_DATE);
    expect(hasStaleEvidence(freshness)).toBe(false);
  });

  it("returns true if any item is stale", () => {
    const fresh = makeEvidence({ id: "ev-1", retrievedAt: new Date("2024-05-31T00:00:00Z"), sourceType: "AUTHORITATIVE_PRIMARY" });
    const stale = makeEvidence({ id: "ev-2", retrievedAt: new Date("2024-01-01T00:00:00Z"), sourceType: "UNVERIFIED" });
    const freshness = classifyAllEvidence([fresh, stale], BASE_DATE);
    expect(hasStaleEvidence(freshness)).toBe(true);
  });

  it("returns true if any item requires current verification", () => {
    const ev = makeEvidence({ currentVerificationRequired: true, retrievedAt: new Date("2024-05-31T00:00:00Z") });
    const freshness = classifyAllEvidence([ev], BASE_DATE);
    expect(hasStaleEvidence(freshness)).toBe(true);
  });
});
