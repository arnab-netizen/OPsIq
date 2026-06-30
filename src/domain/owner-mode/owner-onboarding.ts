/**
 * Owner ONBOARDING — first-use guided setup as pure, deterministic domain logic.
 *
 * Given a business profile type, owner role, and the data categories the owner has actually supplied,
 * this computes: the ordered onboarding steps, what minimum data is still missing (with severity and
 * plain-language reason), the HONEST confidence available BEFORE diagnosis, whether a (limited) first
 * diagnosis can run, a cautious first-action preview, what NOT to do yet, the next best upload, proof
 * expectation, and role-aware delegation guidance.
 *
 * Hard guarantees (tested):
 *  - Confidence before diagnosis is DERIVED from supplied-vs-required critical data. It can never be
 *    "high" while a critical category is missing (no fake high confidence).
 *  - Business type changes which inputs are requested.
 *  - Remote-owner / manager-run roles change proof + delegation guidance.
 *  - Multi-location flags branch isolation and requires branch records.
 *
 * Pure module. No DB, no Date.now, no AI. Reuses the single input catalog + the confidence taxonomy.
 */
import {
  type OwnerInputCategory,
  INPUT_CATALOG,
  isCriticalCategory,
} from "@/domain/owner-mode/input-catalog";
import type { Confidence } from "@/services/owner-mode/owner-domain-ingestion";

export type BusinessProfileType =
  | "laundry_drycleaning"
  | "housekeeping_cleaning"
  | "remote_owner_service"
  | "b2b_contract_service"
  | "multi_location_smb"
  | "generic";

export const BUSINESS_PROFILE_TYPES: readonly BusinessProfileType[] = [
  "laundry_drycleaning", "housekeeping_cleaning", "remote_owner_service",
  "b2b_contract_service", "multi_location_smb", "generic",
] as const;

export type OwnerRole = "owner_operated" | "manager_run" | "remote_owner" | "multi_location";

export const OWNER_ROLES: readonly OwnerRole[] = [
  "owner_operated", "manager_run", "remote_owner", "multi_location",
] as const;

export interface ProfileInputRequirements {
  minimumRequired: OwnerInputCategory[];
  recommended: OwnerInputCategory[];
  optional: OwnerInputCategory[];
}

/** Categories every business needs for a first survival-grade read (never fewer than these). */
const UNIVERSAL_MINIMUM: OwnerInputCategory[] = ["revenue_sales", "expenses", "cash_debt"];

/** Per-profile additions to the minimum + the recommended tier. */
const PROFILE_REQUIREMENTS: Record<BusinessProfileType, { minAdd: OwnerInputCategory[]; recommended: OwnerInputCategory[] }> = {
  laundry_drycleaning: {
    minAdd: ["equipment_logs", "fixed_costs"],
    recommended: ["customer_count", "complaints_reviews", "payroll", "marketing", "proof_completion"],
  },
  housekeeping_cleaning: {
    minAdd: ["payroll", "staff_attendance"],
    recommended: ["staff_rota", "complaints_reviews", "customer_count", "proof_completion", "sops_checklists"],
  },
  remote_owner_service: {
    minAdd: ["payroll", "proof_completion"],
    recommended: ["staff_attendance", "sops_checklists", "complaints_reviews", "staff_training", "delivery_records"],
  },
  b2b_contract_service: {
    minAdd: ["b2b_contracts", "fixed_costs"],
    recommended: ["delivery_records", "vendor_invoices", "payroll", "proof_completion", "tax_compliance"],
  },
  multi_location_smb: {
    minAdd: ["branch_records", "fixed_costs"],
    recommended: ["payroll", "staff_attendance", "customer_count", "complaints_reviews", "proof_completion"],
  },
  generic: {
    minAdd: [],
    recommended: ["fixed_costs", "payroll", "customer_count", "complaints_reviews", "proof_completion"],
  },
};

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/**
 * Required inputs for a profile + role. Business type changes the minimum and recommended tiers; the
 * role can add requirements (remote/manager-run ⇒ proof + SOP; multi-location ⇒ branch records).
 */
export function requiredInputsForProfile(type: BusinessProfileType, role: OwnerRole): ProfileInputRequirements {
  const base = PROFILE_REQUIREMENTS[type];
  const roleMinAdd: OwnerInputCategory[] =
    role === "remote_owner" || role === "manager_run"
      ? ["proof_completion"]
      : role === "multi_location"
        ? ["branch_records"]
        : [];
  const roleRecommended: OwnerInputCategory[] =
    role === "remote_owner" || role === "manager_run"
      ? ["sops_checklists", "staff_attendance", "staff_training"]
      : role === "multi_location"
        ? ["staff_attendance", "customer_count"]
        : [];

  const minimumRequired = uniq([...UNIVERSAL_MINIMUM, ...base.minAdd, ...roleMinAdd]);
  const recommended = uniq([...base.recommended, ...roleRecommended]).filter((c) => !minimumRequired.includes(c));
  const optional = (Object.keys(INPUT_CATALOG) as OwnerInputCategory[]).filter(
    (c) => !minimumRequired.includes(c) && !recommended.includes(c),
  );
  return { minimumRequired, recommended, optional };
}

