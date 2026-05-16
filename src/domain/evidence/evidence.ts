/**
 * Evidence Domain Foundation
 *
 * Models different types of evidence that inform business assessments.
 * Provides classification, quality scoring, and contradiction detection.
 *
 * Evidence categories:
 * - Financial: revenue, expenses, cash, runway, margins
 * - Customer: retention, churn, NPS, satisfaction, acquisition cost
 * - Operational: team capability, process maturity, key person dependency
 * - Owner Assessment: owner's stated business condition perception
 */

import { z } from "zod";

/**
 * Evidence type classification
 */
export enum EvidenceType {
  FINANCIAL_REVENUE = "financial_revenue",
  FINANCIAL_EXPENSES = "financial_expenses",
  FINANCIAL_CASH = "financial_cash",
  FINANCIAL_RUNWAY = "financial_runway",
  CUSTOMER_RETENTION = "customer_retention",
  CUSTOMER_CHURN = "customer_churn",
  CUSTOMER_NPS = "customer_nps",
  CUSTOMER_SATISFACTION = "customer_satisfaction",
  CUSTOMER_ACQUISITION_COST = "customer_acquisition_cost",
  OPERATIONAL_TEAM_CAPABILITY = "operational_team_capability",
  OPERATIONAL_PROCESS_MATURITY = "operational_process_maturity",
  OPERATIONAL_KEY_PERSON = "operational_key_person",
  OWNER_ASSESSMENT = "owner_assessment",
}

/**
 * Evidence source/origin
 */
export enum EvidenceSource {
  FINANCIAL_RECORDS = "financial_records",
  ACCOUNTING_SOFTWARE = "accounting_software",
  BANK_STATEMENT = "bank_statement",
  CUSTOMER_SURVEY = "customer_survey",
  ANALYTICS_PLATFORM = "analytics_platform",
  CRM_SYSTEM = "crm_system",
  OWNER_INTERVIEW = "owner_interview",
  TEAM_FEEDBACK = "team_feedback",
  MARKET_RESEARCH = "market_research",
  OPERATIONAL_AUDIT = "operational_audit",
}

/**
 * Evidence freshness assessment
 */
export enum EvidenceFreshness {
  STALE = "stale", // >3 months old
  RECENT = "recent", // 1-3 months old
  CURRENT = "current", // <1 month old
}

/**
 * Evidence confidence level
 */
export enum EvidenceConfidence {
  LOW = "low", // 0-33%
  MEDIUM = "medium", // 34-66%
  HIGH = "high", // 67-100%
}

/**
 * Individual evidence record
 */
export const EvidenceRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  engagementId: z.string().uuid(),
  type: z.nativeEnum(EvidenceType),
  source: z.nativeEnum(EvidenceSource),
  description: z.string().min(1).max(1000),
  value: z.number(),
  unit: z.string().optional(),
  observedAt: z.date(),
  submittedAt: z.date(),
  submittedByUserId: z.string().uuid(),
  freshness: z.nativeEnum(EvidenceFreshness),
  confidence: z.nativeEnum(EvidenceConfidence),
  quality: z.number().min(0).max(100).describe("Quality score 0-100"),
  contradictionsWith: z.array(z.string().uuid()).describe("IDs of contradicting evidence records"),
  verificationStatus: z.enum(["unverified", "verified", "disputed"]),
});

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

/**
 * Evidence category for organizational purposes
 */
export const EvidenceCategorySchema = z.object({
  category: z.enum(["financial", "customer", "operational", "owner_assessment"]),
  recordCount: z.number().int().min(0),
  averageQuality: z.number().min(0).max(100),
  freshestDate: z.date(),
  stalewarnCount: z.number().int().min(0),
  contradictionCount: z.number().int().min(0),
  reliabilityScore: z.number().min(0).max(100),
});

export type EvidenceCategory = z.infer<typeof EvidenceCategorySchema>;

/**
 * Evidence sufficiency summary for engagement
 */
export const EvidenceSufficiencySummarySchema = z.object({
  engagementId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  assessedAt: z.date(),
  totalEvidenceCount: z.number().int().min(0),
  financialEvidenceCount: z.number().int().min(0),
  customerEvidenceCount: z.number().int().min(0),
  operationalEvidenceCount: z.number().int().min(0),
  ownerAssessmentCount: z.number().int().min(0),
  categories: z.array(EvidenceCategorySchema),
  averageQuality: z.number().min(0).max(100),
  averageConfidence: z.number().min(0).max(100),
  currentDataPresent: z.boolean().describe("Has data from last 30 days"),
  diverseSourcesPresent: z.boolean().describe("Data from 3+ different sources"),
  allRequiredCategoriesPresent: z.boolean().describe("Has financial, customer, operational, and owner"),
  contradictionCount: z.number().int().min(0),
  stalewarnCount: z.number().int().min(0),
  reliabilityScore: z.number().min(0).max(100),
  isSufficientForRecommendation: z.boolean(),
});

