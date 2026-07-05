/**
 * Proof ↔ Outcome Linkage (depth pass).
 *
 * Answers: "When a proof was accepted, what later happened — was it contradicted, and did that
 * make a submitter/proof-type less trustworthy?" It links an ACCEPTED proof to a later
 * governed contradiction (DISPUTED / OVERRIDDEN_NOT_VERIFIED) and to rework (resubmission),
 * using ONLY real persisted records — the `proof.reviewed` audit trail (which records every
 * transition's fromStatus→toStatus, keyed by proofId) and the Proof rows themselves.
 *
 * PURE and deterministic — no DB, no clock. Every link carries the full shape (source + target
 * entity, real persisted timestamps, latency, status, evidence, missing data, owner
 * implication). It NEVER fabricates a linkage: an accepted proof with no later contradiction is
 * simply not a contradiction link (and the integrity SLO reports PASS, not a fake failure);
 * where a linkage genuinely has no persisted source (per-proof complaint events; per-proof
 * recommendation-action outcomes) it is emitted as NOT_MEASURABLE with the exact missing model.
 *
 * The contradiction is authoritative because the proof FSM only allows ACCEPTED →
 * {DISPUTED, OVERRIDDEN_NOT_VERIFIED}, and every transition writes a `proof.reviewed` audit with
 * payload.fromStatus/toStatus — so a single audit row with fromStatus=ACCEPTED proves the proof
 * was accepted before it was contradicted. No user-supplied timestamp is trusted: both
 * timestamps come from server-written audit `occurredAt`.
 */

export type ProofLinkType =
  | "PROOF_TO_BAD_RESULT_LINK"     // accepted proof → later DISPUTED / OVERRIDDEN_NOT_VERIFIED
  | "PROOF_TO_REWORK_LINK"         // proof → its resubmission/redo (rework)
  | "PROOF_TO_COMPLAINT_LINK"      // NOT_MEASURABLE — no per-proof complaint model
  | "PROOF_TO_OUTCOME_LINK";       // NOT_MEASURABLE — proof and recommendation/action outcome are disjoint trees

export type ProofLinkStatus = "LINKED" | "MISSING_TARGET" | "MISSING_SOURCE" | "NOT_MEASURABLE" | "FAILED";

export interface ProofOutcomeLink {
  workspaceId: string;
  sourceEntityType: string;
  sourceEntityId: string | null;
  sourceTimestamp: string | null;
  targetEntityType: string;
  targetEntityId: string | null;
  targetTimestamp: string | null;
  linkType: ProofLinkType;
  status: ProofLinkStatus;
  actorId: string | null;
  evidence: string[];
  missingData: string[];
  latencyMs: number | null;
  ownerImplication: string;
  evaluatedAt: string;
}

/** A `proof.reviewed` audit row (server-authoritative transition record, keyed by proofId). */
export interface ProofReviewAuditRow {
  id: string;
  proofId: string;          // audit.entityId
  occurredAt: Date;
  actorId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
}

/** A Proof row (for attribution + rework). */
export interface LinkageProofRow {
  id: string;
  submittedByUserId: string | null;
  proofType: string;
  taskId: string | null;
  resubmissionOfId: string | null;
  status: string;
  createdAt: Date;
}

export interface ProofOutcomeLinkageInput {
  workspaceId: string;
  reviewAudits: ProofReviewAuditRow[];
  proofs: LinkageProofRow[];
  /**
   * Counts of complaint/rework OperationalEvents linked to accepted proof (from the complaint/rework
   * linkage). When > 0, the previously-NOT_MEASURABLE proof→complaint / proof→rework links become
   * LINKED and count as contradictions of accepted proof.
   */
  linkedComplaintCount?: number;
  linkedReworkCount?: number;
  nowMs: number;
  evaluatedAt: string;
}

/** Per-submitter contradiction attribution — feeds the Evidence Credibility Graph. */
export interface SubmitterContradiction {
  actorId: string;
  contradictedCount: number;
  proofType: string | null;
}

/** Measured proof→outcome integrity — feeds the Business-Control SLO. */
export interface ProofOutcomeMeasurement {
  measurable: boolean;
  acceptedProofCount: number;
  contradictedCount: number;
  reworkCount: number;
  /** contradictions ÷ accepted, 0..1, null if not measurable. */
  contradictionRate: number | null;
  medianContradictionLatencyMs: number | null;
}