export interface OnboardingInput {
  businessName: string;
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  /** Data categories the owner has actually supplied (real records, not estimates). */
  suppliedCategories: OwnerInputCategory[];
  /** For multi-location: number of branches the owner operates. */
  branchCount?: number;
}

export type OnboardingStepId =
  | "create_business"
  | "choose_type"
  | "choose_role"
  | "enter_minimum_data"
  | "review_missing_data"
  | "see_confidence"
  | "run_first_diagnosis"
  | "see_first_action";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  complete: boolean;
}

export interface MissingMinimum {
  category: OwnerInputCategory;
  label: string;
  severity: "critical" | "high" | "medium";
  why: string;
  decisionAffected: string;
}

export interface OnboardingState {
  businessName: string;
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  steps: OnboardingStep[];
  requirements: ProfileInputRequirements;
  suppliedCount: number;
  minimumSuppliedCount: number;
  minimumRequiredCount: number;
  missingMinimum: MissingMinimum[];
  /** HONEST confidence available before diagnosis — never "high" while a critical category is missing. */
  confidenceBeforeDiagnosis: Confidence;
  /** A limited first diagnosis is allowed once the universal financial minimum is present. */
  canRunFirstDiagnosis: boolean;
  minimumComplete: boolean;
  /** Cautious, data-aware first action — collect the dominant missing input first if data is weak. */
  firstAction: string;
  /** What the owner should NOT do yet (acting confidently on weak data). */
  whatNotToDo: string[];
  /** The single next best upload (highest severity, then lowest effort). */
  nextBestUpload: OwnerInputCategory | null;
  /** Proof expectation, role-aware. */
  proofExpectation: string;
  /** Delegation guidance, role-aware. */
  delegationGuidance: string;
  /** Multi-location: branch data is kept isolated per business/branch. */
  multiLocation: boolean;
}

/** Categories that unlock a limited first diagnosis (survival-grade financial read). */
const FIRST_DIAGNOSIS_GATE: OwnerInputCategory[] = ["revenue_sales", "expenses", "cash_debt"];

function severityOf(category: OwnerInputCategory): "critical" | "high" | "medium" {
  if (isCriticalCategory(category)) return "critical";
  const gain = INPUT_CATALOG[category].expectedConfidenceGain;
  return gain === "high" ? "high" : "medium";
}

const EFFORT_RANK: Record<"low" | "medium" | "high", number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_RANK: Record<"critical" | "high" | "medium", number> = { critical: 0, high: 1, medium: 2 };

/**
 * Compute the full onboarding state. Deterministic; the confidence floor is enforced so weak data can
 * never present as high confidence.
 */
