/**
 * Raw Free-Text Public Signal Interpretation (PASS 28).
 *
 * A CONSERVATIVE, DETERMINISTIC translator from raw public text (reviews, complaints, service/pricing
 * pages, tender notices, RFQs, SaaS reviews/support, franchise/property/housekeeping/B2B text) into the
 * normalized public-signal shape already proven by PASS 27 — which then feeds the ALREADY-PROVEN governed
 * execution bridge (buildProcessExecutionBridge). It is NOT a crawler, NOT live scraping, NOT autonomous
 * browsing. It reads a raw-text fixture and emits a normalized, schema-validatable signal.
 *
 * Authority stance (matches OpsIQ rules): the interpreter is a TRANSLATOR ONLY. It gets NO authority beyond
 * interpretation. It never executes, contacts, submits, approves, spends, or changes contracts. It:
 *   - strips/minimizes personal data before anything is persisted (piiRemoved),
 *   - detects and IGNORES prompt-injection text embedded in public content (never obeys it),
 *   - never accepts a money/profit/ROI/win-probability claim as a verified fact (financialClaimAccepted=false),
 *   - treats public text as an UNVERIFIED signal, not ground truth (only an official source is STRONG, and even
 *     then still needs the owner's own business data before any action),
 *   - downgrades confidence on ambiguous/one-off text (a single complaint is never a systemic finding),
 *   - lists missing internal data explicitly,
 *   - proposes a SAFE governed correction type + owner-approval/evidence requirements + blocked unsafe actions,
 *   - and the governed bridge — not this interpreter — remains the single authority that turns the proposal
 *     into an ExecutionRoute and enforces owner-gating / evidence-gating.
 *
 * Pure + deterministic: no Date.now / Math.random / IO. Same input → same output (safe to cache / re-run / CI).
 */

import { z } from "zod";
import type { CorrectionType, ProcessCorrection } from "./bottleneck-correction-routing";
import type { ExecutionRoute } from "./process-execution-bridge";
import type {
  ProcessStage,
  ProcessSeverity,
  ProcessConfidence,
  ExpectedImpactType,
  ApprovalLevel,
} from "./process-intelligence";

/** Public source families this interpreter accepts. */
export const PUBLIC_SOURCE_TYPES = [
  "public_review",
  "public_complaint",
  "public_service_page",
  "public_tender_notice",
  "public_rfq",
  "public_saas_review",
  "public_saas_support",
  "public_franchise_page",
  "public_property_listing",
  "public_housekeeping",
  "public_b2b_opportunity",
  "unknown",
] as const;
export type PublicSourceType = (typeof PUBLIC_SOURCE_TYPES)[number];

/** The archetype workspaces proven in PASS 27, plus an explicit unknown. */
export const PUBLIC_ARCHETYPES = [
  "laundry_local_service",
  "housekeeping_facility",
  "property_management",
  "franchise_operations",
  "saas",
  "tender_procurement",
  "b2b_service",
  "collective_conflict",
  "unknown",
] as const;
export type PublicArchetype = (typeof PUBLIC_ARCHETYPES)[number];

/** Public data is a signal, not ground truth unless official. */
export const SOURCE_QUALITIES = [
  "VERIFIED_SOURCE",
  "PUBLIC_SOURCE_UNVERIFIED",
  "THIRD_PARTY_UNVERIFIED",
  "LOW_CONFIDENCE",
  "UNKNOWN",
] as const;
export type SourceQuality = (typeof SOURCE_QUALITIES)[number];

export const EVIDENCE_STRENGTHS = ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const RISK_LEVELS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const BUSINESS_ISSUE_TYPES = [
  "QUALITY_FAILURE_LOOP",
  "PROCESS_QUALITY_BREAKDOWN",
  "OPERATIONAL_BOTTLENECK",
  "CASH_MARGIN_RISK",
  "PRODUCT_SUPPORT_ISSUE",
  "OPPORTUNITY_SIGNAL",
  "MULTI_MODULE_CONFLICT",
  "SINGLE_UNVERIFIED_COMPLAINT",
  "POSITIVE_OR_RESOLVED_CLAIM",
  "UNCLEAR_INSUFFICIENT",
] as const;
export type BusinessIssueType = (typeof BUSINESS_ISSUE_TYPES)[number];

