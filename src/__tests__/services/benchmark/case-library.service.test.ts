import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDbInstance } from "@/lib/db";
import {
  getCaseStudy,
  findCaseStudies,
  getApplicableCases,
  recordBenchmarkResult,
  getCaseBenchmarks,
  getAverageBenchmarkScores,
  getCaseLibraryStats,
  validateCase,
} from "@/services/benchmark/case-library.service";
import type { CaseStudy } from "@/domain/benchmark/case-study";

let db: PrismaClient;

beforeEach(async () => {
  db = await getDbInstance();
});

afterEach(async () => {
  await db.caseBenchmarkResult.deleteMany({});
  await db.caseStudy.deleteMany({});
});

const createTestCase = (
  overrides: Partial<CaseStudy> = {}
): Omit<CaseStudy, "createdAt" | "updatedAt"> => ({
  id: `case_saas_2025_001`,
  title: "SaaS Startup Revenue Collapse",
  description: "A B2B SaaS startup lost 70% of MRR due to failed product pivot.",
  industry: "SaaS",
  businessModel: "subscription",
  businessSize: "startup",
  year: 2025,
  yearRange: { startYear: 2024, endYear: 2025 },
  symptoms: [
    {
      symptomId: "sym_001",
      category: "revenue_decline",
      description: "MRR dropped from $50K to $15K in Q1 2025",
      severity: "critical",
      observationPeriod: "Q1 2025",
    },
  ],
  availableData: [
    {
      evidenceId: "ev_001",
      type: "financial",
      description: "Monthly recurring revenue tracking",
      metric: "MRR declined 70% YoY",
      timeframe: "Jan-Mar 2025",
      sourceReference: "internal_financial_records",
    },
  ],
  hiddenRootCauses: [
    {
      causeId: "cause_hidden_001",
      description: "Product pivot alienated core customer segment",
      category: "execution_failure",
      probability: 0.85,
      evidenceSupporting: ["ev_001"],
    },
  ],
  hiddenRootCausesSummary:
    "Core customer segment abandoned due to product strategy shift",
  expertIdentifiedCauses: [
    {
      causeId: "cause_expert_001",
      description: "Product pivot alienated core customer segment",
      category: "execution_failure",
      probability: 0.85,
      evidenceSupporting: ["ev_001"],
    },
  ],
  expertCausesSummary:
    "Expert analysis confirmed customer alienation as primary cause",
  actionsTaken: [
    {
      actionId: "action_001",
      description: "Revert product to previous version",
      timeToImplement: "2 weeks",
      estimatedCost: "Low",
      responsible: "CEO",
    },
  ],
  actualOutcome: {
    outcomeId: "outcome_001",
    timeframe: "Q2 2025",
    metricsImproved: [
      {
        metric: "MRR",
        startValue: "$15K",
        endValue: "$40K",
        improvement: "+167%",
      },
    ],
    statusAchieved: "partially_resolved",
    keySuccessFactors: ["Fast decision-making", "Customer communication"],
    lessonsLearned: ["Test product changes with customer cohort first"],
  },
  sources: [
    {
      sourceId: "src_001",
      title: "Internal financial records and founder post-mortem",
      sourceType: "manual_summary",
      url: undefined,
      licenseType: "internal_proprietary",
      allowedUse: "Educational and benchmarking use only",
      accessedDate: new Date("2025-06-01"),
      citation: "OpsIQ Case Library: SaaS Revenue Collapse 2025",
    },
  ],
  licenseOrAllowedUse:
    "Internal case study from founder post-mortem. Educational use for diagnosis benchmarking only.",
  confidence: 0.85,
  dataCompleteness: 0.8,
  expertValidated: true,
  blindTestMode: false,
  ...overrides,
});

