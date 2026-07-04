/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * Owner Strategy — Wealth Command Center read service (Phases 24–25 runtime
 * surface). Loads the owner's real metric snapshot, derives the wealth-path
 * verdict, and composes the full owner decision view via
 * `composeWealthCommandCenter` (which reuses every wealth-loop engine).
 *
 * Honest default: with only financial-snapshot data (no structural signals), the
 * safe baseline next move is "stabilize current operations / preserve cash" — the
 * command center shows that with a prepared Work Package. Richer candidate actions
 * come from the existing diagnosis engines and can be passed in by the caller.
 */
import { db } from "@/lib/db";
import { getBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import { mapMetricSnapshotToWealthPathInput } from "@/services/owner-strategy/wealth-path.service";
import { composeWealthCommandCenter } from "@/domain/owner-strategy/command-center";
import type { WealthCommandCenter, ProposedAction } from "@/domain/owner-strategy/command-center.types";
import type { RiskAdjustedWealthInput } from "@/domain/owner-strategy/risk-adjusted-wealth.types";
import type { WealthPathInput } from "@/domain/owner-strategy/wealth-path.types";

/** The safe baseline candidate for a business known only from financials. */
function baselineStabilizeAction(input: WealthPathInput): ProposedAction {
  return {
    label: "Stabilize current operations",
    kind: "fix_operations",
    workPackageKind: "sop_creation",
    assigneeRole: "staff",
    financialDecision: "APPROVED",
    downsideRisk: "low",
    capitalRequirement: "low",
    evidenceStrength: "medium",
    netMarginPotentialPct: input.netMarginPct ?? undefined,
    grossMarginPotentialPct: input.grossMarginPct ?? undefined,
    problem: "Stabilize the core before pursuing growth.",
  };
}

const PRESERVE_CASH_ALT: RiskAdjustedWealthInput = {
  label: "Preserve cash and hold",
  kind: "preserve_cash",
  downsideRisk: "low",
  capitalRequirement: "low",
  evidenceStrength: "high",
};

export interface WealthCommandCenterServiceResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  snapshotPeriodEnd: string | null;
  commandCenter: WealthCommandCenter;
}

export async function getWealthCommandCenter(
  workspaceId: string,
  requestedBusinessId?: string | null,
): Promise<WealthCommandCenterServiceResult> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id,
    name: b.name,
    businessType: b.businessType,
    currency: b.currency,
    isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId) {
    const owned = businesses.find((b: any) => b.id === requestedBusinessId);
    if (owned) selectedBusinessId = owned.id;
  }
  if (!selectedBusinessId && businesses.length > 0) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    // No business yet → startup mode surface (empty validation prompt).
    return {
      businesses: businessList,
      selectedBusinessId: null,
      hasData: false,
      snapshotPeriodEnd: null,
      commandCenter: composeWealthCommandCenter({ mode: "startup", startupIntake: {}, startupIdeas: [] }),
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const business = businesses.find((b: any) => b.id === selectedBusinessId);
  const snapshot = await db.ownerMetricSnapshot.findFirst({
    where: { businessId: selectedBusinessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });

  const wealthPathInput = mapMetricSnapshotToWealthPathInput(snapshot);
  const commandCenter = composeWealthCommandCenter({
    mode: "operating",
    businessName: business?.name ?? null,
    wealthPathInput,
    proposedAction: baselineStabilizeAction(wealthPathInput),
    alternatives: [PRESERVE_CASH_ALT],
  });

  const periodEnd = snapshot?.periodEnd
    ? (snapshot.periodEnd instanceof Date ? snapshot.periodEnd : new Date(snapshot.periodEnd)).toISOString()
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: snapshot != null,
    snapshotPeriodEnd: periodEnd,
    commandCenter,
  };
}
