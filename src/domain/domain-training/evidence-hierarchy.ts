/**
 * F3 — Evidence hierarchy (pure).
 *
 * Ranks evidence by strength so the harness can resolve contradictions and decide
 * what may close a high-risk action or be accepted as proof. Complements the M2
 * input-quality gate (it provides the ordering M2 implies). Pure + deterministic.
 */

export enum EvidenceType {
  SYSTEM_TRANSACTION = "SYSTEM_TRANSACTION",
  UPLOADED_OFFICIAL_RECORD = "UPLOADED_OFFICIAL_RECORD",
  TIMESTAMPED_OPERATIONAL_LOG = "TIMESTAMPED_OPERATIONAL_LOG",
  CUSTOMER_GENERATED = "CUSTOMER_GENERATED",
  PHOTO_VIDEO = "PHOTO_VIDEO",
  MANAGER_VERIFICATION = "MANAGER_VERIFICATION",
  STAFF_SELF_REPORT = "STAFF_SELF_REPORT",
  OWNER_RECOLLECTION = "OWNER_RECOLLECTION",
  ESTIMATE = "ESTIMATE",
  ASSUMPTION = "ASSUMPTION",
}

/** Lower rank = stronger evidence (1 strongest, 10 weakest). */
export const EVIDENCE_RANK: Record<EvidenceType, number> = {
  [EvidenceType.SYSTEM_TRANSACTION]: 1,
  [EvidenceType.UPLOADED_OFFICIAL_RECORD]: 2,
  [EvidenceType.TIMESTAMPED_OPERATIONAL_LOG]: 3,
  [EvidenceType.CUSTOMER_GENERATED]: 4,
  [EvidenceType.PHOTO_VIDEO]: 5,
  [EvidenceType.MANAGER_VERIFICATION]: 6,
  [EvidenceType.STAFF_SELF_REPORT]: 7,
  [EvidenceType.OWNER_RECOLLECTION]: 8,
  [EvidenceType.ESTIMATE]: 9,
  [EvidenceType.ASSUMPTION]: 10,
};

export function evidenceRank(t: EvidenceType): number {
  return EVIDENCE_RANK[t];
}

export function isStrongerThan(a: EvidenceType, b: EvidenceType): boolean {
  return EVIDENCE_RANK[a] < EVIDENCE_RANK[b];
}

/**
 * When two evidence items contradict, the stronger one wins. Returns the winning
 * type, or null when they are of equal strength (genuine, unresolved conflict).
 */
export function resolveContradiction(a: EvidenceType, b: EvidenceType): EvidenceType | null {
  if (EVIDENCE_RANK[a] === EVIDENCE_RANK[b]) return null;
  return isStrongerThan(a, b) ? a : b;
}

/** True when `challenger` can override `incumbent` (strictly stronger). */
export function canOverride(challenger: EvidenceType, incumbent: EvidenceType): boolean {
  return isStrongerThan(challenger, incumbent);
}

/** A high-risk action may be closed alone only by manager-verification-or-stronger. */
export function canCloseHighRiskAlone(t: EvidenceType): boolean {
  return EVIDENCE_RANK[t] <= EVIDENCE_RANK[EvidenceType.MANAGER_VERIFICATION];
}

/** Estimates and assumptions are never acceptable as proof. */
export function isAcceptableAsProof(t: EvidenceType): boolean {
  return EVIDENCE_RANK[t] <= EVIDENCE_RANK[EvidenceType.OWNER_RECOLLECTION];
}
