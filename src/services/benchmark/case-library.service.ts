/**
 * B15-S1: Case Study Benchmark Library Service
 *
 * Provides operations for:
 * - Loading and filtering case studies
 * - Blind test mode support
 * - Licensing compliance validation
 * - Benchmark result recording
 * - Case applicability matching
 */

import type { PrismaClient, CaseStudy as PrismaCaseStudy, CaseBenchmarkResult as PrismaCaseBenchmarkResult } from "@/generated/prisma/client";
import {
  validateCaseStudyCompliance,
  isCaseStudyApplicable,
  getBlindTestVersion,
  type CaseStudy,
  type CaseBenchmarkResult,
} from "@/domain/benchmark/case-study";

/**
 * Get a single case study by ID.
 * Can return blind test version or full version.
 */
export async function getCaseStudy(
  prisma: PrismaClient,
  caseId: string,
  blindTest: boolean = false
): Promise<CaseStudy | null> {
  const caseRecord = await prisma.caseStudy.findUnique({
    where: { id: caseId },
  });

  if (!caseRecord) {
    return null;
  }

  const caseStudy = parseCaseStudyRecord(caseRecord);

  if (blindTest) {
    return getBlindTestVersion(caseStudy) as CaseStudy;
  }

  return caseStudy;
}

/**
 * Find case studies matching criteria.
 * Used to find relevant benchmarks for comparison.
 */
export async function findCaseStudies(
  prisma: PrismaClient,
  filters: {
    industry?: string;
    businessModel?: string;
    businessSize?: string;
    minConfidence?: number;
    expertValidatedOnly?: boolean;
    limit?: number;
  }
): Promise<CaseStudy[]> {
  const cases = await prisma.caseStudy.findMany({
    where: {
      ...(filters.industry && { industry: filters.industry }),
      ...(filters.businessModel && { businessModel: filters.businessModel }),
      ...(filters.businessSize && { businessSize: filters.businessSize }),
      ...(filters.minConfidence && {
        confidence: {
          gte: filters.minConfidence,
        },
      }),
      ...(filters.expertValidatedOnly && { expertValidated: true }),
    },
    orderBy: { confidence: "desc" },
    take: filters.limit || 50,
  });

  return cases.map(parseCaseStudyRecord);
}

/**
 * Get cases applicable to a specific diagnosis scenario.
 * Returns cases with matching symptoms and business context.
 */
export async function getApplicableCases(
  prisma: PrismaClient,
  scenario: {
    industry?: string;
    businessModel?: string;
    businessSize?: string;
    symptomCategory?: string;
  },
  limit: number = 10
): Promise<CaseStudy[]> {
  const allCases = await findCaseStudies(prisma, {
    ...scenario,
    limit: 100, // Get more to filter
  });

  return allCases
    .filter((c) =>
      isCaseStudyApplicable(c, {
        industry: scenario.industry,
        businessModel: scenario.businessModel,
        businessSize: scenario.businessSize,
        symptomCategory: scenario.symptomCategory,
      })
    )
    .slice(0, limit);
}

/**
 * Record a benchmark result (diagnosis engine performance on a case).
 */
