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
import {
  FIRST_READ_FACT_CATEGORIES,
  FIRST_READ_FACT_LABEL,
  firstReadSufficiencyFromCategories,
  type FirstReadFact,
  type FirstReadSufficiency,
} from "@/domain/owner-finance/first-read-sufficiency";
import { type SmbArchetype, SMB_ARCHETYPES, SMB_ARCHETYPE_CONFIG } from "@/domain/owner-mode/smb-archetype";

/**
 * `BusinessProfileType` is the SMB archetype key (see `smb-archetype.ts`, the single authoritative
 * requirements table). This alias preserves the name for the existing consumers of this module
 * (`owner-readiness.service.ts`, `owner-input-guidance.service.ts`, `owner-manual-entry.service.ts`,
 * `owner-action-assignment.service.ts`, `input-guidance.ts`, `readiness-score.ts`) so they keep
 * compiling unchanged — there is no second, independently-maintained profile taxonomy underneath it.
 */
export type BusinessProfileType = SmbArchetype;
export const BUSINESS_PROFILE_TYPES: readonly BusinessProfileType[] = SMB_ARCHETYPES;

export type OwnerRole = "owner_operated" | "manager_run" | "remote_owner" | "multi_location";

export const OWNER_ROLES: readonly OwnerRole[] = [
  "owner_operated", "manager_run", "remote_owner", "multi_location",
] as const;

export interface ProfileInputRequirements {
  minimumRequired: OwnerInputCategory[];
  recommended: OwnerInputCategory[];
  optional: OwnerInputCategory[];
}

/**
 * The STARTER-MINIMUM evidence categories every business profile needs for a well-founded picture.
 * This is profile/confidence evidence, NOT the first-read gate: whether a first read is possible is
 * decided only by the canonical `FirstReadSufficiency` (first-read-sufficiency.ts).
 */
const UNIVERSAL_MINIMUM: OwnerInputCategory[] = ["revenue_sales", "expenses", "cash_debt"];

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/**
 * Required inputs for an archetype + role. The archetype (`SMB_ARCHETYPE_CONFIG`, the one authoritative
 * requirements table) changes the minimum and recommended tiers; the role can add requirements
 * (remote/manager-run ⇒ proof + SOP; multi-location ⇒ branch records) — this role overlay is
 * orthogonal to and always applied on top of the archetype's own tiers, regardless of what the
 * archetype itself defaults a category to (multi-location's `branch_records` is never structurally
 * required by any archetype, but the role overlay unconditionally adds it here).
 */
export function requiredInputsForProfile(type: BusinessProfileType, role: OwnerRole): ProfileInputRequirements {
  const base = SMB_ARCHETYPE_CONFIG[type];
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

  const minimumRequired = uniq([...UNIVERSAL_MINIMUM, ...base.requiredAdd, ...roleMinAdd]);
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
  /**
   * The canonical first-read sufficiency (first-read-sufficiency.ts), computed from the real Finance
   * snapshot. When omitted (callers that only know category presence) it is derived from
   * `suppliedCategories` through the same rule — the gate is never a separate category list.
   */
  firstRead?: FirstReadSufficiency;
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
  /** A limited first diagnosis is allowed once the canonical first-read sufficiency is met. */
  canRunFirstDiagnosis: boolean;
  /** The canonical first-read sufficiency this state's gate is derived from (one rule, no copies). */
  firstRead: FirstReadSufficiency;
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

/**
 * True only for a missing category that actually blocks the first read under the CANONICAL contract
 * (`firstRead`): the category explains a fact the engine still lacks. A cost category blocks only while
 * NO cost component is known (any one satisfies it), so supplying fixed costs never leaves "Expenses"
 * flagged as blocking. Any other missing starter-minimum category improves confidence but does not stop
 * the owner from acting on the financial read the critical facts already support.
 */
export function blocksFirstRead(category: OwnerInputCategory, firstRead: FirstReadSufficiency): boolean {
  return firstRead.missing.some((fact) => FIRST_READ_FACT_CATEGORIES[fact].includes(category));
}

/** Owner-facing sentence naming what the first read still needs ("revenue, one cost figure and cash in hand (enter 0 if none)"). */
export function describeMissingFirstReadFacts(missing: readonly FirstReadFact[]): string {
  const labels = missing.map((f) => FIRST_READ_FACT_LABEL[f]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

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
  const firstRead = input.firstRead ?? firstReadSufficiencyFromCategories(supplied);
  const firstGateMet = firstRead.sufficient;
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
    firstAction = `Enter your ${describeMissingFirstReadFacts(firstRead.missing)} so OpsIQ can run a first read. Rough estimates are fine. No strong action yet — the numbers come first.`;
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
  if (input.ownerRole === "multi_location") {
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
    // F8: these two used to be labeled as owner ACTIONS ("Review what data is missing", "See your
    // confidence before diagnosis") but their completion condition was never tied to the owner
    // actually reviewing or viewing anything — it is the exact same condition as `enter_minimum_data`
    // one step up (any category supplied at all), so the moment that step completes, these ticked
    // green too without the owner doing the distinct thing their old label claimed. There is no
    // persisted "viewed this page" signal to gate on (and adding one is out of scope — no new
    // onboarding-progress table), so the honest fix is a label that describes what actually became
    // true — the missing-data list and the confidence score now reflect real data — not an action
    // that was never actually observed.
    { id: "review_missing_data", label: "Your missing-data list now reflects real data", complete: input.suppliedCategories.length > 0 },
    { id: "see_confidence", label: "Your confidence score now reflects real data", complete: input.suppliedCategories.length > 0 },
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
    firstRead,
    minimumComplete,
    firstAction,
    whatNotToDo,
    nextBestUpload,
    proofExpectation,
    delegationGuidance,
    multiLocation: input.ownerRole === "multi_location",
  };
}

/**
 * Plain-language phrase for a `Confidence` level. The raw token ("none" / "low" / "medium" /
 * "high") must never reach an owner verbatim — every UI surface that shows confidence before
 * diagnosis (/owner/onboarding, /owner/data) renders this phrase instead of the enum.
 */
export function confidenceDisplayPhrase(confidence: string): string {
  switch (confidence) {
    // "Solid" alone (esp. next to a 100% bar) reads as "setup finished" — a real usability test
    // confirmed an owner interpreted 5/5 starter items + this badge as total completion, even
    // though Money/Customers/Operations were still empty. This measures only the STARTER minimum,
    // never overall completeness, so the phrase must say so.
    case "high":
      return "Starter information complete";
    case "medium":
      return "Getting there";
    case "low":
      return "Early days";
    case "none":
    default:
      return "Not enough data yet";
  }
}
