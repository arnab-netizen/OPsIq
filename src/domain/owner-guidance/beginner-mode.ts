/**
 * Module 41 — Beginner Owner Explanation Mode (pure).
 *
 * Translates governed guidance for an owner who does NOT know business jargon.
 * Produces a plain-language explanation: why it matters, what happens if ignored,
 * what to do first, what NOT to do, what proof to collect, how to know it worked,
 * and when to call in an accountant/lawyer/professional. Caps confidence when the
 * underlying data is weak so a beginner never mistakes a starting point for a
 * certainty.
 *
 * Pure + deterministic. No Date.now()/Math.random().
 */

import {
  BusinessFunction,
  requiresProfessionalReview,
} from "@/domain/owner-guidance/business-function";

export interface BeginnerExplanationInput {
  headline: string;
  businessFunction: BusinessFunction[];
  whatToDoFirst: string[];
  whatNotToDo: string[];
  proofToCollect: string[];
  howToKnowItWorked: string;
  ifIgnoredConsequence: string;
  dataIsWeak: boolean;
  jargonReplacementsApplied?: boolean;
}

export interface BeginnerExplanation {
  plainReason: string;
  whyItMatters: string;
  whatHappensIfIgnored: string;
  whatToDoFirst: string[];
  whatNotToDo: string[];
  proofToCollect: string[];
  howToKnowItWorked: string;
  professionalReviewWarning: string | null;
  confidenceCapped: boolean;
  confidenceNote: string;
  containsJargon: boolean;
}

/** Business terms a beginner owner is unlikely to understand. */
export const JARGON_TERMS: readonly string[] = [
  "EBITDA",
  "gross margin",
  "contribution margin",
  "unit economics",
  "working capital",
  "accounts receivable",
  "churn",
  "CAC",
  "LTV",
  "runway",
  "liquidity",
  "amortization",
  "accruals",
  "COGS",
];

/** Plain-English replacements for jargon a beginner won't know. */
export const PLAIN_LANGUAGE_MAP: Record<string, string> = {
  "accounts receivable": "money customers still owe you",
  runway: "how long your cash lasts",
  churn: "customers leaving",
  "gross margin": "what's left after direct costs",
  COGS: "direct cost of delivering the work",
  EBITDA: "rough operating profit before tax and interest",
  "contribution margin": "what each sale adds after its direct costs",
  "unit economics": "whether each sale actually makes money",
  "working capital": "the cash you need to run day to day",
  CAC: "what it costs to win one customer",
  LTV: "total money one customer brings over time",
  liquidity: "how easily you can turn things into cash",
  amortization: "spreading a cost out over time",
  accruals: "costs counted before the cash actually moves",
};

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Escape a term so it can be used literally inside a RegExp. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive detection of any JARGON_TERM in the supplied text. */
export function containsJargon(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  return JARGON_TERMS.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
  );
}

/**
 * Replace mapped jargon terms (case-insensitive) with their plain phrasing.
 * Longer terms are replaced first so multi-word terms are not partially matched.
 */
export function toPlainLanguage(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  const terms = Object.keys(PLAIN_LANGUAGE_MAP).sort((a, b) => b.length - a.length);
  let out = text;
  for (const term of terms) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    out = out.replace(re, PLAIN_LANGUAGE_MAP[term]);
  }
  return out;
}

/** Plain-language label for a business function (no jargon). */
const FUNCTION_PLAIN_LABEL: Record<BusinessFunction, string> = {
  [BusinessFunction.STRATEGY]: "the overall direction of the business",
  [BusinessFunction.CASH_FLOW]: "the cash going in and out of the business",
  [BusinessFunction.PROFITABILITY]: "whether the business actually makes money",
  [BusinessFunction.PRICING]: "what you charge for your work",
  [BusinessFunction.UNIT_ECONOMICS]: "whether each sale actually makes money",
  [BusinessFunction.COST_CONTROL]: "keeping your costs under control",
  [BusinessFunction.PAYROLL]: "paying your staff correctly and on time",
  [BusinessFunction.OWNER_WORKLOAD]: "how much you personally have to do",
  [BusinessFunction.EMPLOYEE_WORKLOAD]: "how much work your staff are carrying",
  [BusinessFunction.CAPACITY]: "how much work the business can handle",
  [BusinessFunction.QUALITY]: "the quality of what you deliver",
  [BusinessFunction.CUSTOMER_COMPLAINTS]: "complaints from your customers",
  [BusinessFunction.CUSTOMER_RETENTION]: "keeping the customers you already have",
  [BusinessFunction.CUSTOMER_ACQUISITION]: "winning new customers",
  [BusinessFunction.MARKETING]: "how you get noticed by customers",
  [BusinessFunction.SALES_PIPELINE]: "the deals you have lined up",
  [BusinessFunction.SUPPLIER]: "the suppliers you rely on",
  [BusinessFunction.INVENTORY]: "the stock you hold",
  [BusinessFunction.SOP_PROCESS]: "your day-to-day way of working",
  [BusinessFunction.RISK_COMPLIANCE]: "staying on the right side of the rules",
  [BusinessFunction.BUSINESS_CONTINUITY]: "keeping the business running if something goes wrong",
  [BusinessFunction.GROWTH_READINESS]: "whether the business is ready to grow",
  [BusinessFunction.SCALE_READINESS]: "whether the business is ready to open up or expand",
  [BusinessFunction.DATA_QUALITY]: "how trustworthy your numbers are",
  [BusinessFunction.EVIDENCE_PROOF]: "the proof you keep that work was done",
  [BusinessFunction.OUTCOME_LEARNING]: "learning from what worked and what did not",
  [BusinessFunction.ARCHETYPE_OPERATIONS]: "how this type of business usually runs",
};

