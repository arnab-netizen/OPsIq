/**
 * Owner Data Hub — the pure presentation model behind `/owner/data` ("Add & Connect Data").
 *
 * This module invents NO new taxonomy and NO new confidence maths. It reads the existing
 * `INPUT_CATALOG` (the single source of truth for owner-facing data categories) and the existing
 * onboarding domain contract (`OnboardingState`), and answers two presentation questions the owner
 * asks that nothing currently answers:
 *
 *   1. Which business-language group does this category belong to?
 *   2. Where do I go to supply it — the manual-entry form, or the upload path?
 *
 * Pure module. No DB, no Date.now, no AI, no fetch.
 */
import {
  INPUT_CATALOG,
  OWNER_INPUT_CATEGORIES,
  isCriticalCategory,
  type OwnerInputCategory,
} from "@/domain/owner-mode/input-catalog";
import { MANUAL_ENTRY_SECTIONS } from "@/domain/owner-mode/owner-manual-entry-form";
import { BUSINESS_TYPES, type BusinessType } from "@/domain/founder-recovery/types";

/** Business-language groups. Four groups, not twenty flat rows — the catalog is the taxonomy, this is the shelf. */
export type OwnerDataGroupId = "money" | "people" | "customers" | "operations";

export interface OwnerDataGroup {
  id: OwnerDataGroupId;
  label: string;
  /** Why an owner should care about this whole group, in one line. */
  purpose: string;
  categories: readonly OwnerInputCategory[];
}

export const OWNER_DATA_GROUPS: readonly OwnerDataGroup[] = [
  {
    id: "money",
    label: "Money",
    purpose: "What comes in, what goes out, and what is left.",
    categories: ["revenue_sales", "expenses", "fixed_costs", "cash_debt", "vendor_invoices", "tax_compliance"],
  },
  {
    id: "people",
    label: "People and capacity",
    purpose: "Who works, when, and what that costs.",
    categories: ["payroll", "staff_attendance", "staff_rota", "staff_training"],
  },
  {
    id: "customers",
    label: "Customers and demand",
    purpose: "Who buys, how often, and what they say.",
    categories: ["customer_count", "complaints_reviews", "marketing", "b2b_contracts"],
  },
  {
    id: "operations",
    label: "Operations and quality",
    purpose: "What gets made or delivered, and whether it is done right.",
    categories: [
      "delivery_records",
      "inventory_stock",
      "equipment_logs",
      "sops_checklists",
      "proof_completion",
      "branch_records",
    ],
  },
] as const;

/** Every catalog category must appear in exactly one group — guarded by test, not by comment. */
export function groupedCategories(): readonly OwnerInputCategory[] {
  return OWNER_DATA_GROUPS.flatMap((g) => g.categories);
}

/** The manual-entry section that captures this category, if the form covers it. */
export function manualEntrySectionForCategory(category: OwnerInputCategory): string | null {
  const section = MANUAL_ENTRY_SECTIONS.find((s) => s.category === category);
  return section ? section.id : null;
}

export type OwnerDataInputRoute = "manual-entry" | "upload";

export interface CategoryInputTarget {
  /** Which surface can accept this category. */
  route: OwnerDataInputRoute;
  /** The href to send the owner to, deep-linked where the target supports it. */
  href: string;
  /** Owner-facing label for the control. */
  actionLabel: string;
}

/**
 * Where the owner supplies this category. Categories the manual-entry form covers go to the form
 * (lower effort, works on a phone); everything else goes to the governed upload path.
 */
export function inputTargetForCategory(category: OwnerInputCategory): CategoryInputTarget {
  const sectionId = manualEntrySectionForCategory(category);
  if (sectionId) {
    return {
      route: "manual-entry",
      href: `/owner/manual-entry#${sectionId}`,
      actionLabel: "Enter",
    };
  }
  return { route: "upload", href: "/owner/intake", actionLabel: "Upload" };
}

export type CategoryStatus = "supplied" | "missing_required" | "missing_recommended" | "optional";

export interface OwnerDataCategoryView {
  category: OwnerInputCategory;
  label: string;
  /** From the catalog — why OpsIQ needs it. */
  why: string;
  /** From the catalog — which decision it affects. */
  decisionAffected: string;
  /** From the catalog — what becomes unsafe without it. */
  recommendationAtRiskIfMissing: string;
  expectedConfidenceGain: "high" | "medium" | "low";
  ownerEffort: "low" | "medium" | "high";
  critical: boolean;
  status: CategoryStatus;
  target: CategoryInputTarget;
}

export interface OwnerDataGroupView extends Omit<OwnerDataGroup, "categories"> {
  categories: OwnerDataCategoryView[];
  suppliedCount: number;
  totalCount: number;
}

export interface BuildDataHubInput {
  /** Categories with real supplied records — derived from the existing onboarding state. */
  suppliedCategories: readonly OwnerInputCategory[];
  /** Minimum required categories for this business profile+role — from the existing requirements contract. */
  minimumRequired: readonly OwnerInputCategory[];
  /** Recommended categories — from the existing requirements contract. */
  recommended: readonly OwnerInputCategory[];
}

function statusFor(
  category: OwnerInputCategory,
  supplied: ReadonlySet<OwnerInputCategory>,
  minimum: ReadonlySet<OwnerInputCategory>,
  recommended: ReadonlySet<OwnerInputCategory>,
): CategoryStatus {
  if (supplied.has(category)) return "supplied";
  if (minimum.has(category)) return "missing_required";
  if (recommended.has(category)) return "missing_recommended";
  return "optional";
}

/**
 * Build the grouped hub view. Completion counts come only from `suppliedCategories` — this module
 * never invents a completeness value and never recomputes confidence.
 */
export function buildOwnerDataHubView(input: BuildDataHubInput): OwnerDataGroupView[] {
  const supplied = new Set(input.suppliedCategories);
  const minimum = new Set(input.minimumRequired);
  const recommended = new Set(input.recommended);

  return OWNER_DATA_GROUPS.map((group) => {
    const categories = group.categories.map((category): OwnerDataCategoryView => {
      const meta = INPUT_CATALOG[category];
      return {
        category,
        label: meta.label,
        why: meta.why,
        decisionAffected: meta.decisionAffected,
        recommendationAtRiskIfMissing: meta.recommendationAtRiskIfMissing,
        expectedConfidenceGain: meta.expectedConfidenceGain,
        ownerEffort: meta.ownerEffort,
        critical: isCriticalCategory(category),
        status: statusFor(category, supplied, minimum, recommended),
        target: inputTargetForCategory(category),
      };
    });

    return {
      id: group.id,
      label: group.label,
      purpose: group.purpose,
      categories,
      suppliedCount: categories.filter((c) => c.status === "supplied").length,
      totalCount: categories.length,
    };
  });
}

/** Total categories in the catalog — used for the hub's overall counter. */
export const OWNER_DATA_CATEGORY_COUNT = OWNER_INPUT_CATEGORIES.length;

/**
 * Owner-facing labels for the canonical `BUSINESS_TYPES`. Derived from the accepted enum so the
 * business-profile form can never offer a value the governed create endpoint would reject.
 */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  laundry_local_service: "Laundry or similar local service",
  generic_local_service: "Local service business",
  retail_service_hybrid: "Retail, or retail plus services",
};

export const BUSINESS_TYPE_OPTIONS: ReadonlyArray<{ value: BusinessType; label: string }> =
  BUSINESS_TYPES.map((value) => ({ value, label: BUSINESS_TYPE_LABELS[value] }));
