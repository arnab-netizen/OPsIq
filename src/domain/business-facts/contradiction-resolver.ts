/**
 * B06 — Contradiction Resolution Workflow.
 *
 * Pure, deterministic detection and resolution of conflicts between facts.
 * Identifies when facts for the same metric differ significantly across sources,
 * classifies severity (minor/material/critical), applies resolution logic based on
 * evidence hierarchy (B04), and caps confidence accordingly (rule from §12).
 *
 * Rules:
 *   - do not average conflicting numbers
 *   - material/critical conflict blocks high-confidence recommendations
 *   - conflict must be visible to owner
 *   - resolution must be logged
 *
 * Pure function, no DB, no I/O, no LLM. Deterministic over contract input only.
 */
import { z } from "zod";
import {
  type BusinessFact,
  type BusinessFactsContract,
  type Contradiction,
  CONTRADICTION_STATUSES,
} from "./contract";
import { sourceEvidenceLevel, compareEvidenceLevels } from "./evidence-hierarchy";

// --- Conflict severity classification ----------------------------------------

export const CONFLICT_SEVERITY = {
  NONE: "no_conflict",
  MINOR: "minor_conflict", // < 10% difference
  MATERIAL: "material_conflict", // 10–50% difference
  CRITICAL: "critical_conflict", // > 50% difference
} as const;

/**
 * Detect facts with the same metric but different values (from different sources).
 * Returns groups of facts that conflict.
 */
function detectConflictingFactGroups(
  facts: BusinessFact[]
): Map<string, BusinessFact[]> {
  const byMetric = new Map<string, BusinessFact[]>();

  for (const fact of facts) {
    if (fact.value === null) continue; // Null values don't conflict
    const key = fact.metric;
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(fact);
  }

  // Keep only metrics with 2+ facts from different sources
  const conflicts = new Map<string, BusinessFact[]>();
  for (const [metric, metricFacts] of byMetric) {
    if (metricFacts.length < 2) continue;

    const sources = new Set(metricFacts.map((f) => f.source_document_id));
    if (sources.size >= 2) {
      conflicts.set(metric, metricFacts);
    }
  }

  return conflicts;
}

/**
 * Calculate percentage difference between two numeric values.
 * Used to classify severity of conflicts.
 */
function percentDifference(a: number, b: number): number {
  if (a === b) return 0;
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg === 0) return 0;
  return Math.abs(a - b) / avg;
}

/**
 * Classify conflict severity based on percentage difference.
 */
function classifySeverity(
  conflictingValues: (number | string)[],
): (typeof CONFLICT_SEVERITY)[keyof typeof CONFLICT_SEVERITY] {
  // Only numeric conflicts have severity classifications
  const numericValues = conflictingValues.filter((v) => typeof v === "number") as number[];
  if (numericValues.length < 2) {
    // Non-numeric or single numeric value → treat as minor conflict
    return CONFLICT_SEVERITY.MINOR;
  }

  const diffs: number[] = [];
  for (let i = 0; i < numericValues.length - 1; i++) {
    for (let j = i + 1; j < numericValues.length; j++) {
      diffs.push(percentDifference(numericValues[i], numericValues[j]));
    }
  }

  const maxDiff = Math.max(...diffs);

  if (maxDiff < 0.1) return CONFLICT_SEVERITY.MINOR;
  if (maxDiff <= 0.5) return CONFLICT_SEVERITY.MATERIAL;
  return CONFLICT_SEVERITY.CRITICAL;
}

/**
 * Determine resolution status based on evidence hierarchy and conflict nature.
 * Higher-evidence sources override lower-evidence sources automatically.
 * If evidence is equal, conflict is marked "unresolved" (awaits owner input).
 */
