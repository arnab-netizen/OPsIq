/**
 * B15-S1: Real-World Case-Study Benchmark Library — Domain Model
 *
 * Represents real-world business case studies for benchmarking diagnosis accuracy.
 *
 * Design principles:
 * - Source transparency: all sources documented with license/allowed-use
 * - No copyright violation: avoid copyrighted full-text case packs
 * - Blind testing: outcome and root cause can be hidden for testing
 * - Expert validation: cases include expert-identified causes vs hidden causes
 * - Confidence scoring: each case has confidence/reliability rating
 *
 * Allowed sources:
 * - Public-domain sources
 * - Government reports
 * - Court/admin filings
 * - Public annual reports
 * - Company/founder public post-mortems
 * - Open datasets with clear license
 * - Manual summaries with links
 *
 * Forbidden:
 * - Paid HBR case copying
 * - Paywalled report ingestion
 * - Scraped private documents
 * - Copyrighted full-text case packs
 */

export interface CaseStudySource {
  sourceId: string;
  title: string;
  sourceType:
    | "public_domain"
    | "government_report"
    | "court_filing"
    | "annual_report"
    | "founder_postmortem"
    | "open_dataset"
    | "manual_summary";
  url?: string; // Link to source (required for traceability)
  licenseType: string; // "public_domain" | "cc_by" | "cc_by_sa" | etc.
  allowedUse: string; // Description of what's allowed per license
  accessedDate: Date;
  citation: string; // How to cite this source
}

export interface CaseStudySymptom {
  symptomId: string;
  category: string; // e.g., "cash_flow", "revenue_decline", "profitability"
  description: string;
  severity: "critical" | "high" | "moderate" | "low";
  observationPeriod: string; // e.g., "Q1-Q3 2025"
}

export interface CaseStudyEvidence {
  evidenceId: string;
  type: "financial" | "operational" | "market" | "leadership" | "other";
  description: string;
  metric?: string; // e.g., "Revenue declined 40% YoY"
  timeframe: string;
  sourceReference: string; // Which source provides this evidence
}

export interface RootCause {
  causeId: string;
  description: string;
  category: string; // e.g., "market_shift", "execution_failure", "strategy_error"
  probability: number; // 0.0-1.0: likelihood based on available data
  evidenceSupporting: string[]; // IDs of evidence pointing to this cause
}

export interface ImplementedAction {
  actionId: string;
  description: string;
  timeToImplement: string; // e.g., "3 months"
  estimatedCost: string; // e.g., "$500K", "Low", "High"
  responsible: string; // e.g., "CEO", "CFO", "Board"
}

export interface CaseStudyOutcome {
  outcomeId: string;
  timeframe: string; // How long after actions were taken
  metricsImproved: {
    metric: string;
    startValue: string;
    endValue: string;
    improvement: string; // e.g., "+25%"
  }[];
  statusAchieved: "resolved" | "partially_resolved" | "ongoing" | "failed";
  keySuccessFactors: string[];
  lessonsLearned: string[];
}

export interface CaseStudy {
  id: string; // case_<industry>_<year>_<sequence>
  title: string;
  description: string; // Executive summary (1-2 paragraphs)

  // Business context
  industry: string; // SaaS, manufacturing, retail, etc.
  businessModel: string; // subscription, marketplace, consulting, etc.
  businessSize: "startup" | "small" | "medium" | "large" | "enterprise";
  year: number; // Year case occurred
  yearRange: {
    startYear: number;
    endYear: number;
  }; // If multi-year

  // The case itself
  symptoms: CaseStudySymptom[];
  availableData: CaseStudyEvidence[];

  // Hidden root causes (for blind testing)
  hiddenRootCauses: RootCause[];
  hiddenRootCausesSummary: string; // Plain text summary

  // Expert diagnosis (what experts determined as actual causes)
  expertIdentifiedCauses: RootCause[];
  expertCausesSummary: string;

  // Actions and outcomes
  actionsTaken: ImplementedAction[];
  actualOutcome: CaseStudyOutcome;

  // Source transparency (CRITICAL)
  sources: CaseStudySource[];
  licenseOrAllowedUse: string; // Summary of licensing constraints

  // Confidence metrics
  confidence: number; // 0.0-1.0: How confident we are in this case's accuracy
  dataCompleteness: number; // 0.0-1.0: How complete is the available information
  expertValidated: boolean; // Has this been reviewed by domain expert

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  blindTestMode: boolean; // If true, hidden causes are used instead of expert diagnosis
}

/**
 * Represents a lesson learned from a case study.
 * Can be extracted and applied to other diagnoses.
 */
export interface CaseStudyLesson {
  lessonId: string;
  caseId: string;
  title: string;
  description: string;
  applicableIndustries: string[];
  applicableBusinessModels: string[];
  applicableBusinessSizes: ("startup" | "small" | "medium" | "large" | "enterprise")[];
  priority: "high" | "medium" | "low";
}