export type EvidenceSufficiencySummary = z.infer<typeof EvidenceSufficiencySummarySchema>;

/**
 * Finding - conclusion drawn from evidence
 */
export const FindingSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  engagementId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  supportingEvidenceIds: z.array(z.string().uuid()),
  contradictingEvidenceIds: z.array(z.string().uuid()).default([]),
  confidenceScore: z.number().min(0).max(100),
  discoveredAt: z.date(),
  discoveredByUserId: z.string().uuid(),
  status: z.enum(["active", "resolved", "invalidated", "parked"]),
});

export type Finding = z.infer<typeof FindingSchema>;

/**
 * Validate evidence quality is acceptable
 */
export function validateEvidenceQuality(
  record: EvidenceRecord
): { valid: boolean; reason?: string } {
  // Quality score must be >40 or have high confidence
  if (record.quality < 40 && record.confidence !== EvidenceConfidence.HIGH) {
    return {
      valid: false,
      reason: "Low quality evidence must have high confidence to be usable",
    };
  }

  // Stale evidence requires higher confidence
  if (
    record.freshness === EvidenceFreshness.STALE &&
    record.confidence !== EvidenceConfidence.HIGH
  ) {
    return {
      valid: false,
      reason: "Stale evidence requires high confidence rating",
    };
  }

  return { valid: true };
}

/**
 * Classify evidence contradictions
 */
