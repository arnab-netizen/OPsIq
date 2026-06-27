/**
 * Owner Collective Decision — collective runtime read path (Phase 1 Slice A).
 *
 * Proves a DB-backed, workspace-scoped, Owner-Mode runtime READ path from an
 * existing governed capability (the collective command-and-control engine,
 * `runCollective`) into an owner-facing service.
 *
 * It reads the persisted, workspace-scoped `BusinessConditionProfile` (the
 * current per-dimension business condition), maps its categorical dimension
 * levels into the collective layer's `DomainSignalInput[]` vocabulary, and runs
 * the EXISTING collective engine to produce a single governed
 * `CollectiveDecisionPacket`. No scoring, vetoes, confidence, or sequencing is
 * re-derived here — that all lives in `runCollective`. This is mapping +
 * persistence + an explicit empty state only. Reads persisted data only; nothing
 * is invented and no mock is used.
 */
import { db } from "@/lib/db";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import type {
  CollectiveDecisionPacket,
  DomainKey,
  DomainSignalInput,
  RecommendationConfidence,
  SignalStatus,
  TrainingSeverity,
} from "@/domain/collective-training/collective-types";

/** Aggregate data confidence for the assembled signal set. */
export type CommandCenterDataConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface OwnerCommandCenterPayload {
  /** True only when a current persisted condition profile was found for the workspace. */
  hasData: boolean;
  workspaceId: string;
  /** The id of the persisted profile the packet was derived from (null in empty state). */
  sourceProfileId: string | null;
  engagementId: string | null;
  businessStatus: string | null;
  /** Confidence in the assembled signal set (driven by how many dimensions were recognized). */
  dataConfidence: CommandCenterDataConfidence;
  /** Number of domain signals handed to the collective engine. */
  signalCount: number;
  /** The domains the persisted dimensions mapped onto. */
  mappedDomains: DomainKey[];
  /** Dimensions whose persisted level was missing/unrecognized (shown, never invented). */
  missingCriticalData: string[];
  /** The governed collective decision packet, or null in the empty state. */
  packet: CollectiveDecisionPacket | null;
}

/** Recognized categorical levels shared by the persisted condition dimensions. */
type Level = "low" | "medium" | "high" | "critical";

function normalizeLevel(value: string | null | undefined): Level | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v === "low" || v === "medium" || v === "high" || v === "critical" ? v : null;
}

/**
 * A persisted dimension and how it maps into a domain signal. `direction` says
 * whether a HIGHER level is worse (pressure/risk dimensions) or a LOWER level is
 * worse (maturity/capacity/readiness dimensions).
 */
interface DimensionMapping {
  field: string;
  domain: DomainKey;
  direction: "higher_is_worse" | "lower_is_worse";
}

const DIMENSION_MAP: readonly DimensionMapping[] = [
  { field: "cashPressureLevel", domain: "cash-survival", direction: "higher_is_worse" },
  { field: "marginPressureLevel", domain: "profit-improvement", direction: "higher_is_worse" },
  { field: "ownerDependencyRisk", domain: "owner-workload", direction: "higher_is_worse" },
  { field: "keyPersonDependencyRisk", domain: "staff-workload", direction: "higher_is_worse" },
  { field: "clientConcentrationRisk", domain: "retention", direction: "higher_is_worse" },
  { field: "executionCapacityLevel", domain: "capacity", direction: "lower_is_worse" },
  { field: "processMaturityLevel", domain: "sop-process", direction: "lower_is_worse" },
  { field: "managementMaturityLevel", domain: "quality", direction: "lower_is_worse" },
  { field: "growthReadinessLevel", domain: "growth-readiness", direction: "lower_is_worse" },
];

/** Map a normalized level + direction to a {status, severity}. Worse = RED/high severity. */
function severityFor(level: Level, direction: DimensionMapping["direction"]): { status: SignalStatus; severity: TrainingSeverity } {
  // Order the four levels from best to worst for this direction.
  const worst = direction === "higher_is_worse" ? level : invert(level);
  switch (worst) {
    case "critical":
      return { status: "RED", severity: "CRITICAL" };
    case "high":
      return { status: "RED", severity: "HIGH" };
    case "medium":
      return { status: "AMBER", severity: "MEDIUM" };
    case "low":
    default:
      return { status: "GREEN", severity: "LOW" };
  }
}

/** Invert a level so "lower is worse" dimensions can reuse the same severity ladder. */
function invert(level: Level): Level {
  switch (level) {
    case "low":
      return "critical";
    case "medium":
      return "high";
    case "high":
      return "medium";
    case "critical":
    default:
      return "low";
  }
}

/**
 * Build the workspace-scoped Owner Command Center payload from the current
 * persisted business condition profile. Workspace isolation is enforced by the
 * direct `workspaceId` filter on the persisted row. Returns an explicit
 * needs-data empty state when no current profile exists — never false confidence.
 */
export async function getOwnerCommandCenter(
  workspaceId: string,
  requestedEngagementId?: string | null
): Promise<OwnerCommandCenterPayload> {
  const profile = await db.businessConditionProfile.findFirst({
    where: {
      workspaceId,
      isCurrent: true,
      ...(requestedEngagementId ? { engagementId: requestedEngagementId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!profile) {
    return {
      hasData: false,
      workspaceId,
      sourceProfileId: null,
      engagementId: null,
      businessStatus: null,
      dataConfidence: "LOW",
      signalCount: 0,
      mappedDomains: [],
      missingCriticalData: ["business_condition_profile"],
      packet: null,
    };
  }

  const signals: DomainSignalInput[] = [];
  const mappedDomains: DomainKey[] = [];
  const missingCriticalData: string[] = [];

  for (const mapping of DIMENSION_MAP) {
    const raw = (profile as Record<string, unknown>)[mapping.field];
    const level = normalizeLevel(typeof raw === "string" ? raw : null);
    if (level === null) {
      missingCriticalData.push(mapping.field);
      continue;
    }
    const { status, severity } = severityFor(level, mapping.direction);
    signals.push({
      domain: mapping.domain,
      status,
      severity,
      confidence: "HIGH",
      evidenceUsed: [`business_condition_profile.${mapping.field}=${level}`],
    });
    mappedDomains.push(mapping.domain);
  }

  const recognized = signals.length;
  const dataConfidence: CommandCenterDataConfidence =
    recognized >= 5 ? "HIGH" : recognized >= 3 ? "MEDIUM" : "LOW";

  // Persisted profile with no recognizable dimension levels: surface the data
  // gap rather than running the engine on an empty signal set.
  if (recognized === 0) {
    return {
      hasData: true,
      workspaceId,
      sourceProfileId: profile.id,
      engagementId: profile.engagementId,
      businessStatus: profile.businessStatus ?? null,
      dataConfidence: "LOW",
      signalCount: 0,
      mappedDomains: [],
      missingCriticalData,
      packet: null,
    };
  }

  const input: CollectiveInput = {
    archetype: profile.businessStatus ?? "unspecified",
    ownerGoal: "stabilize_and_protect_the_business",
    signals,
    lowDataConfidence: dataConfidence === "LOW",
  };

  const packet: CollectiveDecisionPacket = runCollective(input);

  return {
    hasData: true,
    workspaceId,
    sourceProfileId: profile.id,
    engagementId: profile.engagementId,
    businessStatus: profile.businessStatus ?? null,
    dataConfidence,
    signalCount: recognized,
    mappedDomains,
    missingCriticalData,
    packet,
  };
}

export type { RecommendationConfidence };
