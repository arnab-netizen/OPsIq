/**
 * Cockpit ↔ Finance-diagnosis priority bridge (F3).
 *
 * `/owner/finance` produces a real, business-scoped diagnosis (`OwnerFinanceCycle` + ranked
 * `OwnerFinanceAction`s) via `runFinanceDiagnosis`, but `/owner/cockpit` Home never read it — it only
 * ever showed the workspace-wide governed execution bridge (`process-execution-bridge.ts`'s
 * `topRoute`, built from process corrections + cash/profit protection). This module is the read-only
 * bridge that lets cockpit surface that diagnosis's top action, additively:
 *
 *  - It reuses the EXISTING `getFinanceDashboard` query (owner-finance/dashboard.service.ts) — no new
 *    DB query path, no new priority store. `latestCycle.actions[0]` (the same deterministic ranking
 *    `recommendedNextAction` already uses on /owner/finance) is the "highest-priority recommendation."
 *  - Business scoping (never leak Business A's diagnosis onto Business B's Home): cockpit has no
 *    business-context selector by design (see MinimumOwnerCockpit / owner/cockpit/page.tsx's own
 *    documented reasoning — the execution bridge it drives is workspace-scoped, not per-business).
 *    Introducing one here would be scope creep this task does not ask for. So: an explicit
 *    `businessId` (if the caller has one, matching the PR #381 `scope = businessId ? {workspaceId,
 *    businessId} : {workspaceId}` rigor) is always honored; with none, this ONLY resolves a diagnosis
 *    when the workspace has exactly one business — the ordinary self-serve-owner case, where "the
 *    currently selected business" is unambiguous by construction. Two or more businesses with no
 *    explicit selection fails CLOSED (returns null) rather than guessing business[0], which is
 *    exactly the cross-business leak class PR #381 phase 2 had to fix on /owner/now.
 *  - Freshness: a diagnosis older than `freshnessDays` (default 35, matching the freshness window
 *    used elsewhere in owner-mode — see owner-db-providers.ts) is not surfaced as "current."
 */
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { listBusinesses } from "@/services/founder-recovery/business.service";

export interface CockpitFinancePriority {
  businessId: string;
  businessName: string;
  cycleId: string;
  generatedAt: string;
  survivalState: string;
  overallHealthScore: number;
  /** The single highest-priority action from the latest cycle (`latestCycle.actions[0]`), or null when the cycle has no ranked action yet. */
  topAction: { id: string; title: string; description: string; priorityScore: number } | null;
}

const DEFAULT_FRESHNESS_DAYS = 35;

function isFresh(generatedAt: Date | string, now: Date, freshnessDays: number): boolean {
  const t = generatedAt instanceof Date ? generatedAt.getTime() : new Date(generatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const ageDays = (now.getTime() - t) / 86_400_000;
  return ageDays <= freshnessDays;
}

/**
 * Resolve the latest fresh Finance diagnosis's top action for cockpit Home, or null when none applies
 * (no cycle, stale cycle, or — with no explicit businessId — an ambiguous multi-business workspace).
 * Read-only, best-effort by contract: callers must treat a thrown error the same as null (see the
 * now-view route, which wraps this in try/catch so a failure here can never break the cockpit).
 */
export async function getCockpitFinancePriority(
  workspaceId: string,
  businessId: string | null | undefined,
  now: Date = new Date(),
  freshnessDays: number = DEFAULT_FRESHNESS_DAYS,
): Promise<CockpitFinancePriority | null> {
  let resolvedBusinessIdOrNull = businessId ?? null;

  if (!resolvedBusinessIdOrNull) {
    const businesses = await listBusinesses(workspaceId);
    if (businesses.length !== 1) return null; // ambiguous — fail closed, never guess business[0]
    resolvedBusinessIdOrNull = businesses[0].id;
  }
  // Guaranteed non-null here: either the truthy check above passed, or the ambiguous/empty case
  // returned already and this was just assigned a real id.
  const resolvedBusinessId: string = resolvedBusinessIdOrNull as string;

  const dashboard = await getFinanceDashboard(workspaceId, resolvedBusinessId);
  if (dashboard.selectedBusinessId !== resolvedBusinessId) return null; // ownership guard came back empty/different
  const cycle = dashboard.latestCycle as
    | { id: string; generatedAt: Date | string; survivalState: string; overallHealthScore: number }
    | null;
  if (!cycle) return null;
  if (!isFresh(cycle.generatedAt, now, freshnessDays)) return null;

  const business = dashboard.businesses.find((b) => b.id === resolvedBusinessId);
  const action = dashboard.recommendedNextAction as
    | { id: string; title: string; description: string; priorityScore: number }
    | null;

  return {
    businessId: resolvedBusinessId,
    businessName: business?.name ?? "",
    cycleId: cycle.id,
    generatedAt: cycle.generatedAt instanceof Date ? cycle.generatedAt.toISOString() : cycle.generatedAt,
    survivalState: cycle.survivalState,
    overallHealthScore: cycle.overallHealthScore,
    topAction: action ? { id: action.id, title: action.title, description: action.description, priorityScore: action.priorityScore } : null,
  };
}
