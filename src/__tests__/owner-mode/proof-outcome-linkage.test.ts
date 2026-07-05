/**
 * Proof ↔ Outcome Linkage — pure, deterministic linkage of an ACCEPTED proof to a later governed
 * contradiction (DISPUTED / OVERRIDDEN_NOT_VERIFIED) or rework, from the real proof.reviewed audit
 * trail. No DB, no clock. Asserts real LINKED latency from two persisted timestamps, honest
 * NOT_MEASURABLE for the genuinely-unpersisted complaint/recommendation-outcome links, per-submitter
 * attribution, and that no accepted proof ⇒ not measurable (never a fake failure).
 */
import { describe, it, expect } from "vitest";
import {
  buildProofOutcomeLinkage,
  type ProofReviewAuditRow,
  type LinkageProofRow,
  type ProofOutcomeLinkageInput,
} from "@/domain/owner-mode/proof-outcome-linkage";

const WS = "ws-1";
const AT = "2026-07-05T00:00:00.000Z";
const NOW = Date.parse(AT);
const H = 3_600_000;

const audit = (over: Partial<ProofReviewAuditRow> = {}): ProofReviewAuditRow => ({
  id: "au-1", proofId: "p1", occurredAt: new Date(NOW - 5 * H), actorId: "rev-1", fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED", ...over,
});
const proof = (over: Partial<LinkageProofRow> = {}): LinkageProofRow => ({
  id: "p1", submittedByUserId: "op-1", proofType: "photo", taskId: "t-1", resubmissionOfId: null, status: "DISPUTED", createdAt: new Date(NOW - 6 * H), ...over,
});
const input = (over: Partial<ProofOutcomeLinkageInput> = {}): ProofOutcomeLinkageInput => ({
  workspaceId: WS, reviewAudits: [], proofs: [], nowMs: NOW, evaluatedAt: AT, ...over,
});

describe("proof-outcome linkage — contradiction", () => {
  it("accepted proof later DISPUTED → LINKED bad-result link with real latency", () => {
    const r = buildProofOutcomeLinkage(input({
      reviewAudits: [
        audit({ id: "a-accept", toStatus: "ACCEPTED", occurredAt: new Date(NOW - 5 * H) }),
        audit({ id: "a-dispute", fromStatus: "ACCEPTED", toStatus: "DISPUTED", occurredAt: new Date(NOW - 2 * H) }),
      ],
      proofs: [proof()],
    }));
    const link = r.links.find((l) => l.linkType === "PROOF_TO_BAD_RESULT_LINK")!;
    expect(link.status).toBe("LINKED");
    expect(link.sourceEntityId).toBe("p1");
    expect(link.targetEntityId).toBe("a-dispute");
    expect(link.latencyMs).toBe(3 * H);
    expect(link.sourceTimestamp).toBe(new Date(NOW - 5 * H).toISOString());
    expect(r.measurement.contradictedCount).toBe(1);
    expect(r.measurement.contradictionRate).toBe(1);
    expect(r.submitterContradictions).toEqual([{ actorId: "op-1", contradictedCount: 1, proofType: "photo" }]);
  });

  it("accepted proof later OVERRIDDEN_NOT_VERIFIED also counts as a contradiction", () => {
    const r = buildProofOutcomeLinkage(input({
      reviewAudits: [
        audit({ id: "a1", toStatus: "ACCEPTED", occurredAt: new Date(NOW - 4 * H) }),
        audit({ id: "a2", fromStatus: "ACCEPTED", toStatus: "OVERRIDDEN_NOT_VERIFIED", occurredAt: new Date(NOW - 1 * H) }),
      ],
      proofs: [proof({ status: "OVERRIDDEN_NOT_VERIFIED" })],
    }));
    expect(r.measurement.contradictedCount).toBe(1);
    expect(r.links.some((l) => l.linkType === "PROOF_TO_BAD_RESULT_LINK" && l.status === "LINKED")).toBe(true);
  });

  it("an accepted proof NEVER reversed is not a contradiction (no fake failure)", () => {
    const r = buildProofOutcomeLinkage(input({
      reviewAudits: [audit({ id: "a", toStatus: "ACCEPTED" })],
      proofs: [proof({ status: "ACCEPTED" })],
    }));
    expect(r.measurement.measurable).toBe(true);
    expect(r.measurement.acceptedProofCount).toBe(1);
    expect(r.measurement.contradictedCount).toBe(0);
    expect(r.measurement.contradictionRate).toBe(0);
    expect(r.links.some((l) => l.linkType === "PROOF_TO_BAD_RESULT_LINK")).toBe(false);
  });

  it("no accepted proof at all → NOT measurable (never fabricated)", () => {
    const r = buildProofOutcomeLinkage(input({ reviewAudits: [], proofs: [] }));
    expect(r.measurement.measurable).toBe(false);
    expect(r.measurement.contradictionRate).toBeNull();
  });

  it("a DISPUTED that did NOT come from ACCEPTED is not counted as a contradiction", () => {
    const r = buildProofOutcomeLinkage(input({
      reviewAudits: [audit({ id: "a", fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "DISPUTED", occurredAt: new Date(NOW - 2 * H) })],
      proofs: [proof()],
    }));
    expect(r.measurement.contradictedCount).toBe(0);
    expect(r.measurement.acceptedProofCount).toBe(0); // never accepted
  });
});

describe("proof-outcome linkage — rework + not-measurable disclosure", () => {
  it("a resubmission proof produces a rework link keyed by resubmissionOfId", () => {
    const r = buildProofOutcomeLinkage(input({
      proofs: [proof({ id: "p2", resubmissionOfId: "p1", status: "SUBMITTED" })],
    }));
    const rework = r.links.find((l) => l.linkType === "PROOF_TO_REWORK_LINK")!;
    expect(rework.sourceEntityId).toBe("p1");
    expect(rework.targetEntityId).toBe("p2");
    expect(r.workspaceReworkCount).toBe(1);
  });

  it("proof→complaint and proof→recommendation-outcome stay NOT_MEASURABLE with exact missing model", () => {
    const r = buildProofOutcomeLinkage(input());
    const complaint = r.links.find((l) => l.linkType === "PROOF_TO_COMPLAINT_LINK")!;
    const outcome = r.links.find((l) => l.linkType === "PROOF_TO_OUTCOME_LINK")!;
    expect(complaint.status).toBe("NOT_MEASURABLE");
    expect(complaint.missingData.join(" ")).toMatch(/no complaint event is linked/i);
    expect(outcome.status).toBe("NOT_MEASURABLE");
    expect(outcome.missingData.join(" ")).toMatch(/disjoint entity trees/i);
  });

  it("every link echoes the workspaceId (no cross-workspace bleed in a pure fn)", () => {
    const r = buildProofOutcomeLinkage(input({
      workspaceId: "ws-XYZ",
      reviewAudits: [audit({ id: "a1", toStatus: "ACCEPTED" }), audit({ id: "a2", fromStatus: "ACCEPTED", toStatus: "DISPUTED", occurredAt: new Date(NOW - H) })],
      proofs: [proof()],
    }));
    expect(r.links.every((l) => l.workspaceId === "ws-XYZ")).toBe(true);
  });
});
