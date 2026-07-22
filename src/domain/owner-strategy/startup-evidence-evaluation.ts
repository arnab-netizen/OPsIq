/**
 * Startup evidence evaluation — freshness classification and conflict detection.
 * Pure — no DB, no I/O. Uses an injected clock.
 */

export type EvidenceFreshnessState =
  | "FRESH"
  | "NEARING_EXPIRY"
  | "STALE"
  | "CURRENT_VERIFICATION_REQUIRED"
  | "NO_EXPIRY_POLICY";

export interface EvidenceForEvaluation {
  id: string;
  sourceType: string;  // AUTHORITATIVE_PRIMARY | OFFICIAL_COMMERCIAL | FIELD_OBSERVATION | OWNER_DIRECT | SYSTEM_INFERENCE | UNVERIFIED
  evidenceType: string;
  retrievedAt: Date;
  expiresAt: Date | null;
  currentVerificationRequired: boolean;
  reliabilityScore: number;  // 0-100
  confidence: number;  // 0-100
  observedResult: string;
  hypothesisId: string | null;
  materialClaim: string | null;  // canonical claim this evidence supports — for conflict detection
}

export interface FreshnessMeta {
  evidenceId: string;
  state: EvidenceFreshnessState;
  daysSinceRetrieval: number;
  daysUntilExpiry: number | null;
  stalenessPolicy: string;
}

/** Staleness policy thresholds in days per source type */
const STALENESS_DAYS: Record<string, number> = {
  AUTHORITATIVE_PRIMARY: 365,
  OFFICIAL_COMMERCIAL: 180,
  FIELD_OBSERVATION: 90,
  OWNER_DIRECT: 180,
  SYSTEM_INFERENCE: 60,
  UNVERIFIED: 30,
};

const NEARING_EXPIRY_THRESHOLD_DAYS = 14;

/** Classify a single evidence record's freshness state. */
export function classifyEvidenceFreshness(
  evidence: EvidenceForEvaluation,
  now: Date
): FreshnessMeta {
  if (evidence.currentVerificationRequired) {
    return {
      evidenceId: evidence.id,
      state: "CURRENT_VERIFICATION_REQUIRED",
      daysSinceRetrieval: daysBetween(evidence.retrievedAt, now),
      daysUntilExpiry: evidence.expiresAt ? daysBetween(now, evidence.expiresAt) : null,
      stalenessPolicy: "REQUIRES_VERIFICATION",
    };
  }

  if (evidence.expiresAt == null) {
    const stalenessThreshold = STALENESS_DAYS[evidence.sourceType] ?? 90;
    const daysSince = daysBetween(evidence.retrievedAt, now);
    if (daysSince > stalenessThreshold) {
      return { evidenceId: evidence.id, state: "STALE", daysSinceRetrieval: daysSince, daysUntilExpiry: null, stalenessPolicy: `${stalenessThreshold}d_per_source_type` };
    }
    if (daysSince > stalenessThreshold - NEARING_EXPIRY_THRESHOLD_DAYS) {
      return { evidenceId: evidence.id, state: "NEARING_EXPIRY", daysSinceRetrieval: daysSince, daysUntilExpiry: null, stalenessPolicy: `${stalenessThreshold}d_per_source_type` };
    }
    return { evidenceId: evidence.id, state: "NO_EXPIRY_POLICY", daysSinceRetrieval: daysSince, daysUntilExpiry: null, stalenessPolicy: `${stalenessThreshold}d_per_source_type` };
  }

  const daysUntilExpiry = daysBetween(now, evidence.expiresAt);
  if (daysUntilExpiry <= 0) {
    return { evidenceId: evidence.id, state: "STALE", daysSinceRetrieval: daysBetween(evidence.retrievedAt, now), daysUntilExpiry, stalenessPolicy: "EXPLICIT_EXPIRY" };
  }
  if (daysUntilExpiry <= NEARING_EXPIRY_THRESHOLD_DAYS) {
    return { evidenceId: evidence.id, state: "NEARING_EXPIRY", daysSinceRetrieval: daysBetween(evidence.retrievedAt, now), daysUntilExpiry, stalenessPolicy: "EXPLICIT_EXPIRY" };
  }
  return { evidenceId: evidence.id, state: "FRESH", daysSinceRetrieval: daysBetween(evidence.retrievedAt, now), daysUntilExpiry, stalenessPolicy: "EXPLICIT_EXPIRY" };
}

export function classifyAllEvidence(evidenceList: EvidenceForEvaluation[], now: Date): FreshnessMeta[] {
  return evidenceList.map((e) => classifyEvidenceFreshness(e, now));
}

