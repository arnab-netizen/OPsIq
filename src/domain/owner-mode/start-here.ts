/**
 * START HERE — a persistent, resumable guided setup built entirely on the real readiness signals
 * `getOwnerOnboardingState()` already computes (owner-onboarding.ts). This is presentation logic
 * only: it never invents a new completeness model, it maps the existing, already-tested
 * minimumRequired/missingMinimum/canRunFirstDiagnosis signals onto the 5-step structure a real
 * usability test found the app was missing ("I don't know where to start"). Because it reads
 * real backend state rather than component/localStorage state, a step's completion survives the
 * owner leaving and returning — there is nothing else to persist.
 *
 * Pure. No DB, no fetch — the page assembles the inputs from data it already fetches.
 */
import type { MissingMinimum, ProfileInputRequirements } from "./owner-onboarding";
import type { OwnerInputCategory } from "./input-catalog";

export type StartHereStepId =
  | "business_basics"
  | "money_numbers"
  | "customers"
  | "operations"
  | "first_priorities";

export interface StartHereStep {
  id: StartHereStepId;
  label: string;
  /** Why this step matters, in plain language — shown for the current/next step. */
  why: string;
  /** What happens if the owner skips this step for now — honest, not alarmist. */
  ifSkipped: string;
  complete: boolean;
  /** False when this step doesn't apply to this business at all (category not required for this
   *  archetype) — shown as "Not needed for your business," never as an incomplete red flag. */
  applicable: boolean;
  href: string;
}

export interface StartHereInput {
  /** Always true once the page can load — a business exists. */
  businessBasicsComplete: boolean;
  /** From OnboardingState.canRunFirstDiagnosis — the real "enough for a first read" signal. */
  canRunFirstDiagnosis: boolean;
  missingMinimum: MissingMinimum[];
  /** Categories the owner has actually supplied (OnboardingState via /api/owner/onboarding). */
  suppliedCategories: readonly OwnerInputCategory[];
  requirements: ProfileInputRequirements;
  /** Whether the owner has acted on at least one task/priority (status moved past PROPOSED). */
  hasEngagedAPriority: boolean;
}

function categoryComplete(category: OwnerInputCategory, input: StartHereInput): { complete: boolean; applicable: boolean } {
  const applicable =
    input.requirements.minimumRequired.includes(category) || input.requirements.recommended.includes(category);
  if (!applicable) return { complete: true, applicable: false };
  // Complete only when the category was actually supplied. Absence from `missingMinimum` is not
  // evidence: a recommended (non-minimum) category never appears there even when nothing was added.
  return { complete: input.suppliedCategories.includes(category), applicable: true };
}

export function computeStartHereSteps(input: StartHereInput): StartHereStep[] {
  const customers = categoryComplete("customer_count", input);
  const operations = categoryComplete("sops_checklists", input);

  return [
    {
      id: "business_basics",
      label: "Business basics",
      why: "OpsIQ needs to know what kind of business this is to ask the right questions.",
      ifSkipped: "Nothing else can start until this is done.",
      complete: input.businessBasicsComplete,
      applicable: true,
      href: "/owner/data",
    },
    {
      id: "money_numbers",
      label: "Add your basic money numbers",
      why: "This lets OpsIQ assess cash and profitability — the foundation for every other read.",
      ifSkipped: "OpsIQ can't tell you whether the business is financially safe yet.",
      complete: input.canRunFirstDiagnosis,
      applicable: true,
      href: "/owner/finance",
    },
    {
      id: "customers",
      label: "Tell us about customers",
      why: "This lets OpsIQ tell real customer trends apart from having no data yet.",
      ifSkipped: "Customer-related findings will say \"not enough data\" instead of a real read — that's honest, not broken.",
      complete: customers.complete,
      applicable: customers.applicable,
      href: "/owner/customers",
    },
    {
      id: "operations",
      label: "Tell us how work gets done",
      why: "This lets OpsIQ spot process risks like missed steps or key-person dependency.",
      ifSkipped: "Operational findings will be limited until this is added.",
      complete: operations.complete,
      applicable: operations.applicable,
      href: "/owner/operations",
    },
    {
      id: "first_priorities",
      label: "Review your first priorities",
      why: "This is where OpsIQ turns everything above into what to actually do next.",
      ifSkipped: "Nothing — this step is just visiting Priorities once you have a first read.",
      complete: input.hasEngagedAPriority,
      applicable: true,
      href: "/owner/priorities",
    },
  ];
}

/** The first not-yet-complete, applicable step — what the owner should do next. */
export function nextStartHereStep(steps: StartHereStep[]): StartHereStep | null {
  return steps.find((s) => s.applicable && !s.complete) ?? null;
}

/**
 * Setup is "sufficiently mature" once a first financial read is available AND at least one of
 * customers/operations has been added — matching "don't dominate Home forever" without requiring
 * every optional step. Used to decide whether Home's continuation card still shows.
 */
export function isStartHereMature(steps: StartHereStep[]): boolean {
  const money = steps.find((s) => s.id === "money_numbers");
  const customers = steps.find((s) => s.id === "customers");
  const operations = steps.find((s) => s.id === "operations");
  if (!money?.complete) return false;
  return Boolean(customers?.complete || operations?.complete);
}