export const OPPORTUNITY_TYPES = [
  "VACANCY_FILL",
  "ACTIVATION_IMPROVEMENT",
  "TENDER_BID",
  "B2B_PURSUIT",
  "SCALE_TEMPTATION",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** How the interpreter handled the confidence of the extracted signal. */
export const CONFIDENCE_HANDLINGS = [
  "ACCEPTED_AS_UNVERIFIED_SIGNAL",
  "DOWNGRADED_AMBIGUOUS",
  "VALIDATION_NEEDED_WEAK",
  "OFFICIAL_BUT_NEEDS_BUSINESS_DATA",
  "REJECTED_UNVERIFIED_CLAIM",
] as const;
export type ConfidenceHandling = (typeof CONFIDENCE_HANDLINGS)[number];

/** Input to the interpreter — a controlled raw-text fixture (never live-fetched). */
export interface RawPublicSignalInput {
  rawText: string;
  sourceType: PublicSourceType;
  archetype: PublicArchetype;
  sourceRef?: string | null;
  collectedAt?: string | null;
  officialSource?: boolean;
  /** Optional ceiling the caller declares; the interpreter may only ever DOWNGRADE from it, never upgrade. */
  declaredSourceQuality?: SourceQuality;
}

/** The normalized, schema-validatable signal. Compatible with the PASS 27 governed-execution path. */
export interface NormalizedPublicSignal {
  normalizedSignalId: string;
  workspaceArchetype: PublicArchetype;
  sourceType: PublicSourceType;
  sourceQuality: SourceQuality;
  evidenceStrength: EvidenceStrength;
  signalSummary: string;
  sanitizedTextSummary: string;
  piiRemoved: boolean;
  promptInjectionDetected: boolean;
  promptInjectionIgnored: boolean;
  financialClaimDetected: boolean;
  /** ALWAYS false when a money/ROI/win-probability claim was detected — never accepted as verified fact. */
  financialClaimAccepted: boolean;
  businessIssueType: BusinessIssueType;
  opportunityType: OpportunityType | null;
  customerQualityRisk: RiskLevel;
  cashProfitRisk: RiskLevel;
  operationalRisk: RiskLevel;
  ownerWorkloadRisk: RiskLevel;
  complianceOrContractRisk: RiskLevel;
  staffingOrTrainingRisk: RiskLevel;
  capabilityGapRisk: RiskLevel;
  missingData: string[];
  /** The governed correction type the bridge should build (bridge remains the routing authority). */
  recommendedCorrectionType: CorrectionType;
  /** The ExecutionRoute the governed bridge will produce for that correction (kept consistent for reporting). */
  recommendedExecutionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  evidenceRequired: string[];
  blockedUnsafeActions: string[];
  confidenceHandling: ConfidenceHandling;
  monitorOnlyReason: string | null;
  auditTrace: string[];
}

/** Zod schema — normalized output MUST validate before it may enter the governed execution path. */
export const normalizedPublicSignalSchema = z.object({
  normalizedSignalId: z.string().min(3),
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  sourceType: z.enum(PUBLIC_SOURCE_TYPES),
  sourceQuality: z.enum(SOURCE_QUALITIES),
  evidenceStrength: z.enum(EVIDENCE_STRENGTHS),
  signalSummary: z.string().min(3),
  sanitizedTextSummary: z.string().min(1),
  piiRemoved: z.boolean(),
  promptInjectionDetected: z.boolean(),
  promptInjectionIgnored: z.boolean(),
  financialClaimDetected: z.boolean(),
  financialClaimAccepted: z.literal(false),
  businessIssueType: z.enum(BUSINESS_ISSUE_TYPES),
  opportunityType: z.enum(OPPORTUNITY_TYPES).nullable(),
  customerQualityRisk: z.enum(RISK_LEVELS),
  cashProfitRisk: z.enum(RISK_LEVELS),
  operationalRisk: z.enum(RISK_LEVELS),
  ownerWorkloadRisk: z.enum(RISK_LEVELS),
  complianceOrContractRisk: z.enum(RISK_LEVELS),
  staffingOrTrainingRisk: z.enum(RISK_LEVELS),
  capabilityGapRisk: z.enum(RISK_LEVELS),
  missingData: z.array(z.string()),
  recommendedCorrectionType: z.enum([
    "REQUIRE_FRESH_PROOF",
    "UPDATE_CHECKLIST",
    "REVIEW_PROCESS_STEP",
    "ASSIGN_TRAINING_REVIEW",
    "ESCALATE_TO_MANAGER",
    "ESCALATE_TO_OWNER",
    "RESOLVE_OPERATIONAL_EVENT",
    "COLLECT_MISSING_DATA",
    "NO_ACTION_DATA_INSUFFICIENT",
  ]),
  recommendedExecutionRoute: z.enum([
    "CREATE_CORRECTION_TASK",
    "CREATE_SOP_CHECKLIST_TASK",
    "CREATE_TRAINING_TASK",
    "CREATE_REASSESSMENT_TASK",
    "CREATE_EVIDENCE_REQUEST",
    "CREATE_OWNER_APPROVAL_TASK",
    "CREATE_MANAGER_TASK",
    "CREATE_STAFF_TASK",
    "CREATE_MISSING_DATA_TASK",
    "BLOCK_UNSAFE_ACTION",
    "MONITOR_ONLY",
  ]),
  ownerApprovalRequired: z.boolean(),
  evidenceRequired: z.array(z.string()),
  blockedUnsafeActions: z.array(z.string()),
  confidenceHandling: z.enum(CONFIDENCE_HANDLINGS),
  monitorOnlyReason: z.string().nullable(),
  auditTrace: z.array(z.string()).min(1),
})
  // Cross-field governance invariants — these can never be violated, even by a mapping bug.
  .refine((s) => !s.financialClaimDetected || s.financialClaimAccepted === false, {
    message: "a detected financial claim must never be accepted as fact",
  })
  .refine((s) => !s.promptInjectionDetected || s.promptInjectionIgnored, {
    message: "detected prompt injection must be ignored",
  })
  .refine((s) => s.recommendedExecutionRoute !== "MONITOR_ONLY" || s.monitorOnlyReason !== null, {
    message: "a monitor-only route must carry a reason",
  });

/** The route the governed bridge produces for each correction type (mirrors process-execution-bridge). */
const ROUTE_FOR_CORRECTION: Record<CorrectionType, ExecutionRoute> = {
  REVIEW_PROCESS_STEP: "CREATE_CORRECTION_TASK",
  UPDATE_CHECKLIST: "CREATE_SOP_CHECKLIST_TASK",
  ASSIGN_TRAINING_REVIEW: "CREATE_TRAINING_TASK",
  ESCALATE_TO_MANAGER: "CREATE_MANAGER_TASK",
  ESCALATE_TO_OWNER: "CREATE_OWNER_APPROVAL_TASK",
  RESOLVE_OPERATIONAL_EVENT: "CREATE_REASSESSMENT_TASK",
  REQUIRE_FRESH_PROOF: "CREATE_EVIDENCE_REQUEST",
  COLLECT_MISSING_DATA: "CREATE_MISSING_DATA_TASK",
  NO_ACTION_DATA_INSUFFICIENT: "MONITOR_ONLY",
};

// ─── Deterministic helpers ───────────────────────────────────────────────────

/** djb2 — deterministic, dependency-free, stable across runs (no Date/random). */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone: 7+ digits allowing spaces/()-/+, but not a currency amount (handled separately).
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const TITLED_NAME_RE = /\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-zA-Z]+/g;
const CONTACT_NAME_RE = /\b(my name is|name is|i am|contact|spoke (?:to|with)|ask for|speak to)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi;