describe("CaseLibraryService", () => {
  describe("getCaseStudy", () => {
    it("should retrieve a case study by ID", async () => {
      const testCase = createTestCase();
      const created = await db.caseStudy.create({
        data: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          industry: testCase.industry,
          businessModel: testCase.businessModel,
          businessSize: testCase.businessSize,
          year: testCase.year,
          yearStart: testCase.yearRange.startYear,
          yearEnd: testCase.yearRange.endYear,
          symptoms: testCase.symptoms,
          availableData: testCase.availableData,
          hiddenRootCauses: testCase.hiddenRootCauses,
          hiddenCausesSummary: testCase.hiddenRootCausesSummary,
          expertIdentifiedCauses: testCase.expertIdentifiedCauses,
          expertCausesSummary: testCase.expertCausesSummary,
          actionsTaken: testCase.actionsTaken,
          actualOutcome: testCase.actualOutcome,
          sources: testCase.sources,
          licenseOrAllowedUse: testCase.licenseOrAllowedUse,
          confidence: testCase.confidence,
          dataCompleteness: testCase.dataCompleteness,
          expertValidated: testCase.expertValidated,
        },
      });

      const retrieved = await getCaseStudy(db, testCase.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(testCase.id);
      expect(retrieved?.title).toBe(testCase.title);
      expect(retrieved?.confidence).toBe(testCase.confidence);
    });

    it("should return null for non-existent case", async () => {
      const result = await getCaseStudy(db, "case_nonexistent");
      expect(result).toBeNull();
    });

    it("should return blind test version when blindTest=true", async () => {
      const testCase = createTestCase();
      await db.caseStudy.create({
        data: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          industry: testCase.industry,
          businessModel: testCase.businessModel,
          businessSize: testCase.businessSize,
          year: testCase.year,
          yearStart: testCase.yearRange.startYear,
          yearEnd: testCase.yearRange.endYear,
          symptoms: testCase.symptoms,
          availableData: testCase.availableData,
          hiddenRootCauses: testCase.hiddenRootCauses,
          hiddenCausesSummary: testCase.hiddenRootCausesSummary,
          expertIdentifiedCauses: testCase.expertIdentifiedCauses,
          expertCausesSummary: testCase.expertCausesSummary,
          actionsTaken: testCase.actionsTaken,
          actualOutcome: testCase.actualOutcome,
          sources: testCase.sources,
          licenseOrAllowedUse: testCase.licenseOrAllowedUse,
          confidence: testCase.confidence,
          dataCompleteness: testCase.dataCompleteness,
          expertValidated: testCase.expertValidated,
        },
      });

      const blindVersion = await getCaseStudy(db, testCase.id, true);

      expect(blindVersion).not.toBeNull();
      expect(blindVersion?.blindTestMode).toBe(true);
      expect((blindVersion as any)?.hiddenRootCauses).toBeUndefined();
      expect((blindVersion as any)?.expertIdentifiedCauses).toBeUndefined();
      expect((blindVersion as any)?.actualOutcome).toBeUndefined();
    });
  });

  describe("findCaseStudies", () => {
    it("should find cases by industry", async () => {
      const case1 = createTestCase({ id: "case_saas_001" });
      const case2 = createTestCase({
        id: "case_retail_001",
        industry: "retail",
      });

      await db.caseStudy.create({
        data: {
          id: case1.id,
          title: case1.title,
          description: case1.description,
          industry: case1.industry,
          businessModel: case1.businessModel,
          businessSize: case1.businessSize,
          year: case1.year,
          yearStart: case1.yearRange.startYear,
          yearEnd: case1.yearRange.endYear,
          symptoms: case1.symptoms,
          availableData: case1.availableData,
          hiddenRootCauses: case1.hiddenRootCauses,
          hiddenCausesSummary: case1.hiddenRootCausesSummary,
          expertIdentifiedCauses: case1.expertIdentifiedCauses,
          expertCausesSummary: case1.expertCausesSummary,
          actionsTaken: case1.actionsTaken,
          actualOutcome: case1.actualOutcome,
          sources: case1.sources,
          licenseOrAllowedUse: case1.licenseOrAllowedUse,
          confidence: case1.confidence,
          dataCompleteness: case1.dataCompleteness,
          expertValidated: case1.expertValidated,
        },
      });

      await db.caseStudy.create({
        data: {
          id: case2.id,
          title: case2.title,
          description: case2.description,
          industry: case2.industry,
          businessModel: case2.businessModel,
          businessSize: case2.businessSize,
          year: case2.year,
          yearStart: case2.yearRange.startYear,
          yearEnd: case2.yearRange.endYear,
          symptoms: case2.symptoms,
          availableData: case2.availableData,
          hiddenRootCauses: case2.hiddenRootCauses,
          hiddenCausesSummary: case2.hiddenRootCausesSummary,
          expertIdentifiedCauses: case2.expertIdentifiedCauses,
          expertCausesSummary: case2.expertCausesSummary,
          actionsTaken: case2.actionsTaken,
          actualOutcome: case2.actualOutcome,
          sources: case2.sources,
          licenseOrAllowedUse: case2.licenseOrAllowedUse,
          confidence: case2.confidence,
          dataCompleteness: case2.dataCompleteness,
          expertValidated: case2.expertValidated,
        },
      });

      const results = await findCaseStudies(db, { industry: "SaaS" });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(case1.id);
    });

    it("should sort by confidence descending", async () => {
      const case1 = createTestCase({
        id: "case_high_conf",
        confidence: 0.95,
      });
      const case2 = createTestCase({
        id: "case_low_conf",
        confidence: 0.6,
      });

      await db.caseStudy.create({
        data: {
          id: case1.id,
          title: case1.title,
          description: case1.description,
          industry: case1.industry,
          businessModel: case1.businessModel,
          businessSize: case1.businessSize,
          year: case1.year,
          yearStart: case1.yearRange.startYear,
          yearEnd: case1.yearRange.endYear,
          symptoms: case1.symptoms,
          availableData: case1.availableData,
          hiddenRootCauses: case1.hiddenRootCauses,
          hiddenCausesSummary: case1.hiddenRootCausesSummary,
          expertIdentifiedCauses: case1.expertIdentifiedCauses,
          expertCausesSummary: case1.expertCausesSummary,
          actionsTaken: case1.actionsTaken,
          actualOutcome: case1.actualOutcome,
          sources: case1.sources,
          licenseOrAllowedUse: case1.licenseOrAllowedUse,
          confidence: case1.confidence,
          dataCompleteness: case1.dataCompleteness,
          expertValidated: case1.expertValidated,
        },
      });

      await db.caseStudy.create({
        data: {
          id: case2.id,
          title: case2.title,
          description: case2.description,
          industry: case2.industry,
          businessModel: case2.businessModel,
          businessSize: case2.businessSize,
          year: case2.year,
          yearStart: case2.yearRange.startYear,
          yearEnd: case2.yearRange.endYear,
          symptoms: case2.symptoms,
          availableData: case2.availableData,
          hiddenRootCauses: case2.hiddenRootCauses,
          hiddenCausesSummary: case2.hiddenRootCausesSummary,
          expertIdentifiedCauses: case2.expertIdentifiedCauses,
          expertCausesSummary: case2.expertCausesSummary,
          actionsTaken: case2.actionsTaken,
          actualOutcome: case2.actualOutcome,
          sources: case2.sources,
          licenseOrAllowedUse: case2.licenseOrAllowedUse,
          confidence: case2.confidence,
          dataCompleteness: case2.dataCompleteness,
          expertValidated: case2.expertValidated,
        },
      });

      const results = await findCaseStudies(db, {});

      expect(results[0].confidence).toBe(0.95);
      expect(results[1].confidence).toBe(0.6);
    });
  });

  describe("recordBenchmarkResult", () => {
    it("should record a benchmark result", async () => {
      const testCase = createTestCase();
      await db.caseStudy.create({
        data: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          industry: testCase.industry,
          businessModel: testCase.businessModel,
          businessSize: testCase.businessSize,
          year: testCase.year,
          yearStart: testCase.yearRange.startYear,
          yearEnd: testCase.yearRange.endYear,
          symptoms: testCase.symptoms,
          availableData: testCase.availableData,
          hiddenRootCauses: testCase.hiddenRootCauses,
          hiddenCausesSummary: testCase.hiddenRootCausesSummary,
          expertIdentifiedCauses: testCase.expertIdentifiedCauses,
          expertCausesSummary: testCase.expertCausesSummary,
          actionsTaken: testCase.actionsTaken,
          actualOutcome: testCase.actualOutcome,
          sources: testCase.sources,
          licenseOrAllowedUse: testCase.licenseOrAllowedUse,
          confidence: testCase.confidence,
          dataCompleteness: testCase.dataCompleteness,
          expertValidated: testCase.expertValidated,
        },
      });

      const result = await recordBenchmarkResult(db, testCase.id, {
        diagnosisId: "diag_001",
        identifiedCauses: testCase.expertIdentifiedCauses,
        confidenceScores: [],
        accuracyScore: 0.85,
        precisionScore: 0.9,
        recallScore: 0.8,
        performanceNotes: "Good diagnosis",
        falsePositives: [],
        falseNegatives: [],
      });

      expect(result.benchmarkId).toBeDefined();
      expect(result.caseId).toBe(testCase.id);
      expect(result.accuracyScore).toBe(0.85);
    });
  });

  describe("getCaseBenchmarks", () => {
    it("should retrieve benchmark results for a case", async () => {
      const testCase = createTestCase();
      await db.caseStudy.create({
        data: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          industry: testCase.industry,
          businessModel: testCase.businessModel,
          businessSize: testCase.businessSize,
          year: testCase.year,
          yearStart: testCase.yearRange.startYear,
          yearEnd: testCase.yearRange.endYear,
          symptoms: testCase.symptoms,
          availableData: testCase.availableData,
          hiddenRootCauses: testCase.hiddenRootCauses,
          hiddenCausesSummary: testCase.hiddenRootCausesSummary,
          expertIdentifiedCauses: testCase.expertIdentifiedCauses,
          expertCausesSummary: testCase.expertCausesSummary,
          actionsTaken: testCase.actionsTaken,
          actualOutcome: testCase.actualOutcome,
          sources: testCase.sources,
          licenseOrAllowedUse: testCase.licenseOrAllowedUse,
          confidence: testCase.confidence,
          dataCompleteness: testCase.dataCompleteness,
          expertValidated: testCase.expertValidated,
        },
      });

      await recordBenchmarkResult(db, testCase.id, {
        diagnosisId: "diag_001",
        identifiedCauses: testCase.expertIdentifiedCauses,
        confidenceScores: [],
        accuracyScore: 0.85,
        precisionScore: 0.9,
        recallScore: 0.8,
        performanceNotes: "Good diagnosis",
        falsePositives: [],
        falseNegatives: [],
      });

      const results = await getCaseBenchmarks(db, testCase.id);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].caseId).toBe(testCase.id);
    });
  });

  describe("getAverageBenchmarkScores", () => {
    it("should calculate average benchmark scores", async () => {
      const case1 = createTestCase({ id: "case_001" });
      const case2 = createTestCase({ id: "case_002" });

      await db.caseStudy.create({
        data: {
          id: case1.id,
          title: case1.title,
          description: case1.description,
          industry: case1.industry,
          businessModel: case1.businessModel,
          businessSize: case1.businessSize,
          year: case1.year,
          yearStart: case1.yearRange.startYear,
          yearEnd: case1.yearRange.endYear,
          symptoms: case1.symptoms,
          availableData: case1.availableData,
          hiddenRootCauses: case1.hiddenRootCauses,
          hiddenCausesSummary: case1.hiddenRootCausesSummary,
          expertIdentifiedCauses: case1.expertIdentifiedCauses,
          expertCausesSummary: case1.expertCausesSummary,
          actionsTaken: case1.actionsTaken,
          actualOutcome: case1.actualOutcome,
          sources: case1.sources,
          licenseOrAllowedUse: case1.licenseOrAllowedUse,
          confidence: case1.confidence,
          dataCompleteness: case1.dataCompleteness,
          expertValidated: case1.expertValidated,
        },
      });

      await db.caseStudy.create({
        data: {
          id: case2.id,
          title: case2.title,
          description: case2.description,
          industry: case2.industry,
          businessModel: case2.businessModel,
          businessSize: case2.businessSize,
          year: case2.year,
          yearStart: case2.yearRange.startYear,
          yearEnd: case2.yearRange.endYear,
          symptoms: case2.symptoms,
          availableData: case2.availableData,
          hiddenRootCauses: case2.hiddenRootCauses,
          hiddenCausesSummary: case2.hiddenRootCausesSummary,
          expertIdentifiedCauses: case2.expertIdentifiedCauses,
          expertCausesSummary: case2.expertCausesSummary,
          actionsTaken: case2.actionsTaken,
          actualOutcome: case2.actualOutcome,
          sources: case2.sources,
          licenseOrAllowedUse: case2.licenseOrAllowedUse,
          confidence: case2.confidence,
          dataCompleteness: case2.dataCompleteness,
          expertValidated: case2.expertValidated,
        },
      });

      await recordBenchmarkResult(db, case1.id, {
        diagnosisId: "diag_001",
        identifiedCauses: case1.expertIdentifiedCauses,
        confidenceScores: [],
        accuracyScore: 0.8,
        precisionScore: 0.85,
        recallScore: 0.75,
        performanceNotes: "Good",
        falsePositives: [],
        falseNegatives: [],
      });

      await recordBenchmarkResult(db, case2.id, {
        diagnosisId: "diag_002",
        identifiedCauses: case2.expertIdentifiedCauses,
        confidenceScores: [],
        accuracyScore: 0.9,
        precisionScore: 0.95,
        recallScore: 0.85,
        performanceNotes: "Excellent",
        falsePositives: [],
        falseNegatives: [],
      });

      const scores = await getAverageBenchmarkScores(db);

      expect(scores.totalBenchmarks).toBe(2);
      expect(scores.casesCovered).toBe(2);
      expect(scores.averageAccuracy).toBe(0.85);
      expect(scores.averagePrecision).toBe(0.9);
      expect(scores.averageRecall).toBe(0.8);
    });

    it("should return zeros when no benchmarks exist", async () => {
      const scores = await getAverageBenchmarkScores(db);

      expect(scores.totalBenchmarks).toBe(0);
      expect(scores.casesCovered).toBe(0);
      expect(scores.averageAccuracy).toBe(0);
    });
  });

  describe("getCaseLibraryStats", () => {
    it("should return statistics about the case library", async () => {
      const case1 = createTestCase({
        id: "case_saas_001",
        industry: "SaaS",
        businessSize: "startup",
        confidence: 0.9,
        expertValidated: true,
      });

      const case2 = createTestCase({
        id: "case_retail_001",
        industry: "retail",
        businessSize: "medium",
        confidence: 0.7,
        expertValidated: false,
      });

      await db.caseStudy.create({
        data: {
          id: case1.id,
          title: case1.title,
          description: case1.description,
          industry: case1.industry,
          businessModel: case1.businessModel,
          businessSize: case1.businessSize,
          year: case1.year,
          yearStart: case1.yearRange.startYear,
          yearEnd: case1.yearRange.endYear,
          symptoms: case1.symptoms,
          availableData: case1.availableData,
          hiddenRootCauses: case1.hiddenRootCauses,
          hiddenCausesSummary: case1.hiddenRootCausesSummary,
          expertIdentifiedCauses: case1.expertIdentifiedCauses,
          expertCausesSummary: case1.expertCausesSummary,
          actionsTaken: case1.actionsTaken,
          actualOutcome: case1.actualOutcome,
          sources: case1.sources,
          licenseOrAllowedUse: case1.licenseOrAllowedUse,
          confidence: case1.confidence,
          dataCompleteness: case1.dataCompleteness,
          expertValidated: case1.expertValidated,
        },
      });

      await db.caseStudy.create({
        data: {
          id: case2.id,
          title: case2.title,
          description: case2.description,
          industry: case2.industry,
          businessModel: case2.businessModel,
          businessSize: case2.businessSize,
          year: case2.year,
          yearStart: case2.yearRange.startYear,
          yearEnd: case2.yearRange.endYear,
          symptoms: case2.symptoms,
          availableData: case2.availableData,
          hiddenRootCauses: case2.hiddenRootCauses,
          hiddenCausesSummary: case2.hiddenRootCausesSummary,
          expertIdentifiedCauses: case2.expertIdentifiedCauses,
          expertCausesSummary: case2.expertCausesSummary,
          actionsTaken: case2.actionsTaken,
          actualOutcome: case2.actualOutcome,
          sources: case2.sources,
          licenseOrAllowedUse: case2.licenseOrAllowedUse,
          confidence: case2.confidence,
          dataCompleteness: case2.dataCompleteness,
          expertValidated: case2.expertValidated,
        },
      });

      const stats = await getCaseLibraryStats(db);

      expect(stats.totalCases).toBe(2);
      expect(stats.casesByIndustry["SaaS"]).toBe(1);
      expect(stats.casesByIndustry["retail"]).toBe(1);
      expect(stats.casesBySize["startup"]).toBe(1);
      expect(stats.casesBySize["medium"]).toBe(1);
      expect(stats.averageConfidence).toBe(0.8);
      expect(stats.expertValidatedCount).toBe(1);
    });
  });

  describe("validateCase", () => {
    it("should validate a compliant case", () => {
      const testCase = createTestCase();
      const result = validateCase(testCase as any);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject case without sources", () => {
      const testCase = createTestCase({ sources: [] });
      const result = validateCase(testCase as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("source"))).toBe(true);
    });

    it("should reject case without license", () => {
      const testCase = createTestCase({ licenseOrAllowedUse: "" });
      const result = validateCase(testCase as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("license"))).toBe(true);
    });

    it("should warn about low data completeness", () => {
      const testCase = createTestCase({ dataCompleteness: 0.4 });
      const result = validateCase(testCase as any);

      expect(result.warnings.some((w) => w.includes("completeness"))).toBe(
        true
      );
    });

    it("should warn when high-confidence case is not expert-validated", () => {
      const testCase = createTestCase({
        confidence: 0.85,
        expertValidated: false,
      });
      const result = validateCase(testCase as any);

      expect(
        result.warnings.some((w) => w.includes("expert-validated"))
      ).toBe(true);
    });
  });
});
