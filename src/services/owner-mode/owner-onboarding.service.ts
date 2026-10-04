/**
 * Owner onboarding SERVICE — binds the pure onboarding domain to real, workspace+business-scoped DB
 * rows. Reads (never writes). The category-presence mapping is a pure exported function so it is unit
 * tested with no live DB; the async wrapper just prefetches the same scoped rows the whole-business
 * plan uses (one source of truth, no second query path).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import {
  prefetchOwnerDomainRows,
  type OwnerDomainRows,
} from "@/services/owner-mode/owner-db-providers";
import {
  computeOnboardingState,
  type BusinessProfileType,
  type OwnerRole,
  type OnboardingState,
} from "@/domain/owner-mode/owner-onboarding";
import { resolveSmbArchetype } from "@/domain/owner-mode/smb-archetype";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { intakeDomainToCategory } from "@/domain/owner-mode/input-record-parser";
import {
  firstReadSufficiencyFromSnapshots,
  type FirstReadSufficiency,
} from "@/domain/owner-finance/first-read-sufficiency";
import { inProgressFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";

/**
 * Categories readiness reads directly from a REAL financial snapshot (`rows.finance` /
 * `rows.cashflow` / `rows.wcItems`, checked below). A confirmed manual-entry note tagged with one of
 * these categories must NEVER also credit it — that would let a free-text note with no real number
 * (manual-entry's revenue/cash sections only require a short note; the amount field is optional, and
 * the note carries no periodStart/periodEnd/currency, so `materializeIntake` can never turn it into a
 * real `OwnerFinancialSnapshot` row) satisfy a readiness item the diagnosis engine actually needs
 * structured numbers for (F1). Every other category in `CATEGORY_TO_SNAPSHOT_DOMAIN` still has no
 * direct structured check in this function, so a confirmed intake remains its only real signal —
 * this exclusion is scoped to exactly the categories checked directly against real snapshot fields
 * below, not the whole finance/sales/operations/sop/marketing snapshot-domain surface.
 */
const FINANCIAL_SNAPSHOT_BACKED_CATEGORIES: ReadonlySet<OwnerInputCategory> = new Set([
  "revenue_sales",
  "expenses",
  "fixed_costs",
  "payroll",
  "cash_debt",
]);

export interface OwnerOnboardingDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

/**
 * Resolve a persisted businessType to its onboarding archetype via the one authoritative SMB
 * archetype config (`smb-archetype.ts`) — deterministic exact-match lookup, never regex inference. A
 * legacy/unrecognized persisted string fails safe to `generic_local_service`; the API boundary
 * (`businessCreateSchema`/`businessUpdateSchema`, both `z.enum(BUSINESS_TYPES)`) is what actually keeps
 * unknown values out — this function's fallback only matters for a value already persisted outside
 * that validation.
 */
export function mapBusinessTypeToProfile(businessType: string | null | undefined): BusinessProfileType {
  return resolveSmbArchetype(businessType);
}

/** Map operating model + branch signal to a canonical owner role. */
export function mapOperatingModelToRole(operatingModel: string | null | undefined, multiBranch: boolean): OwnerRole {
  const s = (operatingModel ?? "").toLowerCase();
  if (multiBranch) return "multi_location";
  if (/remote/.test(s)) return "remote_owner";
  if (/manager|managed|staff.?run|delegate/.test(s)) return "manager_run";
  if (/multi|branch/.test(s)) return "multi_location";
  return "owner_operated";
}

/**
 * Derive the data categories the owner has actually supplied from real persisted rows. Only a real
 * backing value counts as supplied — an empty/legacy row never inflates the supplied set.
 */