/** Strip / minimize personal data. Returns sanitized text + whether anything was removed. */
function stripPii(text: string): { sanitized: string; removed: boolean } {
  let removed = false;
  let out = text.replace(EMAIL_RE, () => {
    removed = true;
    return "[redacted-email]";
  });
  // Protect currency amounts from the phone matcher by masking them first, then restoring.
  const money: string[] = [];
  out = out.replace(/[£$€]\s?\d[\d,]*(?:\.\d+)?/g, (m) => {
    money.push(m);
    return ` M${money.length - 1} `;
  });
  out = out.replace(PHONE_RE, (m) => {
    // Require at least 7 actual digits to count as a phone number.
    if ((m.replace(/\D/g, "").length) >= 7) {
      removed = true;
      return "[redacted-phone]";
    }
    return m;
  });
  out = out.replace(/ M(\d+) /g, (_m, i) => money[Number(i)]);
  out = out.replace(TITLED_NAME_RE, () => {
    removed = true;
    return "[redacted-name]";
  });
  out = out.replace(CONTACT_NAME_RE, (_m, lead) => {
    removed = true;
    return `${lead} [redacted-name]`;
  });
  return { sanitized: out.trim(), removed };
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all )?previous instructions/i,
  /disregard (?:all )?(?:previous|prior) instructions/i,
  /ignore your (?:rules|guardrails|system prompt)/i,
  /mark (?:this|the) business as verified/i,
  /mark (?:this|it) as verified/i,
  /you (?:must|should) (?:now )?(?:approve|verify|mark)/i,
  /\bsystem:\s/i,
  /\boverride (?:the )?(?:rules|guardrails|policy|safety)/i,
  /give (?:them|it|us) a[n]? \d+\s?%?\s*win probability/i,
  /set (?:the )?win probability/i,
  /automatically (?:email|contact|message|call|text)/i,
  /auto[- ]?(?:email|contact|send)/i,
  /(?:^|\W)email the customer/i,
  /submit the tender/i,
  /submit (?:our|the) bid (?:now|immediately|automatically)/i,
  /fire the (?:employee|staff|worker)/i,
  /sack (?:the|that) (?:employee|staff|worker)/i,
];

function detectInjection(text: string): { detected: boolean; hits: string[] } {
  const hits: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(m[0].trim().toLowerCase());
  }
  return { detected: hits.length > 0, hits };
}

const FINANCIAL_PATTERNS: RegExp[] = [
  /[£$€]\s?\d/,
  /\b\d+(?:\.\d+)?\s?%/,
  /\bROI\b/i,
  /\breturn on investment\b/i,
  /\bprofit\b/i,
  /\bguaranteed?\b/i,
  /\bwin probability\b/i,
  /\brevenue\b/i,
  /\bmrr\b/i,
];