/**
 * Benchmark result: how well diagnosis engine performed on a case.
 */
export interface CaseBenchmarkResult {
  benchmarkId: string;
  caseId: string;
  diagnosisId: string; // The diagnosis generated for this case

  // What did the diagnosis engine identify
  identifiedCauses: RootCause[];
  confidenceScores: {
    cause: string;
    engineConfidence: number;
    actualConfidence: number; // From case study
  }[];

  // Scoring
  accuracyScore: number; // 0.0-1.0: how closely matched actual causes
  precisionScore: number; // What % of identified causes were actually relevant
  recallScore: number; // What % of actual causes were identified

  // Feedback
  performanceNotes: string;
  falsePositives: string[]; // Causes identified but not actual
  falsNegatives: string[]; // Actual causes not identified

  // Timestamp
  testedAt: Date;
}

/**
 * Validate that a case study adheres to licensing and source requirements.
 */
export function validateCaseStudyCompliance(
  caseStudy: CaseStudy
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check source and license fields are present
  if (!caseStudy.sources || caseStudy.sources.length === 0) {
    errors.push("Case study must have at least one documented source");
  }

  if (!caseStudy.licenseOrAllowedUse) {
    errors.push("License or allowed use must be documented");
  }

  // Validate each source
  caseStudy.sources.forEach((source) => {
    if (!source.sourceType) {
      errors.push(`Source "${source.title}" missing sourceType`);
    }

    // Ensure sources are from allowed list
    const allowedTypes = [
      "public_domain",
      "government_report",
      "court_filing",
      "annual_report",
      "founder_postmortem",
      "open_dataset",
      "manual_summary",
    ];

    if (source.sourceType && !allowedTypes.includes(source.sourceType)) {
      errors.push(
        `Source type "${source.sourceType}" not in allowed sources list`
      );
    }

    if (!source.licenseType) {
      errors.push(`Source "${source.title}" missing license type`);
    }

    if (!source.allowedUse) {
      warnings.push(
        `Source "${source.title}" missing detailed allowed-use description`
      );
    }

    // Ensure URL present for traceability
    if (!source.url && source.sourceType !== "manual_summary") {
      warnings.push(
        `Source "${source.title}" should have URL for verification`
      );
    }
  });

  // Check data completeness
  if (caseStudy.dataCompleteness < 0.5) {
    warnings.push("Case study has low data completeness (<50%)");
  }

  // Check expert validation
  if (!caseStudy.expertValidated && caseStudy.confidence > 0.8) {
    warnings.push("High-confidence case should be expert-validated");
  }

  // Blind test validation
  if (caseStudy.blindTestMode) {
    if (caseStudy.hiddenRootCausesSummary.length === 0) {
      errors.push("Blind test mode requires hidden root causes summary");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a case study is appropriate for a given scenario.
 * Used to find relevant benchmarks for comparison.
 */
export function isCaseStudyApplicable(
  caseStudy: CaseStudy,
  filters: {
    industry?: string;
    businessModel?: string;
    businessSize?: string;
    symptomCategory?: string;
  }
): boolean {
  if (filters.industry && caseStudy.industry !== filters.industry) {
    return false;
  }

  if (filters.businessModel && caseStudy.businessModel !== filters.businessModel) {
    return false;
  }

  if (filters.businessSize && caseStudy.businessSize !== filters.businessSize) {
    return false;
  }

  if (filters.symptomCategory) {
    const hasSymptom = caseStudy.symptoms.some(
      (s) => s.category === filters.symptomCategory
    );
    if (!hasSymptom) {
      return false;
    }
  }

  return true;
}

/**
 * Get the case study in blind test mode (hidden outcomes and causes).
 * Used for diagnosis testing without biasing engine.
 */
export function getBlindTestVersion(
  caseStudy: CaseStudy
): Omit<
  CaseStudy,
  "hiddenRootCauses" | "hiddenRootCausesSummary" | "expertIdentifiedCauses" | "expertCausesSummary" | "actualOutcome"
> {
  return {
    id: caseStudy.id,
    title: caseStudy.title,
    description: caseStudy.description,
    industry: caseStudy.industry,
    businessModel: caseStudy.businessModel,
    businessSize: caseStudy.businessSize,
    year: caseStudy.year,
    yearRange: caseStudy.yearRange,
    symptoms: caseStudy.symptoms,
    availableData: caseStudy.availableData,
    actionsTaken: caseStudy.actionsTaken,
    sources: caseStudy.sources,
    licenseOrAllowedUse: caseStudy.licenseOrAllowedUse,
    confidence: caseStudy.confidence,
    dataCompleteness: caseStudy.dataCompleteness,
    expertValidated: caseStudy.expertValidated,
    createdAt: caseStudy.createdAt,
    updatedAt: caseStudy.updatedAt,
    blindTestMode: true,
  };
}