export function computeOnboardingState(input: OnboardingInput): OnboardingState {
  const supplied = new Set(input.suppliedCategories);
  const requirements = requiredInputsForProfile(input.profileType, input.ownerRole);

  const missingMinimumCats = requirements.minimumRequired.filter((c) => !supplied.has(c));
  const minimumSuppliedCount = requirements.minimumRequired.length - missingMinimumCats.length;
  const minimumComplete = missingMinimumCats.length === 0;

  const missingMinimum: MissingMinimum[] = missingMinimumCats
    .map((c) => ({
      category: c,
      label: INPUT_CATALOG[c].label,
      severity: severityOf(c),
      why: INPUT_CATALOG[c].why,
      decisionAffected: INPUT_CATALOG[c].decisionAffected,
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // Confidence before diagnosis — DERIVED, never inflated.
  const anyCriticalMissing = requirements.minimumRequired.some((c) => isCriticalCategory(c) && !supplied.has(c));
  const firstGateMet = FIRST_DIAGNOSIS_GATE.every((c) => supplied.has(c));
  const minRatio = requirements.minimumRequired.length === 0 ? 1 : minimumSuppliedCount / requirements.minimumRequired.length;
  let confidenceBeforeDiagnosis: Confidence;
  if (!firstGateMet || minimumSuppliedCount === 0) confidenceBeforeDiagnosis = "none";
  else if (anyCriticalMissing) confidenceBeforeDiagnosis = "low";
  else if (minRatio < 1) confidenceBeforeDiagnosis = "medium";
  else confidenceBeforeDiagnosis = "high";

  const canRunFirstDiagnosis = firstGateMet;

  // Next best upload: missing minimum first (severity then effort), else missing recommended.
  const rankPool: OwnerInputCategory[] = missingMinimumCats.length > 0
    ? missingMinimumCats
    : requirements.recommended.filter((c) => !supplied.has(c));
  const nextBestUpload = rankPool.length === 0
    ? null
    : [...rankPool].sort((a, b) => {
        const s = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
        if (s !== 0) return s;
        return EFFORT_RANK[INPUT_CATALOG[a].ownerEffort] - EFFORT_RANK[INPUT_CATALOG[b].ownerEffort];
      })[0];

  // Cautious first action.
  let firstAction: string;
  if (!canRunFirstDiagnosis) {
    const need = FIRST_DIAGNOSIS_GATE.filter((c) => !supplied.has(c)).map((c) => INPUT_CATALOG[c].label);
    firstAction = `Enter your ${need.join(", ")} so OpsIQ can run a first survival-grade read. No strong action yet — the numbers come first.`;
  } else if (confidenceBeforeDiagnosis !== "high" && nextBestUpload) {
    firstAction = `Run the limited first diagnosis, then add ${INPUT_CATALOG[nextBestUpload].label} before acting on anything risky — confidence is ${confidenceBeforeDiagnosis}, so treat the first read as directional.`;
  } else {
    firstAction = `Run the first diagnosis and act on the single highest-impact item it returns; you have enough data for a confident first read.`;
  }

  // What NOT to do yet.
  const whatNotToDo: string[] = [];
  if (confidenceBeforeDiagnosis === "none" || confidenceBeforeDiagnosis === "low") {
    whatNotToDo.push("Do not make pricing, hiring, or spend changes yet — the data is too thin for a safe call.");
  }
  if (anyCriticalMissing) {
    whatNotToDo.push("Do not treat any score as final while critical financial data is missing.");
  }
  if (input.ownerRole === "remote_owner" || input.ownerRole === "manager_run") {
    whatNotToDo.push("Do not mark delegated work complete without proof — you are not on site to verify it.");
  }
  if (input.profileType === "multi_location_smb" || input.ownerRole === "multi_location") {
    whatNotToDo.push("Do not judge the whole business on one branch — review each branch's records separately.");
  }
  if (whatNotToDo.length === 0) {
    whatNotToDo.push("Do not chase growth before clearing the single dominant constraint the diagnosis returns.");
  }

  // Role-aware proof + delegation guidance.
  const remoteish = input.ownerRole === "remote_owner" || input.ownerRole === "manager_run";
  const proofExpectation = remoteish
    ? "Because you are not executing on site, every delegated action needs photo/record proof before it counts as done. Proof completion is part of your minimum setup."
    : "Actions need a simple completion proof (a note, photo, or record) before OpsIQ marks them done and learns from them.";
  const delegationGuidance = remoteish
    ? "Your manager/staff own execution; OpsIQ prepares the work and you approve. Keep SOPs and attendance current so delegation is safe."
    : input.ownerRole === "multi_location"
      ? "Delegate per branch to the branch lead; OpsIQ keeps each branch's data isolated so you can hold each one accountable separately."
      : "You execute the highest-impact items; OpsIQ prepares supporting work and flags what can be handed off as your team grows.";

  const steps: OnboardingStep[] = [
    { id: "create_business", label: "Create or select your business", complete: input.businessName.trim().length > 0 },
    { id: "choose_type", label: "Choose your business type", complete: true },
    { id: "choose_role", label: "Choose how you run it", complete: true },
    { id: "enter_minimum_data", label: "Enter the minimum business data", complete: minimumComplete },
    { id: "review_missing_data", label: "Review what data is missing", complete: input.suppliedCategories.length > 0 },
    { id: "see_confidence", label: "See your confidence before diagnosis", complete: input.suppliedCategories.length > 0 },
    { id: "run_first_diagnosis", label: "Run your first diagnosis", complete: canRunFirstDiagnosis },
    { id: "see_first_action", label: "See your first recommended action", complete: canRunFirstDiagnosis },
  ];

  return {
    businessName: input.businessName,
    profileType: input.profileType,
    ownerRole: input.ownerRole,
    steps,
    requirements,
    suppliedCount: input.suppliedCategories.length,
    minimumSuppliedCount,
    minimumRequiredCount: requirements.minimumRequired.length,
    missingMinimum,
    confidenceBeforeDiagnosis,
    canRunFirstDiagnosis,
    minimumComplete,
    firstAction,
    whatNotToDo,
    nextBestUpload,
    proofExpectation,
    delegationGuidance,
    multiLocation: input.profileType === "multi_location_smb" || input.ownerRole === "multi_location",
  };
}
