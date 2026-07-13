/**
 * Owner Mode — Tender / Application Assistance request validation (Zod).
 * Covers per-signal tender screening: bid decision, readiness check,
 * cash-exposure gate, and eligibility/compliance gap detection.
 *
 * Only the four tender-class signal sources are accepted.
 * workspaceId and evaluatedAt come from the request body so the caller
 * can pass an explicit evaluation timestamp; workspaceId is NEVER in the
 * body — the route overwrites it from ctx.verifiedWorkspaceId.
 */
import { z } from "zod/v4";

const riskBandSchema = z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const fitBandSchema = z.enum(["STRONG", "MODERATE", "WEAK", "UNKNOWN"]);
const knownStateSchema = z.enum(["KNOWN", "UNKNOWN"]);

const tenderSignalFieldsSchema = z.strictObject({
  /** Whether eligibility criteria are known ("KNOWN") or not yet collected. */
  eligibility: knownStateSchema,
  /** Whether the business is actually eligible — only meaningful when eligibility is KNOWN. */
  eligible: z.boolean().nullable(),
  /** Earnest-money / security-deposit exposure band. */
  emdExposure: riskBandSchema,
  /** Risk of delayed or milestone-gated payments. */
  paymentDelayRisk: riskBandSchema,
  /** Risk of financial penalties for performance shortfalls. */
  performancePenaltyRisk: riskBandSchema,
  /** Working-capital requirement to execute the contract. */
  workingCapitalRequirement: riskBandSchema,
  /** Whether compliance and documentation requirements are known. */
  compliance: knownStateSchema,
  /** Burden of preparing and submitting the required documentation. */
  documentationBurden: riskBandSchema,
  /** How well the business capacity fits the contract scope. */
  capacityFit: fitBandSchema,
  /** Whether the cost / unit economics of fulfilling the tender are known. */
  unitEconomics: knownStateSchema,
  /** Days until the bid deadline; null when unknown. */
  bidDeadlineDays: z.number().int().min(0).nullable(),
});

const contextSchema = z.strictObject({
  /** An active cash/profit risk that should block risky cash-exposure commitments. */
  cashProfitRiskActive: z.boolean(),
  /** OpsIQ lacks a capability required to safely screen or execute this class of tender. */
  capabilityGapPresent: z.boolean(),
});

export const tenderScreenRequestSchema = z.strictObject({
  /**
   * Signal source type — must be one of the four tender/procurement classes.
   * Rejected if a non-tender source type is supplied.
   */
  signalSourceType: z.enum([
    "GOVERNMENT_TENDER",
    "PUBLIC_PROCUREMENT",
    "CORPORATE_VENDOR_OPPORTUNITY",
    "EXPORT_OR_INSTITUTIONAL_DEMAND",
  ]),
  /** Human-readable title describing the tender opportunity. */
  opportunityTitle: z.string().min(1),
  /** Summary of the source evidence for this tender signal. */
  sourceEvidenceSummary: z.string(),
  /** References (URLs, documents, notices) backing the signal. */
  sourceRefs: z.array(z.string()),
  /** The procuring entity or buyer organisation. */
  targetBuyer: z.string(),
  /** How relevant this tender is to the business's current operations. */
  relevanceToBusiness: fitBandSchema,
  /** Known missing data fields that prevent full evaluation. Defaults to [] when omitted. */
  missingData: z.array(z.string()).optional(),
  /** Tender-specific fields — omit when not yet collected (signals will be UNKNOWN). */
  tender: tenderSignalFieldsSchema.optional(),
  /** Business-context signals required by the screening gate. */
  context: contextSchema,
  /** ISO-8601 timestamp for the evaluation window. */
  evaluatedAt: z.string().min(1),
});

export type TenderScreenRequest = z.infer<typeof tenderScreenRequestSchema>;