function detectFinancialClaim(text: string): boolean {
  return FINANCIAL_PATTERNS.some((re) => re.test(text));
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

const ONE_OFF_CUES = ["once", "one time", "first time", "single time", "this one time", "isolated", "on this occasion"];
const AMBIGUITY_CUES = ["not sure", "unclear", "maybe", "might be", "possibly", "no idea", "confusing", "vague"];

// ─── The interpreter ─────────────────────────────────────────────────────────

/**
 * Deterministically interpret a raw public-text fixture into a normalized, schema-validatable signal.
 * Conservative by construction: ambiguous/one-off/weak text downgrades to validation-needed; injection is
 * ignored; financial claims are never accepted as fact; unsafe external actions are always blocked.
 */
export function interpretRawPublicSignal(input: RawPublicSignalInput): NormalizedPublicSignal {
  const trace: string[] = [];
  const rawText = input.rawText ?? "";
  const archetype = input.archetype;
  const sourceType = input.sourceType;

  // 1) Strip PII BEFORE anything else is derived or persisted.
  const { sanitized, removed: piiRemoved } = stripPii(rawText);
  if (piiRemoved) trace.push("pii:stripped-personal-data-before-persist");

  // 2) Detect + ignore prompt injection (never obeyed).
  const injection = detectInjection(rawText);
  if (injection.detected) trace.push(`injection:detected-and-ignored:${injection.hits.length}`);

  // 3) Detect financial claims — recorded, never accepted as fact.
  const financialClaimDetected = detectFinancialClaim(rawText);
  if (financialClaimDetected) trace.push("financial:claim-detected-not-accepted-as-fact");

  const lower = sanitized.toLowerCase();
  const rawLower = rawText.toLowerCase();

  // 4) Ambiguity / one-off / low-context detection → confidence downgrade.
  const meaningfulLen = sanitized.replace(/\[redacted-[a-z]+\]/g, "").replace(/[^a-z0-9]/gi, "").length;
  const ambiguous = meaningfulLen < 40 || includesAny(lower, AMBIGUITY_CUES);
  const oneOff = includesAny(lower, ONE_OFF_CUES);
  // "no business context": no archetype/business keyword present at all.
  const businessCueWords = [
    "clean", "wash", "stain", "laundry", "room", "housekeep", "miss", "maintenance", "repair", "tenant",
    "vacan", "branch", "franchise", "brand", "bug", "crash", "onboard", "activation", "pricing", "price",
    "discount", "tender", "emd", "eligib", "bid", "rfp", "rfq", "vendor", "capacity", "quality", "late",
    "response", "support", "refund", "service", "contract", "review", "complaint",
    "buyer", "outreach", "expand", "scale", "invest", "spend", "promo",
  ];
  const hasBusinessContext = includesAny(lower, businessCueWords);
  if (ambiguous) trace.push("confidence:ambiguous-or-low-context-downgrade");
  if (oneOff) trace.push("confidence:one-off-not-systemic");

  // 5) Source quality — public text is a signal, not ground truth unless official. Only ever downgrade from
  //    a declared ceiling; an official source may be VERIFIED_SOURCE but still needs the owner's own data.
  let sourceQuality: SourceQuality;
  const official = input.officialSource === true || sourceType === "public_tender_notice";
  if (!hasBusinessContext || ambiguous) sourceQuality = "LOW_CONFIDENCE";
  else if (official) sourceQuality = "VERIFIED_SOURCE";
  else if (sourceType === "public_service_page" || sourceType === "public_franchise_page" || sourceType === "public_property_listing")
    sourceQuality = "PUBLIC_SOURCE_UNVERIFIED";
  else if (sourceType === "unknown") sourceQuality = "UNKNOWN";
  else sourceQuality = "THIRD_PARTY_UNVERIFIED";
  if (input.declaredSourceQuality) {
    const order: SourceQuality[] = ["UNKNOWN", "LOW_CONFIDENCE", "THIRD_PARTY_UNVERIFIED", "PUBLIC_SOURCE_UNVERIFIED", "VERIFIED_SOURCE"];
    // Take the weaker of derived vs declared (never upgrade past the caller's ceiling).
    if (order.indexOf(input.declaredSourceQuality) < order.indexOf(sourceQuality)) sourceQuality = input.declaredSourceQuality;
  }
  trace.push(`source-quality:${sourceQuality}`);

  // 6) Evidence strength.
  let evidenceStrength: EvidenceStrength;
  if (ambiguous || !hasBusinessContext) evidenceStrength = "INSUFFICIENT";
  else if (oneOff) evidenceStrength = "WEAK";
  else if (official) evidenceStrength = "STRONG";
  else if (includesAny(lower, ["repeated", "again", "every time", "keeps", "multiple", "several", "many reviews", "consistently"]))
    evidenceStrength = "MODERATE";
  else evidenceStrength = "WEAK";
  trace.push(`evidence-strength:${evidenceStrength}`);

  // 7) Classify business issue + governed correction type + risks. Archetype-first (non-laundry-biased),
  //    with text cues; ambiguous/one-off text is never promoted to a systemic finding.
  const cls = classify({ archetype, sourceType, lower, rawLower, official, ambiguous, oneOff, hasBusinessContext });
  trace.push(`issue:${cls.businessIssueType}`, `correction:${cls.correctionType}`);

  // 8) Owner-approval + unsafe-action blocks. Material decisions and any unsafe external instruction are gated.
  const blocked = buildBlockedActions({ archetype, sourceType, lower, injection: injection.hits, financialClaimDetected });
  const ownerApprovalRequired = cls.correctionType === "ESCALATE_TO_OWNER" || cls.ownerMaterial;

  // 9) Missing internal data — always explicit; weak/ambiguous adds a validation requirement.
  const missingData = [...cls.missingData];
  if (evidenceStrength === "WEAK" || evidenceStrength === "INSUFFICIENT" || oneOff) {
    missingData.push("whether this is a repeated, verified internal pattern (not a single public post)");
  }

  // 10) Confidence handling.
  let confidenceHandling: ConfidenceHandling;
  if (cls.businessIssueType === "UNCLEAR_INSUFFICIENT") confidenceHandling = "DOWNGRADED_AMBIGUOUS";
  else if (evidenceStrength === "INSUFFICIENT") confidenceHandling = "DOWNGRADED_AMBIGUOUS";
  else if (official && evidenceStrength === "STRONG") confidenceHandling = "OFFICIAL_BUT_NEEDS_BUSINESS_DATA";
  else if (evidenceStrength === "WEAK") confidenceHandling = "VALIDATION_NEEDED_WEAK";
  else confidenceHandling = "ACCEPTED_AS_UNVERIFIED_SIGNAL";
  // A fixture that is ONLY an injected/financial claim with no genuine business signal is rejected as fact.
  if (cls.businessIssueType === "UNCLEAR_INSUFFICIENT" && (injection.detected || financialClaimDetected)) {
    confidenceHandling = "REJECTED_UNVERIFIED_CLAIM";
  }
  trace.push(`confidence-handling:${confidenceHandling}`);

  // Mirror the governed bridge exactly: a correction whose approval is OWNER becomes an owner-approval task,
  // whatever its type default — so recommendedExecutionRoute always equals what the bridge will produce.
  const mappedRoute = ROUTE_FOR_CORRECTION[cls.correctionType];
  const recommendedExecutionRoute: ExecutionRoute =
    cls.correctionType !== "NO_ACTION_DATA_INSUFFICIENT" && ownerApprovalRequired && mappedRoute !== "CREATE_OWNER_APPROVAL_TASK"
      ? "CREATE_OWNER_APPROVAL_TASK"
      : mappedRoute;
  const monitorOnlyReason =
    recommendedExecutionRoute === "MONITOR_ONLY"
      ? `Insufficient/unverified public text: ${missingData.join("; ") || "no safe actionable route yet"}.`
      : null;

  const evidenceRequired = buildEvidenceRequired(cls.correctionType, missingData);

  const signalSummary = cls.signalSummary;
  const sanitizedTextSummary = summarize(sanitized);

  const normalizedSignalId = `sig:${archetype}:${sourceType}:${djb2(`${sanitizedTextSummary}|${sourceType}|${archetype}|${cls.correctionType}`)}`;

  const signal: NormalizedPublicSignal = {
    normalizedSignalId,
    workspaceArchetype: archetype,
    sourceType,
    sourceQuality,
    evidenceStrength,
    signalSummary,
    sanitizedTextSummary,
    piiRemoved,
    promptInjectionDetected: injection.detected,
    promptInjectionIgnored: injection.detected, // detected ⇒ ignored, always
    financialClaimDetected,
    financialClaimAccepted: false,
    businessIssueType: cls.businessIssueType,
    opportunityType: cls.opportunityType,
    customerQualityRisk: cls.risks.customerQualityRisk,
    cashProfitRisk: cls.risks.cashProfitRisk,
    operationalRisk: cls.risks.operationalRisk,
    ownerWorkloadRisk: cls.risks.ownerWorkloadRisk,
    complianceOrContractRisk: cls.risks.complianceOrContractRisk,
    staffingOrTrainingRisk: cls.risks.staffingOrTrainingRisk,
    capabilityGapRisk: cls.risks.capabilityGapRisk,
    missingData,
    recommendedCorrectionType: cls.correctionType,
    recommendedExecutionRoute,
    ownerApprovalRequired,
    evidenceRequired,
    blockedUnsafeActions: blocked,
    confidenceHandling,
    monitorOnlyReason,
    auditTrace: trace,
  };
  return signal;
}

/**
 * Interpret AND validate. Returns the validated signal, or an error result — invalid/ambiguous output can
 * never silently enter the governed path. (The interpreter is written to always satisfy the schema; this
 * gate exists so a future mapping bug fails closed rather than leaking an unsafe signal downstream.)
 */
export function interpretAndValidateRawPublicSignal(
  input: RawPublicSignalInput,
): { ok: true; signal: NormalizedPublicSignal } | { ok: false; issues: string[] } {
  const signal = interpretRawPublicSignal(input);
  const parsed = normalizedPublicSignalSchema.safeParse(signal);
  if (parsed.success) return { ok: true, signal };
  // Zod schema-issue descriptions (static validation text, not runtime error content) — surfaced so a
  // future mapping bug fails closed with a precise reason instead of leaking an unsafe signal downstream.
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { ok: false, issues };
}

// ─── Classification internals ────────────────────────────────────────────────

interface RiskProfile {
  customerQualityRisk: RiskLevel;
  cashProfitRisk: RiskLevel;
  operationalRisk: RiskLevel;
  ownerWorkloadRisk: RiskLevel;
  complianceOrContractRisk: RiskLevel;
  staffingOrTrainingRisk: RiskLevel;
  capabilityGapRisk: RiskLevel;
}

interface Classification {
  businessIssueType: BusinessIssueType;
  opportunityType: OpportunityType | null;
  correctionType: CorrectionType;
  ownerMaterial: boolean;
  missingData: string[];
  signalSummary: string;
  risks: RiskProfile;
}

const R = (over: Partial<RiskProfile>): RiskProfile => ({
  customerQualityRisk: "UNKNOWN",
  cashProfitRisk: "UNKNOWN",
  operationalRisk: "UNKNOWN",
  ownerWorkloadRisk: "UNKNOWN",
  complianceOrContractRisk: "LOW",
  staffingOrTrainingRisk: "LOW",
  capabilityGapRisk: "LOW",
  ...over,
});

function classify(ctx: {
  archetype: PublicArchetype;
  sourceType: PublicSourceType;
  lower: string;
  rawLower: string;
  official: boolean;
  ambiguous: boolean;
  oneOff: boolean;
  hasBusinessContext: boolean;
}): Classification {
  const { archetype, sourceType, lower, ambiguous, oneOff, hasBusinessContext } = ctx;

  // Precedence: a material commitment DECISION (bid/EMD/contract/outreach/scale/big spend) is inherently
  // actionable and must be owner-gated even when it lacks an operational keyword — the safest answer to
  // "should we commit?" is always "the owner decides", never auto. Checked BEFORE the low-context guard.
  if (includesAny(lower, [
    "should we bid", "commit to the bid", "commit to bidding", "pay the emd", "sign the contract",
    "should we expand", "should we scale", "scale up", "scale now", "expand now", "open a new branch",
    "open a new location", "launch outreach", "reach out to the buyer", "commit to outreach",
    "approve the spend", "approve the large spend", "large spend", "big investment", "major investment",
  ])) {
    const opp: OpportunityType | null =
      archetype === "tender_procurement" ? "TENDER_BID"
        : archetype === "b2b_service" ? "B2B_PURSUIT"
        : archetype === "collective_conflict" ? "SCALE_TEMPTATION"
        : null;
    return {
      businessIssueType: archetype === "collective_conflict" ? "MULTI_MODULE_CONFLICT" : "OPPORTUNITY_SIGNAL",
      opportunityType: opp,
      correctionType: "ESCALATE_TO_OWNER",
      ownerMaterial: true,
      missingData: [],
      signalSummary: "A material commitment decision (bid/EMD/contract/outreach/scale/spend) — the owner decides; nothing is auto-committed, submitted, contacted, or spent.",
      risks: R({ cashProfitRisk: "HIGH", complianceOrContractRisk: "HIGH", operationalRisk: "MEDIUM" }),
    };
  }

  // A positive / "resolved" public claim is NOT proof. A good review can never close an issue without
  // executed-correction + outcome evidence. Classified as a claim (monitor-only) so the conflict layer can
  // see it and refuse to let it close a real negative signal. Checked before the low-context guard so short
  // praise ("fixed now") still registers as a resolved-claim rather than being dropped as low-context.
  if (includesAny(lower, [
    "improved", "much better", "no longer", "is fixed", "fixed now", "has been fixed", "bug is fixed",
    "issue is fixed", "issue resolved", "now resolved", "sorted now", "back to normal", "working now",
    "no more problems", "great now", "excellent now", "happy now", "all good now",
  ])) {
    return {
      businessIssueType: "POSITIVE_OR_RESOLVED_CLAIM",
      opportunityType: null,
      correctionType: "NO_ACTION_DATA_INSUFFICIENT",
      ownerMaterial: false,
      missingData: ["executed-correction + post-outcome evidence that the issue is actually resolved"],
      signalSummary: "A positive/resolved public claim — treated as an unverified claim, NOT proof; it cannot close an issue without executed-correction and outcome evidence.",
      risks: R({}),
    };
  }

  // Guard 0: no business context / ambiguous → never a systemic finding; validation-needed / monitor-only.
  if (!hasBusinessContext || ambiguous) {
    return {
      businessIssueType: "UNCLEAR_INSUFFICIENT",
      opportunityType: null,
      correctionType: hasBusinessContext ? "COLLECT_MISSING_DATA" : "NO_ACTION_DATA_INSUFFICIENT",
      ownerMaterial: false,
      missingData: ["clear business context", "which process/step this refers to"],
      signalSummary: "Ambiguous/low-context public text — not enough to act on; validate before any conclusion.",
      risks: R({}),
    };
  }

  // Guard 1: a single, one-off complaint must not become a systemic issue.
  if (oneOff && (sourceType === "public_complaint" || sourceType === "public_review")) {
    return {
      businessIssueType: "SINGLE_UNVERIFIED_COMPLAINT",
      opportunityType: null,
      correctionType: "COLLECT_MISSING_DATA",
      ownerMaterial: false,
      missingData: ["whether the issue recurs", "internal defect/incident rate for this step"],
      signalSummary: "A single public complaint — treated as an unverified one-off, not a systemic failure; gather internal data first.",
      risks: R({ customerQualityRisk: "MEDIUM", operationalRisk: "LOW" }),
    };
  }

  // Discount / price-change INTENT (not the bare word "pricing") → owner-gated margin decision (any archetype).
  if (includesAny(lower, ["discount", "price cut", "cut our price", "cut prices", "cheaper", "undercut", "lower our price", "match their price", "slash price", "reduce our price", "competitor discount", "competitor price"])) {
    return {
      businessIssueType: "CASH_MARGIN_RISK",
      opportunityType: null,
      correctionType: "ESCALATE_TO_OWNER",
      ownerMaterial: true,
      missingData: ["unit margin", "cost per unit/order", "price elasticity"],
      signalSummary: "Pricing/discount pressure from public text — protect margin; no blind discount; owner decides with real unit economics.",
      risks: R({ cashProfitRisk: "HIGH", customerQualityRisk: "LOW" }),
    };
  }

  switch (archetype) {
    case "laundry_local_service":
      return {
        businessIssueType: "QUALITY_FAILURE_LOOP",
        opportunityType: null,
        correctionType: "REVIEW_PROCESS_STEP",
        ownerMaterial: false,
        missingData: ["actual defect/rework rate", "which process step fails"],
        signalSummary: "Repeated quality/rework theme — diagnose the failing step; prove the fix before closing.",
        risks: R({ customerQualityRisk: "HIGH", operationalRisk: "HIGH", staffingOrTrainingRisk: "MEDIUM" }),
      };
    case "housekeeping_facility":
      if (includesAny(lower, ["turnover", "training", "new staff", "untrained", "no-show", "staff"]))
        return {
          businessIssueType: "PROCESS_QUALITY_BREAKDOWN",
          opportunityType: null,
          correctionType: "ASSIGN_TRAINING_REVIEW",
          ownerMaterial: false,
          missingData: ["training completion records", "inspection pass rate"],
          signalSummary: "Missed-area/turnover theme — training/SOP correction with adoption proof (process language, not blame).",
          risks: R({ customerQualityRisk: "HIGH", operationalRisk: "HIGH", staffingOrTrainingRisk: "HIGH" }),
        };
      return {
        businessIssueType: "PROCESS_QUALITY_BREAKDOWN",
        opportunityType: null,
        correctionType: "REVIEW_PROCESS_STEP",
        ownerMaterial: false,
        missingData: ["inspection pass rate", "contract SLA"],
        signalSummary: "Missed-area cleaning theme — inspection/checklist correction with proof before closing.",
        risks: R({ customerQualityRisk: "HIGH", operationalRisk: "HIGH", complianceOrContractRisk: "MEDIUM", staffingOrTrainingRisk: "MEDIUM" }),
      };
    case "property_management":
      return {
        businessIssueType: "OPERATIONAL_BOTTLENECK",
        opportunityType: includesAny(lower, ["vacan", "listing", "available unit", "to let", "for rent"]) ? "VACANCY_FILL" : null,
        correctionType: "RESOLVE_OPERATIONAL_EVENT",
        ownerMaterial: includesAny(lower, ["legal", "evict", "deposit", "reputation", "large spend", "expensive"]),
        missingData: ["actual response times", "vendor SLAs"],
        signalSummary: "Slow-maintenance/response theme — resolve the operational event with vendor follow-up; draft (never auto-send) tenant comms.",
        risks: R({ customerQualityRisk: "HIGH", operationalRisk: "HIGH", ownerWorkloadRisk: "HIGH", complianceOrContractRisk: "MEDIUM" }),
      };
    case "franchise_operations":
      return {
        businessIssueType: "PROCESS_QUALITY_BREAKDOWN",
        opportunityType: null,
        correctionType: "REVIEW_PROCESS_STEP",
        ownerMaterial: includesAny(lower, ["brand", "promo", "unauthorized", "unauthorised", "pricing"]),
        missingData: ["which branch", "per-branch metrics"],
        signalSummary: "Branch-inconsistency theme — branch audit + SOP/training correction; brand/pricing stays owner-gated; no franchisee-penalty automation.",
        risks: R({ customerQualityRisk: "HIGH", operationalRisk: "MEDIUM", complianceOrContractRisk: "MEDIUM", staffingOrTrainingRisk: "HIGH" }),
      };
    case "saas":
      if (includesAny(lower, ["bug", "crash", "error", "broken", "not working", "fails to load"]))
        return {
          businessIssueType: "PRODUCT_SUPPORT_ISSUE",
          opportunityType: includesAny(lower, ["onboard", "activation", "sign up", "signup"]) ? "ACTIVATION_IMPROVEMENT" : null,
          correctionType: "REQUIRE_FRESH_PROOF",
          ownerMaterial: false,
          missingData: ["bug reproduction steps", "real activation/conversion data"],
          signalSummary: "SaaS defect theme — reproduce the bug before claiming fixed; no fabricated MRR/conversion; launch stays frozen.",
          risks: R({ customerQualityRisk: "HIGH", operationalRisk: "MEDIUM", capabilityGapRisk: "HIGH" }),
        };
      return {
        businessIssueType: "PRODUCT_SUPPORT_ISSUE",
        opportunityType: "ACTIVATION_IMPROVEMENT",
        correctionType: "COLLECT_MISSING_DATA",
        ownerMaterial: false,
        missingData: ["real activation/conversion", "MRR"],
        signalSummary: "SaaS onboarding/activation theme — collect real activation data before any product/pricing claim.",
        risks: R({ customerQualityRisk: "MEDIUM", capabilityGapRisk: "HIGH" }),
      };
    case "tender_procurement":
      return {
        businessIssueType: "OPPORTUNITY_SIGNAL",
        opportunityType: "TENDER_BID",
        correctionType: "COLLECT_MISSING_DATA",
        // The DATA-collection step is not itself owner-material; the bid/no-bid + EMD DECISION is a separate
        // owner-gated signal. Auto-submit/EMD/contract stay blocked (see blockedUnsafeActions).
        ownerMaterial: false,
        missingData: ["eligibility documents", "cost/margin fit", "capacity to deliver", "EMD affordability"],
        signalSummary: "Public tender notice — gather eligibility + cost data; owner decides bid/no-bid; nothing auto-submitted, no EMD/contract action.",
        risks: R({ cashProfitRisk: "HIGH", operationalRisk: "MEDIUM", complianceOrContractRisk: "HIGH", capabilityGapRisk: "MEDIUM" }),
      };
    case "b2b_service":
      return {
        businessIssueType: "OPPORTUNITY_SIGNAL",
        opportunityType: "B2B_PURSUIT",
        correctionType: "COLLECT_MISSING_DATA",
        // Fit/capacity DATA collection is not itself owner-material; the OUTREACH decision is a separate
        // owner-gated signal. Auto-outreach stays blocked (see blockedUnsafeActions).
        ownerMaterial: false,
        missingData: ["our capacity", "cost/margin", "reference proof"],
        signalSummary: "Public RFP/RFQ signal — validate fit/capacity/cost; owner approves any outreach; draft only, no auto-send, no win-probability numbers.",
        risks: R({ cashProfitRisk: "MEDIUM", operationalRisk: "MEDIUM", complianceOrContractRisk: "MEDIUM", capabilityGapRisk: "HIGH" }),
      };
    case "collective_conflict":
      // Coherent conservative resolution across a multi-module conflict. The scale DECISION is caught by the
      // owner-commitment path above; a cost/capacity DATA gap is a data task; otherwise fix quality FIRST.
      if (includesAny(lower, ["cost", "margin", "capacity", "don't know", "do not know", "unknown", "no idea what it costs"]))
        return {
          businessIssueType: "MULTI_MODULE_CONFLICT",
          opportunityType: "SCALE_TEMPTATION",
          correctionType: "COLLECT_MISSING_DATA",
          ownerMaterial: false,
          missingData: ["cost/margin", "capacity"],
          signalSummary: "Cost/capacity is unknown while growth is tempting — collect the missing internal data before any scale decision.",
          risks: R({ cashProfitRisk: "HIGH", operationalRisk: "HIGH", ownerWorkloadRisk: "HIGH", capabilityGapRisk: "HIGH" }),
        };
      return {
        businessIssueType: "MULTI_MODULE_CONFLICT",
        opportunityType: "SCALE_TEMPTATION",
        correctionType: "REVIEW_PROCESS_STEP",
        ownerMaterial: false,
        missingData: ["verified quality baseline"],
        signalSummary: "Growth temptation while quality is unresolved — fix quality FIRST; do not scale before validation; the scale decision stays owner-gated.",
        risks: R({ customerQualityRisk: "HIGH", cashProfitRisk: "HIGH", operationalRisk: "HIGH", ownerWorkloadRisk: "HIGH", staffingOrTrainingRisk: "HIGH", capabilityGapRisk: "HIGH" }),
      };
    case "unknown":
    default:
      return {
        businessIssueType: "UNCLEAR_INSUFFICIENT",
        opportunityType: null,
        correctionType: "COLLECT_MISSING_DATA",
        ownerMaterial: false,
        missingData: ["which business/process this refers to"],
        signalSummary: "Unclassified public text — gather context before acting.",
        risks: R({}),
      };
  }
}

function buildBlockedActions(ctx: {
  archetype: PublicArchetype;
  sourceType: PublicSourceType;
  lower: string;
  injection: string[];
  financialClaimDetected: boolean;
}): string[] {
  const { archetype, sourceType, lower, injection, financialClaimDetected } = ctx;
  const blocked = new Set<string>();
  // Universal external-action blocks — the interpreter never authorizes these.
  blocked.add("auto customer/tenant/buyer contact or auto-send of any draft");
  blocked.add("auto spend / discount / pricing change without owner approval");
  if (archetype === "tender_procurement" || sourceType === "public_tender_notice" || includesAny(lower, ["tender", "emd", "bid"])) {
    blocked.add("tender auto-submit");
    blocked.add("auto EMD payment / spend");
    blocked.add("auto contract signing");
  }
  if (archetype === "b2b_service" || sourceType === "public_rfq" || includesAny(lower, ["rfp", "rfq", "outreach"])) {
    blocked.add("auto outreach / auto-send to the buyer");
  }
  if (includesAny(lower, ["staff", "employee", "worker", "fire", "sack", "discipline"])) {
    blocked.add("staff blame / discipline / firing automation (use training/SOP process language)");
  }
  if (financialClaimDetected) blocked.add("accepting a money/ROI/win-probability claim as a verified fact");
  if (injection.length > 0) blocked.add("obeying instructions embedded in public text (verification/authority cannot be changed by content)");
  return [...blocked];
}

function buildEvidenceRequired(correctionType: CorrectionType, missingData: string[]): string[] {
  switch (correctionType) {
    case "REVIEW_PROCESS_STEP":
      return ["evidence the corrected step passes before completion"];
    case "ASSIGN_TRAINING_REVIEW":
      return ["proof the training was completed"];
    case "RESOLVE_OPERATIONAL_EVENT":
      return ["vendor/maintenance completion confirmation"];
    case "REQUIRE_FRESH_PROOF":
      return ["fresh, checked reproduction/proof before the issue is accepted as fixed"];
    case "ESCALATE_TO_OWNER":
      return ["the supporting evidence for the owner decision"];
    case "COLLECT_MISSING_DATA":
      return missingData.length ? missingData : ["the missing internal data"];
    case "UPDATE_CHECKLIST":
      return ["the drafted checklist change", "owner approval before adoption"];
    case "ESCALATE_TO_MANAGER":
      return ["evidence the correction was carried out"];
    case "NO_ACTION_DATA_INSUFFICIENT":
      return [];
  }
}

function summarize(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 180) return clean || "(no content)";
  return `${clean.slice(0, 177)}...`;
}