export interface ProofOutcomeLinkageReport {
  workspaceId: string;
  links: ProofOutcomeLink[];
  measurement: ProofOutcomeMeasurement;
  submitterContradictions: SubmitterContradiction[];
  /** Workspace-level counts for the credibility graph (contradiction = accepted-then-reversed). */
  workspaceContradictedCount: number;
  workspaceReworkCount: number;
  evaluatedAt: string;
}

const ACCEPTED = "ACCEPTED";
const CONTRADICTION_STATUSES = new Set(["DISPUTED", "OVERRIDDEN_NOT_VERIFIED"]);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

/** Build the workspace-scoped proof→outcome linkage report from pre-scoped persisted rows. Pure. */
export function buildProofOutcomeLinkage(input: ProofOutcomeLinkageInput): ProofOutcomeLinkageReport {
  const { workspaceId, reviewAudits, proofs, evaluatedAt } = input;
  const proofById = new Map(proofs.map((p) => [p.id, p]));
  const links: ProofOutcomeLink[] = [];
  const contradictionLatencies: number[] = [];
  const perSubmitter = new Map<string, SubmitterContradiction>();

  // Index audits per proof, chronologically, to find the ACCEPTED timestamp and the contradiction.
  const auditsByProof = new Map<string, ProofReviewAuditRow[]>();
  for (const a of reviewAudits) {
    const arr = auditsByProof.get(a.proofId) ?? [];
    arr.push(a);
    auditsByProof.set(a.proofId, arr);
  }

  const acceptedProofIds = new Set<string>();
  let contradictedCount = 0;

  for (const [proofId, audits] of auditsByProof) {
    const sorted = [...audits].sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    const acceptedEvent = sorted.find((a) => a.toStatus === ACCEPTED) ?? null;
    if (acceptedEvent) acceptedProofIds.add(proofId);

    // A single audit with fromStatus=ACCEPTED and a contradiction toStatus proves the reversal.
    const contradiction = sorted.find(
      (a) => a.fromStatus === ACCEPTED && a.toStatus != null && CONTRADICTION_STATUSES.has(a.toStatus)
    );
    if (!contradiction) continue;

    contradictedCount++;
    const proof = proofById.get(proofId) ?? null;
    const sourceTs = acceptedEvent ? acceptedEvent.occurredAt : null;
    const latencyMs = sourceTs ? Math.max(0, contradiction.occurredAt.getTime() - sourceTs.getTime()) : null;
    if (latencyMs != null) contradictionLatencies.push(latencyMs);

    if (proof?.submittedByUserId) {
      const cur = perSubmitter.get(proof.submittedByUserId) ?? { actorId: proof.submittedByUserId, contradictedCount: 0, proofType: proof.proofType };
      cur.contradictedCount++;
      perSubmitter.set(proof.submittedByUserId, cur);
    }

    links.push({
      workspaceId,
      sourceEntityType: "Proof(ACCEPTED)",
      sourceEntityId: proofId,
      sourceTimestamp: sourceTs ? sourceTs.toISOString() : null,
      targetEntityType: `AuditEvent(proof.reviewed→${contradiction.toStatus})`,
      targetEntityId: contradiction.id,
      targetTimestamp: contradiction.occurredAt.toISOString(),
      linkType: "PROOF_TO_BAD_RESULT_LINK",
      status: "LINKED",
      actorId: contradiction.actorId ?? proof?.submittedByUserId ?? null,
      evidence: [
        `proof accepted then ${contradiction.toStatus}`,
        proof ? `submitter=${proof.submittedByUserId ?? "unknown"} type=${proof.proofType}` : "proof row not found",
        ...(latencyMs != null ? [`latency=${Math.round(latencyMs / 3600000)}h`] : []),
      ],
      missingData: sourceTs ? [] : ["no ACCEPTED audit found for this proof (contradiction fromStatus proves prior acceptance; exact accept time unknown)"],
      latencyMs,
      ownerImplication: "An accepted proof was later reversed — the earlier sign-off could not be trusted.",
      evaluatedAt,
    });
  }

  // ── Rework links: a proof carrying resubmissionOfId is a redo of an earlier proof. ──
  let workspaceReworkCount = 0;
  for (const p of proofs) {
    if (!p.resubmissionOfId) continue;
    workspaceReworkCount++;
    links.push({
      workspaceId,
      sourceEntityType: "Proof(reworked)",
      sourceEntityId: p.resubmissionOfId,
      sourceTimestamp: null,
      targetEntityType: "Proof(resubmission)",
      targetEntityId: p.id,
      targetTimestamp: p.createdAt.toISOString(),
      linkType: "PROOF_TO_REWORK_LINK",
      status: proofById.has(p.resubmissionOfId) ? "LINKED" : "MISSING_SOURCE",
      actorId: p.submittedByUserId,
      evidence: [`resubmission of ${p.resubmissionOfId}`, `type=${p.proofType}`],
      missingData: proofById.has(p.resubmissionOfId) ? [] : ["the reworked predecessor proof is outside the window"],
      latencyMs: null,
      ownerImplication: "This work had to be redone — a rework/redo signal on the delivery process.",
      evaluatedAt,
    });
  }

  // ── PROOF_TO_COMPLAINT_LINK — measurable once complaint events are linked to accepted proof. ──
  const linkedComplaint = input.linkedComplaintCount ?? 0;
  const linkedRework = input.linkedReworkCount ?? 0;
  if (linkedComplaint > 0) {
    links.push({
      workspaceId, sourceEntityType: "Proof(ACCEPTED)", sourceEntityId: null, sourceTimestamp: null,
      targetEntityType: "OperationalEvent(COMPLAINT)", targetEntityId: null, targetTimestamp: null,
      linkType: "PROOF_TO_COMPLAINT_LINK", status: "LINKED", actorId: null,
      evidence: [`${linkedComplaint} complaint event(s) linked to accepted proof`], missingData: [],
      latencyMs: null, ownerImplication: "Accepted work drew customer complaints — the sign-off did not hold up.", evaluatedAt,
    });
  } else {
    links.push(notMeasurableLink(
      workspaceId, "PROOF_TO_COMPLAINT_LINK", "Proof(ACCEPTED)", "OperationalEvent(COMPLAINT)", evaluatedAt,
      ["no complaint event is linked to an accepted proof yet (record + link one via the complaint/rework service)"],
      "Cannot yet tie a specific accepted proof to a specific customer complaint."
    ));
  }
  if (linkedRework > 0) {
    links.push({
      workspaceId, sourceEntityType: "Proof(ACCEPTED)", sourceEntityId: null, sourceTimestamp: null,
      targetEntityType: "OperationalEvent(REWORK)", targetEntityId: null, targetTimestamp: null,
      linkType: "PROOF_TO_REWORK_LINK", status: "LINKED", actorId: null,
      evidence: [`${linkedRework} rework event(s) linked to accepted proof`], missingData: [],
      latencyMs: null, ownerImplication: "Accepted work had to be redone — a linked rework event contradicts the sign-off.", evaluatedAt,
    });
  }
  links.push(notMeasurableLink(
    workspaceId, "PROOF_TO_OUTCOME_LINK", "Proof(ACCEPTED)", "OwnerActionOutcome(recommendation/action)", evaluatedAt,
    ["a delegated-task Proof and a recommendation/action OwnerActionOutcome are disjoint entity trees with no persisted join key"],
    "Cannot yet tie a specific accepted proof to a specific recommendation/action outcome."
  ));

  const acceptedProofCount = acceptedProofIds.size;
  // A linked complaint/rework on accepted proof is a contradiction too — fold it into the integrity
  // measurement so PROOF_OUTCOME_INTEGRITY consumes complaint/rework linkage.
  const totalContradicted = contradictedCount + linkedComplaint + linkedRework;
  const measurable = acceptedProofCount > 0;
  return {
    workspaceId,
    links,
    measurement: {
      measurable,
      acceptedProofCount,
      contradictedCount: totalContradicted,
      reworkCount: workspaceReworkCount + linkedRework,
      contradictionRate: measurable ? Math.min(1, totalContradicted / acceptedProofCount) : null,
      medianContradictionLatencyMs: median(contradictionLatencies),
    },
    submitterContradictions: [...perSubmitter.values()],
    workspaceContradictedCount: contradictedCount,
    workspaceReworkCount,
    evaluatedAt,
  };
}

function notMeasurableLink(
  workspaceId: string, linkType: ProofLinkType, sourceType: string, targetType: string, evaluatedAt: string,
  missingData: string[], ownerImplication: string
): ProofOutcomeLink {
  return {
    workspaceId,
    sourceEntityType: sourceType, sourceEntityId: null, sourceTimestamp: null,
    targetEntityType: targetType, targetEntityId: null, targetTimestamp: null,
    linkType, status: "NOT_MEASURABLE", actorId: null,
    evidence: [], missingData, latencyMs: null,
    ownerImplication, evaluatedAt,
  };
}