export async function recordBenchmarkResult(
  prisma: PrismaClient,
  caseId: string,
  result: {
    diagnosisId: string;
    identifiedCauses: unknown;
    confidenceScores: unknown;
    accuracyScore: number;
    precisionScore: number;
    recallScore: number;
    performanceNotes?: string;
    falsePositives?: unknown;
    falseNegatives?: unknown;
  }
): Promise<CaseBenchmarkResult> {
  const benchmarkRecord = await prisma.caseBenchmarkResult.create({
    data: {
      id: `bench_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      caseId,
      diagnosisId: result.diagnosisId,
      identifiedCauses: result.identifiedCauses as never,
      confidenceScores: result.confidenceScores as never,
      accuracyScore: result.accuracyScore,
      precisionScore: result.precisionScore,
      recallScore: result.recallScore,
      performanceNotes: result.performanceNotes,
      falsePositives: result.falsePositives as never,
      falseNegatives: result.falseNegatives as never,
    },
  });

  return parseBenchmarkRecord(benchmarkRecord);
}

/**
 * Get benchmark results for a case study.
 * Shows how the diagnosis engine has performed on this case.
 */
export async function getCaseBenchmarks(
  prisma: PrismaClient,
  caseId: string,
  limit: number = 50
): Promise<CaseBenchmarkResult[]> {
  const results = await prisma.caseBenchmarkResult.findMany({
    where: { caseId },
    orderBy: { testedAt: "desc" },
    take: limit,
  });

  return results.map(parseBenchmarkRecord);
}

/**
 * Get average benchmark scores across all cases.
 * Shows overall diagnosis engine performance.
 */
export async function getAverageBenchmarkScores(
  prisma: PrismaClient
): Promise<{
  averageAccuracy: number;
  averagePrecision: number;
  averageRecall: number;
  totalBenchmarks: number;
  casesCovered: number;
}> {
  const results = await prisma.caseBenchmarkResult.findMany();

  if (results.length === 0) {
    return {
      averageAccuracy: 0,
      averagePrecision: 0,
      averageRecall: 0,
      totalBenchmarks: 0,
      casesCovered: 0,
    };
  }

  const averageAccuracy =
    results.reduce((sum, r) => sum + Number(r.accuracyScore), 0) / results.length;
  const averagePrecision =
    results.reduce((sum, r) => sum + Number(r.precisionScore), 0) / results.length;
  const averageRecall =
    results.reduce((sum, r) => sum + Number(r.recallScore), 0) / results.length;

  const casesSet = new Set(results.map((r) => r.caseId));

  return {
    averageAccuracy,
    averagePrecision,
    averageRecall,
    totalBenchmarks: results.length,
    casesCovered: casesSet.size,
  };
}

/**
 * Validate case study compliance before adding to library.
 */
export function validateCase(caseStudy: CaseStudy) {
  return validateCaseStudyCompliance(caseStudy);
}

/**
 * Get statistics about the case library.
 */
export async function getCaseLibraryStats(
  prisma: PrismaClient
): Promise<{
  totalCases: number;
  casesByIndustry: Record<string, number>;
  casesBySize: Record<string, number>;
  averageConfidence: number;
  expertValidatedCount: number;
}> {
  const cases = await prisma.caseStudy.findMany({
    select: {
      industry: true,
      businessSize: true,
      confidence: true,
      expertValidated: true,
    },
  });

  const casesByIndustry: Record<string, number> = {};
  const casesBySize: Record<string, number> = {};
  let totalConfidence = 0;
  let expertValidatedCount = 0;

  cases.forEach((c) => {
    casesByIndustry[c.industry] = (casesByIndustry[c.industry] || 0) + 1;
    casesBySize[c.businessSize] = (casesBySize[c.businessSize] || 0) + 1;
    totalConfidence += Number(c.confidence);
    if (c.expertValidated) {
      expertValidatedCount += 1;
    }
  });

  return {
    totalCases: cases.length,
    casesByIndustry,
    casesBySize,
    averageConfidence: cases.length > 0 ? totalConfidence / cases.length : 0,
    expertValidatedCount,
  };
}

/**
 * Helper: Parse database record to domain model.
 */
function parseCaseStudyRecord(record: PrismaCaseStudy): CaseStudy {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    industry: record.industry,
    businessModel: record.businessModel,
    businessSize: record.businessSize as "startup" | "small" | "medium" | "large" | "enterprise",
    year: record.year,
    yearRange: {
      startYear: record.yearStart,
      endYear: record.yearEnd,
    },
    symptoms: (Array.isArray(record.symptoms) ? record.symptoms : JSON.parse(record.symptoms as string)) as CaseStudy["symptoms"],
    availableData: (Array.isArray(record.availableData) ? record.availableData : JSON.parse(record.availableData as string)) as CaseStudy["availableData"],
    hiddenRootCauses: (Array.isArray(record.hiddenRootCauses) ? record.hiddenRootCauses : JSON.parse(record.hiddenRootCauses as string)) as CaseStudy["hiddenRootCauses"],
    hiddenRootCausesSummary: (typeof record.hiddenCausesSummary === "string" ? record.hiddenCausesSummary : JSON.stringify(record.hiddenCausesSummary)) || "",
    expertIdentifiedCauses: (Array.isArray(record.expertIdentifiedCauses) ? record.expertIdentifiedCauses : JSON.parse(record.expertIdentifiedCauses as string)) as CaseStudy["expertIdentifiedCauses"],
    expertCausesSummary: (typeof record.expertCausesSummary === "string" ? record.expertCausesSummary : JSON.stringify(record.expertCausesSummary)) || "",
    actionsTaken: (Array.isArray(record.actionsTaken) ? record.actionsTaken : JSON.parse(record.actionsTaken as string)) as CaseStudy["actionsTaken"],
    actualOutcome: (typeof record.actualOutcome === "object" ? record.actualOutcome : JSON.parse(record.actualOutcome as string)) as CaseStudy["actualOutcome"],
    sources: (Array.isArray(record.sources) ? record.sources : JSON.parse(record.sources as string)) as CaseStudy["sources"],
    licenseOrAllowedUse: record.licenseOrAllowedUse || "",
    confidence: Number(record.confidence),
    dataCompleteness: Number(record.dataCompleteness),
    expertValidated: record.expertValidated,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    blindTestMode: false,
  };
}

/**
 * Helper: Parse benchmark record.
 */
function parseBenchmarkRecord(record: PrismaCaseBenchmarkResult): CaseBenchmarkResult {
  return {
    benchmarkId: record.id,
    caseId: record.caseId,
    diagnosisId: record.diagnosisId,
    identifiedCauses: (Array.isArray(record.identifiedCauses) ? record.identifiedCauses : JSON.parse(record.identifiedCauses as string)) as CaseBenchmarkResult["identifiedCauses"],
    confidenceScores: (Array.isArray(record.confidenceScores) ? record.confidenceScores : JSON.parse(record.confidenceScores as string)) as CaseBenchmarkResult["confidenceScores"],
    accuracyScore: Number(record.accuracyScore),
    precisionScore: Number(record.precisionScore),
    recallScore: Number(record.recallScore),
    performanceNotes: record.performanceNotes || "",
    falsePositives: (Array.isArray(record.falsePositives) ? record.falsePositives : JSON.parse(record.falsePositives as string)) as string[],
    falsNegatives: (Array.isArray(record.falseNegatives) ? record.falseNegatives : JSON.parse(record.falseNegatives as string)) as string[],
    testedAt: record.testedAt,
  };
}