export function hasStaleEvidence(freshnessList: FreshnessMeta[]): boolean {
  return freshnessList.some((f) => f.state === "STALE" || f.state === "CURRENT_VERIFICATION_REQUIRED");
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

export type ConflictSeverity = "MATERIAL" | "MINOR" | "INFORMATIONAL";

export interface EvidenceConflict {
  materialClaim: string;
  evidenceA: { id: string; observedResult: string; reliabilityScore: number; sourceType: string; state: EvidenceFreshnessState };
  evidenceB: { id: string; observedResult: string; reliabilityScore: number; sourceType: string; state: EvidenceFreshnessState };
  severity: ConflictSeverity;
  reducedConfidence: number;
  resolution: "PREFER_A" | "PREFER_B" | "DISPUTED";
  resolutionRationale: string;
  propagatesToReadiness: boolean;
  propagatesToApproval: boolean;
}

/**
 * Detect conflicts among evidence linked to the same material claim.
 * Both records are always preserved. Conflicts are surfaced, not silently merged.
 */
export function detectEvidenceConflicts(
  evidenceList: EvidenceForEvaluation[],
  freshnessList: FreshnessMeta[]
): EvidenceConflict[] {
  const freshnessMap = new Map(freshnessList.map((f) => [f.evidenceId, f]));
  const byClaim = new Map<string, EvidenceForEvaluation[]>();

  for (const e of evidenceList) {
    if (!e.materialClaim) continue;
    const list = byClaim.get(e.materialClaim) ?? [];
    list.push(e);
    byClaim.set(e.materialClaim, list);
  }

  const conflicts: EvidenceConflict[] = [];

  for (const [claim, items] of byClaim) {
    if (items.length < 2) continue;
    for (let i = 0; i < items.length - 1; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (!isConflicting(a.observedResult, b.observedResult)) continue;

        const fa = freshnessMap.get(a.id);
        const fb = freshnessMap.get(b.id);
        const stateA = fa?.state ?? "NO_EXPIRY_POLICY";
        const stateB = fb?.state ?? "NO_EXPIRY_POLICY";

        const reliability = Math.abs(a.reliabilityScore - b.reliabilityScore);
        const severity: ConflictSeverity =
          a.reliabilityScore >= 70 && b.reliabilityScore >= 70 ? "MATERIAL" :
          reliability >= 30 ? "MINOR" : "INFORMATIONAL";

        const { resolution, rationale } = resolveConflict(a, b, stateA, stateB);
        const reducedConfidence = Math.round((a.confidence + b.confidence) / 2 * 0.7);

        conflicts.push({
          materialClaim: claim,
          evidenceA: { id: a.id, observedResult: a.observedResult, reliabilityScore: a.reliabilityScore, sourceType: a.sourceType, state: stateA },
          evidenceB: { id: b.id, observedResult: b.observedResult, reliabilityScore: b.reliabilityScore, sourceType: b.sourceType, state: stateB },
          severity,
          reducedConfidence,
          resolution,
          resolutionRationale: rationale,
          propagatesToReadiness: severity === "MATERIAL",
          propagatesToApproval: severity === "MATERIAL" && (a.reliabilityScore >= 60 || b.reliabilityScore >= 60),
        });
      }
    }
  }

  return conflicts;
}

function isConflicting(resultA: string, resultB: string): boolean {
  const a = resultA.toLowerCase();
  const b = resultB.toLowerCase();
  const positive = ["yes", "confirmed", "positive", "willing", "available", "passes", "legal", "approved"];
  const negative = ["no", "denied", "negative", "unwilling", "unavailable", "fails", "illegal", "rejected"];
  const aPositive = positive.some((p) => a.includes(p));
  const bNegative = negative.some((n) => b.includes(n));
  const aNegative = negative.some((n) => a.includes(n));
  const bPositive = positive.some((p) => b.includes(p));
  return (aPositive && bNegative) || (aNegative && bPositive);
}

function resolveConflict(
  a: EvidenceForEvaluation,
  b: EvidenceForEvaluation,
  stateA: EvidenceFreshnessState,
  stateB: EvidenceFreshnessState
): { resolution: "PREFER_A" | "PREFER_B" | "DISPUTED"; rationale: string } {
  const aStale = stateA === "STALE" || stateA === "CURRENT_VERIFICATION_REQUIRED";
  const bStale = stateB === "STALE" || stateB === "CURRENT_VERIFICATION_REQUIRED";

  if (aStale && !bStale) return { resolution: "PREFER_B", rationale: "A is stale; B is current" };
  if (!aStale && bStale) return { resolution: "PREFER_A", rationale: "B is stale; A is current" };

  const reliabilityGap = Math.abs(a.reliabilityScore - b.reliabilityScore);
  if (reliabilityGap >= 20) {
    return a.reliabilityScore > b.reliabilityScore
      ? { resolution: "PREFER_A", rationale: `A has higher reliability (${a.reliabilityScore} vs ${b.reliabilityScore})` }
      : { resolution: "PREFER_B", rationale: `B has higher reliability (${b.reliabilityScore} vs ${a.reliabilityScore})` };
  }

  return { resolution: "DISPUTED", rationale: "Both sources have similar reliability and freshness — owner must resolve" };
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