function plainFunctionPhrase(functions: readonly BusinessFunction[]): string {
  const labels = functions
    .filter((f) => FUNCTION_PLAIN_LABEL[f] !== undefined)
    .map((f) => FUNCTION_PLAIN_LABEL[f]);
  if (labels.length === 0) return "how the business runs";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

const PROFESSIONAL_REVIEW_WARNING =
  "Check with your accountant/lawyer before acting on tax/legal/compliance points.";

const WEAK_DATA_NOTE =
  "Some information is missing, so treat this as a starting point, not a certainty.";

/**
 * Build a beginner-safe, plain-language explanation from governed guidance.
 *
 * @throws Error when ifIgnoredConsequence is blank — beginner mode must always
 *   state the consequence of ignoring the guidance.
 */
export function buildBeginnerExplanation(
  input: BeginnerExplanationInput
): BeginnerExplanation {
  if (blank(input.ifIgnoredConsequence)) {
    throw new Error(
      "buildBeginnerExplanation: ifIgnoredConsequence is required — beginner mode must always state what happens if ignored."
    );
  }

  const plainReason = toPlainLanguage(input.headline);
  const functionPhrase = plainFunctionPhrase(input.businessFunction);
  const whyItMatters = `This matters because it directly affects ${functionPhrase}, which keeps your business healthy and your income steady.`;
  const whatHappensIfIgnored = toPlainLanguage(input.ifIgnoredConsequence);

  const whatToDoFirst = input.whatToDoFirst.map(toPlainLanguage);
  const whatNotToDo = input.whatNotToDo.map(toPlainLanguage);
  const proofToCollect = input.proofToCollect.map(toPlainLanguage);
  const howToKnowItWorked = toPlainLanguage(input.howToKnowItWorked);

  const professionalReviewWarning = requiresProfessionalReview(input.businessFunction)
    ? PROFESSIONAL_REVIEW_WARNING
    : null;

  const confidenceCapped = input.dataIsWeak === true;
  const confidenceNote = confidenceCapped ? WEAK_DATA_NOTE : "";

  const allOutputText = [
    plainReason,
    whyItMatters,
    whatHappensIfIgnored,
    howToKnowItWorked,
    professionalReviewWarning ?? "",
    confidenceNote,
    ...whatToDoFirst,
    ...whatNotToDo,
    ...proofToCollect,
  ];
  const stillContainsJargon = allOutputText.some(containsJargon);

  return {
    plainReason,
    whyItMatters,
    whatHappensIfIgnored,
    whatToDoFirst,
    whatNotToDo,
    proofToCollect,
    howToKnowItWorked,
    professionalReviewWarning,
    confidenceCapped,
    confidenceNote,
    containsJargon: stillContainsJargon,
  };
}

/** Thrown when a beginner explanation is missing fields the spec requires. */
export class BeginnerExplanationError extends Error {
  readonly code = "BEGINNER_EXPLANATION_UNSAFE";
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Beginner explanation unsafe: ${reasons.join(", ")}.`);
    this.name = "BeginnerExplanationError";
    this.reasons = reasons;
  }
}

/**
 * Guard: a beginner explanation must always tell the owner what to do first, what
 * not to do, and what happens if they ignore it. Throws BeginnerExplanationError
 * listing every missing requirement.
 */
export function assertBeginnerSafe(exp: BeginnerExplanation): void {
  const reasons: string[] = [];
  if (!Array.isArray(exp.whatToDoFirst) || exp.whatToDoFirst.length === 0) {
    reasons.push("missing_what_to_do_first");
  }
  if (!Array.isArray(exp.whatNotToDo) || exp.whatNotToDo.length === 0) {
    reasons.push("missing_what_not_to_do");
  }
  if (blank(exp.whatHappensIfIgnored)) {
    reasons.push("missing_what_happens_if_ignored");
  }
  if (reasons.length > 0) throw new BeginnerExplanationError(reasons);
}
