/**
 * Owner Mode — Bid Application Pack request validation (Zod).
 *
 * Accepts a previously-screened `TenderProcurementCandidate` (or its fields)
 * and returns a structured `BidApplicationPack` for owner review.
 *
 * workspaceId is NEVER in the body — the route overwrites it from
 * ctx.verifiedWorkspaceId. generatedAt comes from the route handler.
 */
import { z } from "zod/v4";

const riskBandSchema = z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const fitBandSchema = z.enum(["STRONG", "MODERATE", "WEAK", "UNKNOWN"]);
const knownStateSchema = z.enum(["KNOWN", "UNKNOWN"]);

const tenderDecisionSchema = z.enum([
  "REJECT_UNFIT",
  "PARK",
  "COLLECT_ELIGIBILITY_DATA",
  "COLLECT_COST_DATA",
  "OWNER_REVIEW_REQUIRED",
  "VALIDATE_CHEAPLY",
  "PREPARE_BID_DRAFT",
  "DO_NOT_BID",
  "NEEDS_CAPABILITY",
]);

const signalSourceTypeSchema = z.enum([
  "GOVERNMENT_TENDER",
  "PUBLIC_PROCUREMENT",
  "CORPORATE_VENDOR_OPPORTUNITY",
  "EXPORT_OR_INSTITUTIONAL_DEMAND",
]);

const approvalLevelSchema = z.enum(["OWNER", "MANAGER", "STAFF"]);

/**
 * The full set of TenderProcurementCandidate fields accepted in the body.
 * workspaceId and evaluatedAt are included — workspaceId will be overwritten
 * from ctx.verifiedWorkspaceId in the route handler.
 */
export const bidApplicationPackRequestSchema = z.strictObject({
  /** Human-readable title for the tender opportunity. */
  opportunityTitle: z.string().min(1),
  /** Summary of the source evidence for the tender signal. */
  sourceEvidenceSummary: z.string(),
  /** References (URLs, documents, notices) backing the signal. */
  sourceRefs: z.array(z.string()),
  /** The procuring entity or buyer organisation. */
  targetBuyer: z.string().min(1),
  /** Signal source type — must be a tender/procurement class. */
  signalSourceType: signalSourceTypeSchema,
  /** Whether eligibility criteria for this tender are known. */
  eligibility: knownStateSchema,
  /** Earnest-money / security-deposit exposure band. */
  emdExposure: riskBandSchema,
  /** Risk of delayed or milestone-gated payments. */
  paymentDelayRisk: riskBandSchema,
  /** Risk of financial penalties for performance shortfalls. */
  performancePenaltyRisk: riskBandSchema,
  /** Working-capital requirement to fulfil the contract. */
  workingCapitalRequirement: riskBandSchema,
  /** Whether compliance and documentation requirements are known. */
  compliance: knownStateSchema,
  /** Burden of preparing the required documentation. */
  documentationBurden: riskBandSchema,
  /** How well the business's current capacity fits the contract scope. */
  capacityFit: fitBandSchema,
  /** Whether the cost/unit economics of fulfilling this tender are known. */
  unitEconomics: knownStateSchema,
  /** Days until the bid deadline; null when unknown. */
  bidDeadlineDays: z.number().int().min(0).nullable(),
  /** Bid/no-bid decision from the tender screen. */
  tenderDecision: tenderDecisionSchema,
  /** Whether the business is currently ready to bid (typically false until all axes are known). */
  readyToBid: z.boolean(),
  /** Always true — owner approval is mandatory before any submission. */
  ownerApprovalRequired: z.literal(true),
  /** Approval authority level. */
  approvalLevel: approvalLevelSchema,
  /** Known missing data fields that prevent full evaluation. */
  missingData: z.array(z.string()),
  /** System capability recommendation from the tender screen, if any. */
  systemCapabilityRecommendation: z.string().nullable(),
  /** Owner-visible explanation from the tender screen. */
  ownerVisibleExplanation: z.string(),
  /** ISO-8601 timestamp when the tender was originally evaluated. */
  evaluatedAt: z.string().min(1),
});

export type BidApplicationPackRequest = z.infer<typeof bidApplicationPackRequestSchema>;
