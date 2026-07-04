/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Strategy — Wealth Path read service (Phase 2 Slice 2).
 *
 * Surfaces the deterministic Wealth Path Classifier + Business Model Quality
 * score (execution.md Phase 2) for an owner's business, from persisted metric
 * snapshots only. Reads real data; nothing is invented — structural signals
 * OpsIQ does not yet capture (differentiation, moat, expansion path, owner
 * dependency, …) stay undefined, so the classifier returns a PROVISIONAL verdict
 * rather than guessing. Workspace ownership is enforced via the shared Module 1
 * `getBusiness` guard (no new auth path).
 */
import { db } from "@/lib/db";
import { getBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import { classifyWealthPath } from "@/domain/owner-strategy/wealth-path";
import type { WealthPathInput, WealthPathResult } from "@/domain/owner-strategy/wealth-path.types";

/** Percent margin from a part/whole pair, or undefined if not safely derivable. */
function marginPct(part: unknown, whole: unknown): number | undefined {
  if (
    typeof part !== "number" ||
    typeof whole !== "number" ||
    !Number.isFinite(part) ||
    !Number.isFinite(whole) ||
    whole <= 0
  ) {
    return undefined;
  }
  return (part / whole) * 100;
}

/**
 * Map a persisted metric snapshot to WealthPathInput. PURE and deterministic:
 * derives margins and the repeat-customer ratio from real fields only, and
 * leaves every structural signal undefined (OpsIQ does not yet capture them).
 * Honest missing data — never invented.
 */
export function mapMetricSnapshotToWealthPathInput(snapshot: any | null | undefined): WealthPathInput {
  if (!snapshot) return {};
  const revenue = typeof snapshot.revenue === "number" ? snapshot.revenue : undefined;
  const repeat = typeof snapshot.repeatCustomers === "number" ? snapshot.repeatCustomers : undefined;
  const fresh = typeof snapshot.newCustomers === "number" ? snapshot.newCustomers : undefined;
  const totalCustomers = (repeat ?? 0) + (fresh ?? 0);
  const repeatCustomerPct =
    repeat !== undefined && fresh !== undefined && totalCustomers > 0
      ? (repeat / totalCustomers) * 100
      : undefined;

  return {
    monthlyRevenue: revenue,
    grossMarginPct: marginPct(snapshot.grossProfit, revenue),
    netMarginPct: marginPct(snapshot.netProfit, revenue),
    repeatCustomerPct,
  };
}

export interface WealthPathServiceResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  snapshotPeriodEnd: string | null; // ISO string of the snapshot the verdict is based on
  input: WealthPathInput; // echo of the mapped inputs (transparency)
  result: WealthPathResult;
}

/**
 * Build the Wealth Path verdict for a business (or the owner's most-recent
 * business). Deterministic and honest: with no snapshot the input is empty and
 * the classifier reports a provisional survival-cashflow verdict that blocks
 * high-risk execution downstream.
 */
export async function getWealthPath(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<WealthPathServiceResult> {
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
    const emptyInput: WealthPathInput = {};
    return {
      businesses: businessList,
      selectedBusinessId: null,
      hasData: false,
      snapshotPeriodEnd: null,
      input: emptyInput,
      result: classifyWealthPath(emptyInput),
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership + existence guard

  const snapshot = await db.ownerMetricSnapshot.findFirst({
    where: { businessId: selectedBusinessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });

  const input = mapMetricSnapshotToWealthPathInput(snapshot);
  const result = classifyWealthPath(input);
  const periodEnd = snapshot?.periodEnd
    ? (snapshot.periodEnd instanceof Date ? snapshot.periodEnd : new Date(snapshot.periodEnd)).toISOString()
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: snapshot != null,
    snapshotPeriodEnd: periodEnd,
    input,
    result,
  };
}