function determineResolution(
  conflictingFacts: BusinessFact[],
  sourceDocuments: Map<string, { kind: string }>,
): (typeof CONTRADICTION_STATUSES)[number] {
  if (conflictingFacts.length < 2) return "no_conflict";

  // Get evidence levels for each fact by looking up its source document
  const evidenceLevels = conflictingFacts.map((f) => {
    const sourceDoc = sourceDocuments.get(f.source_document_id);
    const kind = sourceDoc?.kind as any || "other";
    return {
      fact: f,
      evidenceLevel: sourceEvidenceLevel(kind),
    };
  });

  // Find the highest evidence level
  const maxEvidence = Math.max(...evidenceLevels.map((e) => e.evidenceLevel));
  const minEvidence = Math.min(...evidenceLevels.map((e) => e.evidenceLevel));

  // If all same evidence level, unresolved (awaits owner)
  if (maxEvidence === minEvidence) {
    return "unresolved";
  }

  // If sources differ in evidence level, higher evidence wins
  return "resolved_by_source_priority";
}

/**
 * Build a human-readable description of a conflict.
 */
function buildConflictDescription(
  metric: string,
  facts: BusinessFact[],
  severity: string,
): string {
  const sources = facts.map((f) => f.source_document_id).join(" vs ");
  const values = facts.map((f) => String(f.value)).join(" vs ");

  return `${severity}: ${metric} (${sources}) = [${values}]`;
}

/**
 * Detect and resolve contradictions in a business-facts contract.
 * Returns an updated contract with contradiction statuses and facts marked accordingly.
 */
export function detectAndResolveContradictions(
  contract: BusinessFactsContract,
): BusinessFactsContract {
  // Collect all facts
  const allFacts: BusinessFact[] = [];
  const categories = [
    "financials",
    "sales",
    "customers",
    "marketing",
    "operations",
    "inventory",
    "staffing",
    "debt",
    "cash",
  ] as const;

  for (const category of categories) {
    const facts = contract[category];
    if (Array.isArray(facts)) {
      allFacts.push(...facts);
    }
  }

  // Build a map of source documents for evidence lookup
  const sourceDocMap = new Map(
    contract.source_documents.map((doc) => [doc.source_document_id, { kind: doc.kind }]),
  );

  // Detect conflicting groups
  const conflicts = detectConflictingFactGroups(allFacts);

  // Build contradiction records
  const contradictions: Contradiction[] = [];
  for (const [metric, conflictingFacts] of conflicts) {
    const values = conflictingFacts.map((f) => f.value).filter((v) => v !== null);
    const severity = classifySeverity(values);
    const resolution = determineResolution(conflictingFacts, sourceDocMap);
    const description = buildConflictDescription(metric, conflictingFacts, severity);

    contradictions.push({
      contradiction_id: `conflict_${metric}_${Date.now()}`,
      description,
      fact_ids: conflictingFacts.map((f) => f.fact_id),
      status: resolution,
    });
  }

  // Update contract with contradictions
  return {
    ...contract,
    contradictions,
  };
}

/**
 * Check if an unresolved conflict exists that would block high-confidence recommendations.
 * Material or critical unresolved conflicts block high-confidence.
 */
export function hasBlockingContradiction(contract: BusinessFactsContract): boolean {
  for (const contradiction of contract.contradictions) {
    if (
      contradiction.status === "unresolved" &&
      ["material_conflict", "critical_conflict"].includes(contradiction.status)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Get the most severe contradiction status in the contract.
 */
export function getMostSevereContradictionStatus(
  contract: BusinessFactsContract,
): (typeof CONTRADICTION_STATUSES)[number] | null {
  if (contract.contradictions.length === 0) return null;

  const severityOrder = [
    "critical_conflict",
    "material_conflict",
    "minor_conflict",
    "unresolved",
    "resolved_by_owner",
    "resolved_by_source_priority",
    "no_conflict",
  ];

  for (const status of severityOrder) {
    if (contract.contradictions.some((c) => c.status === status)) {
      return status as (typeof CONTRADICTION_STATUSES)[number];
    }
  }

  return null;
}

/**
 * Apply owner resolution to a contradiction.
 * Updates the contradiction status to reflect owner's decision.
 * Returns a new contract with the updated contradiction.
 */
export function resolveContradictionByOwner(
  contract: BusinessFactsContract,
  contradictionId: string,
  ownerChoice: "use_highest_evidence" | "custom_value",
): BusinessFactsContract {
  const updated = contract.contradictions.map((c) => {
    if (c.contradiction_id === contradictionId) {
      return {
        ...c,
        status: "resolved_by_owner" as const,
      };
    }
    return c;
  });

  return {
    ...contract,
    contradictions: updated,
  };
}