export function rowsToSuppliedCategories(rows: OwnerDomainRows): OwnerInputCategory[] {
  const out = new Set<OwnerInputCategory>();
  const f = rows.finance as Record<string, unknown> | null;
  const num = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);

  if (f) {
    if (num(f.revenue)) out.add("revenue_sales");
    if (num(f.costOfGoods) || num(f.variableCosts)) out.add("expenses");
    if (num(f.fixedCosts) || num(f.rent) || num(f.utilities)) out.add("fixed_costs");
    if (num(f.payroll)) out.add("payroll");
    if (num(f.marketingSpend)) out.add("marketing");
    if (num(f.debtPayments) || num(f.cashOnHand)) out.add("cash_debt");
  }
  const cf = rows.cashflow as Record<string, unknown> | null;
  if (cf) {
    if (num(cf.cashInHand) || num(cf.bankBalance) || num(cf.upcomingEmi)) out.add("cash_debt");
  }
  if (rows.wcItems && rows.wcItems.length > 0) out.add("cash_debt");
  if (rows.capacity) {
    out.add("equipment_logs");
    out.add("staff_attendance");
  }
  if (rows.compliance && rows.compliance.length > 0) out.add("tax_compliance");
  if (rows.proofs && rows.proofs.length > 0) out.add("proof_completion");
  if (rows.standingCount && rows.standingCount > 0) out.add("sops_checklists");
  // Owner-confirmed manual/import intakes (the real input paths) count as supplied data — EXCEPT for
  // the financial-snapshot-backed categories above, which already have a direct real-data check and
  // must never be satisfied by a bare confirmed note (F1: manual-entry notes are not structured data).
  for (const domain of rows.confirmedIntakeDomains ?? []) {
    const cat = intakeDomainToCategory(domain);
    if (cat && !FINANCIAL_SNAPSHOT_BACKED_CATEGORIES.has(cat)) out.add(cat);
  }
  return Array.from(out);
}

/**
 * The canonical first-read sufficiency for one workspace+business, from the real Finance snapshots:
 * the current effective (completed-period) snapshot, else the in-progress one — labelled provisional,
 * never promoted to completed evidence. Shared by onboarding, input guidance and readiness so every
 * surface answers "is the first read possible?" identically.
 */
export async function loadFirstReadSufficiency(
  deps: Pick<OwnerOnboardingDeps, "db" | "workspaceId" | "businessId" | "now">,
  rows: OwnerDomainRows
): Promise<FirstReadSufficiency> {
  const { db, workspaceId, businessId, now } = deps;
  const inProgress = await db.ownerFinancialSnapshot.findFirst(
    inProgressFinancialSnapshotQuery({ workspaceId, businessId }, undefined, now)
  );
  // Re-check the row's own period: only a snapshot that is genuinely in progress is provisional evidence.
  const provisional = inProgress && evidencePeriodState(inProgress, now) === "provisional" ? inProgress : null;
  return firstReadSufficiencyFromSnapshots({ completed: rows.finance, provisional });
}

export interface OwnerOnboardingResult extends OnboardingState {
  workspaceId: string;
  businessId: string;
  found: boolean;
  generatedFromRuntime: true;
  /**
   * The categories with real supplied records, as already computed for `computeOnboardingState`.
   * Exposed (not recomputed) so the owner-facing data hub can show per-category completion without
   * inventing a second notion of "supplied".
   */
  suppliedCategories: OwnerInputCategory[];
}

/** Build the onboarding state for ONE workspace+business from real persisted state. */
export async function getOwnerOnboardingState(deps: OwnerOnboardingDeps): Promise<OwnerOnboardingResult> {
  const { workspaceId, businessId } = deps;
  const rows = await prefetchOwnerDomainRows(deps);
  const business = rows.business as { name?: string; businessType?: string; operatingModel?: string | null; b2bSupported?: boolean } | null;

  if (!business) {
    const empty = computeOnboardingState({ businessName: "", profileType: "generic_local_service", ownerRole: "owner_operated", suppliedCategories: [] });
    return { ...empty, workspaceId, businessId, found: false, generatedFromRuntime: true, suppliedCategories: [] };
  }

  const profileType = mapBusinessTypeToProfile(business.businessType);
  // Multi-location is an owner-role signal, not a vertical/archetype one — detected purely from
  // operatingModel text (mapOperatingModelToRole's own /multi|branch/ check), never from businessType.
  const role = mapOperatingModelToRole(business.operatingModel, false);
  const supplied = rowsToSuppliedCategories(rows);
  const firstRead = await loadFirstReadSufficiency(deps, rows);

  const state = computeOnboardingState({
    firstRead,
    businessName: business.name ?? "",
    profileType,
    ownerRole: role,
    suppliedCategories: supplied,
  });
  return { ...state, workspaceId, businessId, found: true, generatedFromRuntime: true, suppliedCategories: supplied };
}