export function detectContradictions(
  records: EvidenceRecord[]
): Map<string, string[]> {
  const contradictions = new Map<string, string[]>();

  // Simple contradiction detection: same type, conflicting values
  const recordsByType = new Map<EvidenceType, EvidenceRecord[]>();

  records.forEach((r) => {
    if (!recordsByType.has(r.type)) {
      recordsByType.set(r.type, []);
    }
    recordsByType.get(r.type)!.push(r);
  });

  recordsByType.forEach((typeRecords, type) => {
    if (typeRecords.length < 2) return;

    // For same evidence type, large value differences indicate contradiction
    const values = typeRecords.map((r) => r.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const variance = maxValue - minValue;
    const avgValue = values.reduce((a, b) => a + b) / values.length;

    // If variance > 20% of average, mark as contradictory
    if (avgValue > 0 && variance / avgValue > 0.2) {
      typeRecords.forEach((record) => {
        if (!contradictions.has(record.id)) {
          contradictions.set(record.id, []);
        }
        typeRecords.forEach((other) => {
          if (other.id !== record.id && !contradictions.get(record.id)!.includes(other.id)) {
            contradictions.get(record.id)!.push(other.id);
          }
        });
      });
    }
  });

  return contradictions;
}

/**
 * Calculate overall evidence reliability score
 */
export function calculateEvidenceReliability(
  records: EvidenceRecord[]
): number {
  if (records.length === 0) return 0;

  let totalScore = 0;

  records.forEach((record) => {
    let score = record.quality;

    // Freshness multiplier
    if (record.freshness === EvidenceFreshness.CURRENT) {
      score *= 1.0;
    } else if (record.freshness === EvidenceFreshness.RECENT) {
      score *= 0.8;
    } else {
      score *= 0.5;
    }

    // Confidence multiplier
    if (record.confidence === EvidenceConfidence.HIGH) {
      score *= 1.0;
    } else if (record.confidence === EvidenceConfidence.MEDIUM) {
      score *= 0.75;
    } else {
      score *= 0.5;
    }

    // Contradiction penalty
    const contradictionCount = record.contradictionsWith.length;
    if (contradictionCount > 0) {
      score *= Math.max(0.1, 1 - contradictionCount * 0.1);
    }

    totalScore += score;
  });

  const averageScore = totalScore / records.length;
  return Math.round(Math.max(0, Math.min(100, averageScore)));
}

/**
 * Assess evidence sufficiency for recommendations
 */
export function assessEvidenceSufficiency(
  records: EvidenceRecord[]
): EvidenceSufficiencySummary {
  const financialCount = records.filter((r) => r.type.startsWith("financial_")).length;
  const customerCount = records.filter((r) => r.type.startsWith("customer_")).length;
  const operationalCount = records.filter((r) => r.type.startsWith("operational_")).length;
  const ownerCount = records.filter((r) => r.type === EvidenceType.OWNER_ASSESSMENT).length;

  const contradictions = detectContradictions(records);
  const reliabilityScore = calculateEvidenceReliability(records);

  // Current data = any record from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const currentDataPresent = records.some((r) => r.submittedAt > thirtyDaysAgo);

  // Diverse sources = 3+ different sources
  const sources = new Set(records.map((r) => r.source));
  const diverseSourcesPresent = sources.size >= 3;

  // All required categories present
  const allRequiredCategoriesPresent =
    financialCount > 0 &&
    customerCount > 0 &&
    operationalCount > 0 &&
    ownerCount > 0;

  // Sufficient for recommendation: reliability >60%, current data, diverse sources, all categories
  const isSufficientForRecommendation =
    reliabilityScore >= 60 &&
    currentDataPresent &&
    diverseSourcesPresent &&
    allRequiredCategoriesPresent;

  const categories: EvidenceCategory[] = [];

  if (financialCount > 0) {
    const financialRecords = records.filter((r) => r.type.startsWith("financial_"));
    categories.push({
      category: "financial",
      recordCount: financialCount,
      averageQuality: Math.round(
        financialRecords.reduce((sum, r) => sum + r.quality, 0) / financialCount
      ),
      freshestDate: new Date(Math.max(...financialRecords.map((r) => r.submittedAt.getTime()))),
      stalewarnCount: financialRecords.filter((r) => r.freshness === EvidenceFreshness.STALE)
        .length,
      contradictionCount: financialRecords.filter((r) => r.contradictionsWith.length > 0).length,
      reliabilityScore: calculateEvidenceReliability(financialRecords),
    });
  }

  if (customerCount > 0) {
    const customerRecords = records.filter((r) => r.type.startsWith("customer_"));
    categories.push({
      category: "customer",
      recordCount: customerCount,
      averageQuality: Math.round(
        customerRecords.reduce((sum, r) => sum + r.quality, 0) / customerCount
      ),
      freshestDate: new Date(Math.max(...customerRecords.map((r) => r.submittedAt.getTime()))),
      stalewarnCount: customerRecords.filter((r) => r.freshness === EvidenceFreshness.STALE)
        .length,
      contradictionCount: customerRecords.filter((r) => r.contradictionsWith.length > 0).length,
      reliabilityScore: calculateEvidenceReliability(customerRecords),
    });
  }

  if (operationalCount > 0) {
    const operationalRecords = records.filter((r) => r.type.startsWith("operational_"));
    categories.push({
      category: "operational",
      recordCount: operationalCount,
      averageQuality: Math.round(
        operationalRecords.reduce((sum, r) => sum + r.quality, 0) / operationalCount
      ),
      freshestDate: new Date(
        Math.max(...operationalRecords.map((r) => r.submittedAt.getTime()))
      ),
      stalewarnCount: operationalRecords.filter((r) => r.freshness === EvidenceFreshness.STALE)
        .length,
      contradictionCount: operationalRecords.filter((r) => r.contradictionsWith.length > 0)
        .length,
      reliabilityScore: calculateEvidenceReliability(operationalRecords),
    });
  }

  if (ownerCount > 0) {
    const ownerRecords = records.filter((r) => r.type === EvidenceType.OWNER_ASSESSMENT);
    categories.push({
      category: "owner_assessment",
      recordCount: ownerCount,
      averageQuality: Math.round(
        ownerRecords.reduce((sum, r) => sum + r.quality, 0) / ownerCount
      ),
      freshestDate: new Date(Math.max(...ownerRecords.map((r) => r.submittedAt.getTime()))),
      stalewarnCount: ownerRecords.filter((r) => r.freshness === EvidenceFreshness.STALE).length,
      contradictionCount: ownerRecords.filter((r) => r.contradictionsWith.length > 0).length,
      reliabilityScore: calculateEvidenceReliability(ownerRecords),
    });
  }

  return {
    engagementId: records[0]?.engagementId || "",
    workspaceId: records[0]?.workspaceId || "",
    assessedAt: new Date(),
    totalEvidenceCount: records.length,
    financialEvidenceCount: financialCount,
    customerEvidenceCount: customerCount,
    operationalEvidenceCount: operationalCount,
    ownerAssessmentCount: ownerCount,
    categories,
    averageQuality: Math.round(
      records.reduce((sum, r) => sum + r.quality, 0) / Math.max(1, records.length)
    ),
    averageConfidence: Math.round(
      records
        .map((r) => {
          if (r.confidence === EvidenceConfidence.HIGH) return 100;
          if (r.confidence === EvidenceConfidence.MEDIUM) return 67;
          return 33;
        })
        .reduce((sum, c) => sum + c, 0) / Math.max(1, records.length)
    ),
    currentDataPresent,
    diverseSourcesPresent,
    allRequiredCategoriesPresent,
    contradictionCount: Array.from(contradictions.values()).reduce((sum, ids) => sum + ids.length, 0) / 2,
    stalewarnCount: records.filter((r) => r.freshness === EvidenceFreshness.STALE).length,
    reliabilityScore,
    isSufficientForRecommendation,
  };
}