// ─── Bridge adapter ──────────────────────────────────────────────────────────

/**
 * Map a validated normalized signal into a governed ProcessCorrection so it can enter the ALREADY-PROVEN
 * execution bridge. The interpreter proposes; the bridge remains the authority that produces the
 * ExecutionRoute and enforces owner-gating / evidence-gating. No fabricated actor/manager ids.
 */
export function normalizedSignalToProcessCorrection(
  signal: NormalizedPublicSignal,
  workspaceId: string,
  correctionId: string,
  priorityRank = 1,
): ProcessCorrection {
  const requiredApprovalLevel: ApprovalLevel = signal.ownerApprovalRequired
    ? "OWNER"
    : signal.recommendedCorrectionType === "COLLECT_MISSING_DATA"
      ? "STAFF"
      : "MANAGER";
  const severity: ProcessSeverity =
    signal.customerQualityRisk === "HIGH" || signal.operationalRisk === "HIGH" || signal.cashProfitRisk === "HIGH"
      ? "HIGH"
      : signal.businessIssueType === "UNCLEAR_INSUFFICIENT" || signal.businessIssueType === "SINGLE_UNVERIFIED_COMPLAINT"
        ? "LOW"
        : "MEDIUM";
  const confidence: ProcessConfidence =
    signal.evidenceStrength === "STRONG" ? "HIGH" : signal.evidenceStrength === "MODERATE" ? "MEDIUM" : "LOW";
  const affectedStage: ProcessStage =
    signal.businessIssueType === "OPPORTUNITY_SIGNAL" ? "INTAKE" : "DELIVERY";
  const expectedImpactType: ExpectedImpactType =
    signal.cashProfitRisk === "HIGH" ? "CASH_DELAY" : "QUALITY_RISK";

  return {
    workspaceId,
    correctionId,
    sourceFindingType: "REWORK_LOOP",
    correctionType: signal.recommendedCorrectionType,
    title: signal.signalSummary.slice(0, 80),
    instruction: signal.signalSummary,
    rationale: `Interpreted from ${signal.sourceType} (${signal.sourceQuality}/${signal.evidenceStrength}) — unverified public signal; validate before acting.`,
    affectedStage,
    targetActorId: null,
    targetManagerId: null,
    severity,
    confidence,
    priorityRank,
    requiredApprovalLevel,
    requiresOwnerApproval: signal.ownerApprovalRequired,
    autoExecutable: false,
    expectedImpactType,
    supportingProofIds: [],
    supportingOperationalEventIds: [],
    supportingEscalationIds: [],
    supportingAdjudicationIds: [],
    missingData: signal.recommendedCorrectionType === "COLLECT_MISSING_DATA" ? signal.missingData : [],
    status: "PROPOSED",
  };
}
