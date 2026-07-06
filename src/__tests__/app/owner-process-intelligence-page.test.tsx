/**
 * Owner Process Intelligence page — jsdom integration test (browser-free).
 *
 * Stubs fetch to serve the now-view payload and asserts the page loads the process-intelligence block,
 * renders the top breakdown, links back to the Owner Now View, and shows a safe error on failure.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import OwnerProcessIntelligencePage from "@/app/(authenticated)/owner/process-intelligence/page";

const PAYLOAD = {
  processIntelligence: {
    topFinding: {
      findingType: "ESCALATION_RESPONSE_BREAKDOWN", severity: "HIGH", confidence: "MEDIUM", affectedStage: "ESCALATION_RESPONSE",
      affectedActorId: null, affectedManagerId: "mgr-1", supportingProofIds: [], supportingOperationalEventIds: [],
      supportingEscalationIds: ["esc1", "esc2"], supportingAdjudicationIds: [], relatedProfitLeak: null, relatedConstraint: "MANAGER",
      relatedSLO: "ANTI_GAMING_RISK", ownerExplanation: "Escalations are reaching this manager but not being acknowledged in time.",
      recommendedCorrectiveAction: "Reassign the overdue escalations and set a hard acknowledgement deadline.",
      expectedImpactType: "TRUST_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    },
    findings: [],
  },
  processCorrections: {
    corrections: [
      {
        correctionId: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
        sourceFindingType: "ESCALATION_RESPONSE_BREAKDOWN", correctionType: "ESCALATE_TO_OWNER",
        title: "Reassign the overdue escalations", instruction: "Reassign the overdue escalations now and set a hard acknowledgement deadline.",
        affectedStage: "ESCALATION_RESPONSE", targetActorId: null, targetManagerId: "mgr-1", severity: "HIGH",
        priorityRank: 1, requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, autoExecutable: false, status: "PROPOSED",
      },
    ],
    topCorrection: {
      correctionId: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
      sourceFindingType: "ESCALATION_RESPONSE_BREAKDOWN", correctionType: "ESCALATE_TO_OWNER",
      title: "Reassign the overdue escalations", instruction: "Reassign the overdue escalations now and set a hard acknowledgement deadline.",
      affectedStage: "ESCALATION_RESPONSE", targetActorId: null, targetManagerId: "mgr-1", severity: "HIGH",
      priorityRank: 1, requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, autoExecutable: false, status: "PROPOSED",
    },
  },
  sopChecklistCorrections: {
    drafts: [
      {
        sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
        correctionType: "UPDATE_CHECKLIST", affectedStage: "PROOF_REVIEW", sopArea: "ACCEPTANCE_QUALITY_CHECKLIST",
        proposedChangeTitle: "Tighten the acceptance/quality checklist for this job type",
        proposedChangeBody: "Add the specific check that keeps being missed to the acceptance checklist.",
        reason: "Customers keep complaining about quality on work that was signed off.",
        supportingProofIds: [], supportingOperationalEventIds: ["c1"], supportingEscalationIds: [],
        approvalLevel: "OWNER", ownerApprovalRequired: true, managerApprovalRequired: true,
        successMetric: "Quality complaint / rework events fall over the review window", reviewAfterDays: 14,
        status: "DRAFT", missingData: [],
      },
    ],
    topDraft: {
      sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
      correctionType: "UPDATE_CHECKLIST", affectedStage: "PROOF_REVIEW", sopArea: "ACCEPTANCE_QUALITY_CHECKLIST",
      proposedChangeTitle: "Tighten the acceptance/quality checklist for this job type",
      proposedChangeBody: "Add the specific check that keeps being missed to the acceptance checklist.",
      reason: "Customers keep complaining about quality on work that was signed off.",
      supportingProofIds: [], supportingOperationalEventIds: ["c1"], supportingEscalationIds: [],
      approvalLevel: "OWNER", ownerApprovalRequired: true, managerApprovalRequired: true,
      successMetric: "Quality complaint / rework events fall over the review window", reviewAfterDays: 14,
      status: "DRAFT", missingData: [],
    },
  },
  trainingAssignments: {
    assignments: [
      {
        sourceProcessFindingKey: "ws-1:ESCALATION_RESPONSE_BREAKDOWN", sourceCorrectionKey: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
        trainingType: "ESCALATION_RESPONSE_REVIEW", assignedToUserId: "mgr-1", assignedRole: null, assignedByRole: "system-proposed",
        approvalLevel: "OWNER", reason: "Escalations are arriving but not acknowledged in time.",
        supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: ["esc1"],
        relatedSopChecklistCorrectionKey: null, successMetric: "Escalation acknowledgement time improves over the review window",
        reviewAfterDays: 14, status: "PROPOSED", ownerVisibleExplanation: "Review escalation handling with this manager.",
      },
    ],
    topAssignment: {
      sourceProcessFindingKey: "ws-1:ESCALATION_RESPONSE_BREAKDOWN", sourceCorrectionKey: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
      trainingType: "ESCALATION_RESPONSE_REVIEW", assignedToUserId: "mgr-1", assignedRole: null, assignedByRole: "system-proposed",
      approvalLevel: "OWNER", reason: "Escalations are arriving but not acknowledged in time.",
      supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: ["esc1"],
      relatedSopChecklistCorrectionKey: null, successMetric: "Escalation acknowledgement time improves over the review window",
      reviewAfterDays: 14, status: "PROPOSED", ownerVisibleExplanation: "Review escalation handling with this manager.",
    },
  },
  sopTrainingEffectiveness: {
    evaluations: [
      {
        sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW", sourceTrainingKey: null,
        sourceProcessFindingKey: "ws-1:QUALITY_FAILURE_LOOP", evaluationType: "SOP_CHECKLIST_EFFECTIVENESS",
        targetedProblemType: "QUALITY_COMPLAINTS", baselineMetricValue: 5, currentMetricValue: 2, direction: "IMPROVED",
        confidence: "MEDIUM", ownerVisibleSummary: "The quality complaints fell from 5 to 2 after the correction — it appears to be working.",
        recommendedNextAction: "KEEP", approvalLevel: "OWNER", missingData: [],
      },
    ],
    topEvaluation: {
      sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW", sourceTrainingKey: null,
      sourceProcessFindingKey: "ws-1:QUALITY_FAILURE_LOOP", evaluationType: "SOP_CHECKLIST_EFFECTIVENESS",
      targetedProblemType: "QUALITY_COMPLAINTS", baselineMetricValue: 5, currentMetricValue: 2, direction: "IMPROVED",
      confidence: "MEDIUM", ownerVisibleSummary: "The quality complaints fell from 5 to 2 after the correction — it appears to be working.",
      recommendedNextAction: "KEEP", approvalLevel: "OWNER", missingData: [],
    },
  },
  ownerWorkloadReduction: {
    findings: [
      {
        workloadType: "REPEATED_OWNER_ADJUDICATION", severity: "MEDIUM", burdenCount: 4, estimatedOwnerTouches: 4,
        supportingProofIds: [], supportingAdjudicationIds: ["a1", "a2", "a3", "a4"], supportingOperationalEventIds: [],
        supportingEscalationIds: [], supportingCorrectionKeys: [], supportingTrainingKeys: [],
        relatedProcessFinding: "PROOF_QUALITY_BREAKDOWN", relatedSLO: "ANTI_GAMING_RISK",
        ownerVisibleExplanation: "You keep adjudicating the same kind of weak-proof risk.",
        recommendedReductionAction: "REQUIRE_BETTER_PROOF_UPFRONT", approvalLevel: "MANAGER",
        riskGuardrail: "High-risk decisions stay with the owner; only routine repeats are delegated.", missingData: [],
      },
    ],
    topFinding: {
      workloadType: "REPEATED_OWNER_ADJUDICATION", severity: "MEDIUM", burdenCount: 4, estimatedOwnerTouches: 4,
      supportingProofIds: [], supportingAdjudicationIds: ["a1", "a2", "a3", "a4"], supportingOperationalEventIds: [],
      supportingEscalationIds: [], supportingCorrectionKeys: [], supportingTrainingKeys: [],
      relatedProcessFinding: "PROOF_QUALITY_BREAKDOWN", relatedSLO: "ANTI_GAMING_RISK",
      ownerVisibleExplanation: "You keep adjudicating the same kind of weak-proof risk.",
      recommendedReductionAction: "REQUIRE_BETTER_PROOF_UPFRONT", approvalLevel: "MANAGER",
      riskGuardrail: "High-risk decisions stay with the owner; only routine repeats are delegated.", missingData: [],
    },
  },
  approvalPolicy: {
    decisions: [
      {
        actionKey: "corr-1", actionType: "REQUEST_MISSING_PROOF", title: "Request a fresh, job-specific proof",
        riskCategory: "OPERATIONAL", impactLevel: "LOW", confidence: "HIGH", approvalDecision: "AUTO_ALLOWED",
        requiredApprovalLevel: "STAFF", autoExecutable: true, blocked: false,
        rationale: "This is a safe, reversible action that commits no money, staff or legal state.",
        riskGuardrail: "It changes no money, staff, or legal state.", capabilityGap: false,
        missingCapabilityType: null, systemCapabilityRecommendation: null, supportingEvidenceIds: [], missingData: [],
      },
    ],
    topDecision: {
      actionKey: "corr-1", actionType: "REQUEST_MISSING_PROOF", title: "Request a fresh, job-specific proof",
      riskCategory: "OPERATIONAL", impactLevel: "LOW", confidence: "HIGH", approvalDecision: "AUTO_ALLOWED",
      requiredApprovalLevel: "STAFF", autoExecutable: true, blocked: false,
      rationale: "This is a safe, reversible action that commits no money, staff or legal state.",
      riskGuardrail: "It changes no money, staff, or legal state.", capabilityGap: false,
      missingCapabilityType: null, systemCapabilityRecommendation: null, supportingEvidenceIds: [], missingData: [],
    },
    summary: { autoAllowed: 1, managerRequired: 0, ownerRequired: 0, neverAuto: 0, needsData: 0 },
    capabilityRecommendations: [],
  },
  capabilityGaps: {
    recommendations: [
      {
        capabilityType: "REFUND_RECONCILIATION", title: "Refund reconciliation", severity: "MEDIUM",
        problemStatement: "OpsIQ cannot tie a refund back to a confirmed original charge.",
        recommendedCapability: "A refund-reconciliation capability linking each refund to its verified original transaction.",
        ownerBenefit: "Refund decisions backed by a real record instead of a manual owner check.",
        unlocksAutomation: true, unlockedActionTypes: ["REFUND_ABOVE_THRESHOLD"],
        governanceGuardrail: "Even once built, material money decisions stay owner-controlled.",
        signalCount: 1, evidenceRefs: [], blocksToday: [], missingData: [], estimatedComplexity: "MEDIUM", priorityRank: 1,
      },
    ],
    topRecommendation: {
      capabilityType: "REFUND_RECONCILIATION", title: "Refund reconciliation", severity: "MEDIUM",
      problemStatement: "OpsIQ cannot tie a refund back to a confirmed original charge.",
      recommendedCapability: "A refund-reconciliation capability linking each refund to its verified original transaction.",
      ownerBenefit: "Refund decisions backed by a real record instead of a manual owner check.",
      unlocksAutomation: true, unlockedActionTypes: ["REFUND_ABOVE_THRESHOLD"],
      governanceGuardrail: "Even once built, material money decisions stay owner-controlled.",
      signalCount: 1, evidenceRefs: [], blocksToday: [], missingData: [], estimatedComplexity: "MEDIUM", priorityRank: 1,
    },
    summary: { total: 1, critical: 0, high: 0, unlocksAutomation: 1 },
  },
  cashProfitProtection: {
    signals: [
      {
        signalType: "REWORK_COST_RISK", category: "COST", severity: "MEDIUM", title: "Rework is eating into margin",
        ownerExplanation: "Repeated rework adds cost to work already sold.", protectiveAction: "REDUCE_REWORK_AT_SOURCE",
        approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: "This protects margin by fixing a cost at its source.",
        observedCount: 4, metricType: "REWORK_EVENT_COUNT", metricValue: 4, metricThreshold: 3, thresholdBreached: true,
        supportingProofIds: [], supportingOperationalEventIds: [], supportingFinancialSnapshotIds: [], missingData: [],
      },
    ],
    topSignal: {
      signalType: "REWORK_COST_RISK", category: "COST", severity: "MEDIUM", title: "Rework is eating into margin",
      ownerExplanation: "Repeated rework adds cost to work already sold.", protectiveAction: "REDUCE_REWORK_AT_SOURCE",
      approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: "This protects margin by fixing a cost at its source.",
      observedCount: 4, metricType: "REWORK_EVENT_COUNT", metricValue: 4, metricThreshold: 3, thresholdBreached: true,
      supportingProofIds: [], supportingOperationalEventIds: [], supportingFinancialSnapshotIds: [], missingData: [],
    },
    summary: { total: 1, critical: 0, high: 0, ownerReviewRequired: 0 },
  },
  externalOpportunityIntelligence: {
    classifiedSignals: [{ signalId: "s1", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN", classification: "CANDIDATE", reason: "material, relevant, evidence-backed" }],
    candidates: [
      {
        opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
        sourceEvidenceSummary: "Recurring quality complaints point to dissatisfied customers", sourceRefs: ["ev-1"],
        customerPainPoint: "repeat quality complaints", targetCustomerSegment: "recently-complaining customers",
        expectedValueHypothesis: "A cheap retention offer could reduce churn", confidence: "LOW", missingData: ["per-customer value"],
        cashRisk: "LOW", ownerWorkloadRisk: "LOW", legalOrComplianceRisk: "LOW", validationRequired: true,
        recommendedNextStep: "NEEDS_CAPABILITY", approvalLevel: "MANAGER", relatedCapabilityGap: "MISSING_UNIT_ECONOMICS_OR_MEASUREMENT",
        systemCapabilityRecommendation: "OpsIQ needs unit-economics capture.", riskIfIgnored: "Opportunity cannot be measured yet",
      },
    ],
    topCandidate: {
      opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
      sourceEvidenceSummary: "Recurring quality complaints point to dissatisfied customers", sourceRefs: ["ev-1"],
      customerPainPoint: "repeat quality complaints", targetCustomerSegment: "recently-complaining customers",
      expectedValueHypothesis: "A cheap retention offer could reduce churn", confidence: "LOW", missingData: ["per-customer value"],
      cashRisk: "LOW", ownerWorkloadRisk: "LOW", legalOrComplianceRisk: "LOW", validationRequired: true,
      recommendedNextStep: "NEEDS_CAPABILITY", approvalLevel: "MANAGER", relatedCapabilityGap: "MISSING_UNIT_ECONOMICS_OR_MEASUREMENT",
      systemCapabilityRecommendation: "OpsIQ needs unit-economics capture.", riskIfIgnored: "Opportunity cannot be measured yet",
    },
    tenderCandidates: [], topTenderCandidate: null,
    summary: { rawSignals: 1, duplicatesCollapsed: 0, irrelevantOrParked: 0, needsData: 0, candidates: 1, tenderCandidates: 0, ownerReviewRequired: 0 },
  },
  opportunityValidation: {
    experiments: [
      {
        experimentType: "DATA_COLLECTION_ONLY", opportunityType: "RETENTION_CAMPAIGN",
        hypothesis: "The missing facts to judge the retention offer can be gathered cheaply first",
        riskiestAssumption: "That the opportunity can be judged without its unit economics",
        method: "Gather per-customer value from existing records — no spend, no launch",
        successThreshold: "the missing data is captured well enough to re-evaluate", failureThreshold: "the data cannot be obtained cheaply — escalate",
        stopLossRule: "Stop if it cannot be gathered within 45 minutes of owner time", costCap: 0,
        ownerTimeCapMinutes: 45, durationDays: 5, sampleSizeTarget: 1, dataToCollect: ["per-customer value"],
        requiresOwnerApproval: false, approvalLevel: "MANAGER",
        cheaperAlternativeConsidered: "Running a paid experiment now was rejected until the basic facts are known",
        doNotScaleNote: "A passing result validates the assumption only — it is not permission to scale.", confidence: "LOW",
      },
    ],
    topExperiment: {
      experimentType: "DATA_COLLECTION_ONLY", opportunityType: "RETENTION_CAMPAIGN",
      hypothesis: "The missing facts to judge the retention offer can be gathered cheaply first",
      riskiestAssumption: "That the opportunity can be judged without its unit economics",
      method: "Gather per-customer value from existing records — no spend, no launch",
      successThreshold: "the missing data is captured well enough to re-evaluate", failureThreshold: "the data cannot be obtained cheaply — escalate",
      stopLossRule: "Stop if it cannot be gathered within 45 minutes of owner time", costCap: 0,
      ownerTimeCapMinutes: 45, durationDays: 5, sampleSizeTarget: 1, dataToCollect: ["per-customer value"],
      requiresOwnerApproval: false, approvalLevel: "MANAGER",
      cheaperAlternativeConsidered: "Running a paid experiment now was rejected until the basic facts are known",
      doNotScaleNote: "A passing result validates the assumption only — it is not permission to scale.", confidence: "LOW",
    },
    deferred: [],
    summary: { candidatesConsidered: 1, experimentsDesigned: 1, deferred: 0, dataCollectionOnly: 1, ownerApprovalRequired: 0 },
  },
  opportunityPortfolio: {
    items: [
      {
        opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
        title: "A cheap retention offer could reduce churn", targetCustomerSegment: "recently-complaining customers",
        portfolioDecision: "NEEDS_DATA", validationStatus: "NOT_STARTED", confidence: "LOW", cashRisk: "LOW",
        capitalAtRiskBand: "NONE", expectedReturnBand: "SMALL", requiresOwnerApproval: false, approvalLevel: "MANAGER",
        scaleBlockedReason: "Validation has not passed yet — capital and scale are withheld until it does.",
        recommendedAction: "Collect the missing data (economics / eligibility) before allocating any capital.",
        riskIfIgnored: "Deciding on an opportunity you cannot yet measure.", supportingRefs: ["ev-1"],
      },
    ],
    topItem: {
      opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
      title: "A cheap retention offer could reduce churn", targetCustomerSegment: "recently-complaining customers",
      portfolioDecision: "NEEDS_DATA", validationStatus: "NOT_STARTED", confidence: "LOW", cashRisk: "LOW",
      capitalAtRiskBand: "NONE", expectedReturnBand: "SMALL", requiresOwnerApproval: false, approvalLevel: "MANAGER",
      scaleBlockedReason: "Validation has not passed yet — capital and scale are withheld until it does.",
      recommendedAction: "Collect the missing data (economics / eligibility) before allocating any capital.",
      riskIfIgnored: "Deciding on an opportunity you cannot yet measure.", supportingRefs: ["ev-1"],
    },
    capitalDisciplineNote: "Capital and scale follow proof, not hunches: only opportunities whose validation has passed can be scaled — the rest are validated, reviewed, parked, or stopped.",
    summary: { itemsConsidered: 1, validateFirst: 1, ownerReviewRequired: 0, parkedOrRejected: 0, killed: 0, scaleCandidates: 0, doNow: 0 },
  },
  opportunityOperating: {
    opportunities: [
      {
        rawSignalType: "B2B_DEMAND_SIGNAL", opportunityTitle: "Weekly hotel linen contract", targetCustomerSegment: "hotels",
        sourceQuality: "OWNER_OBSERVED", evidenceStrength: "MODERATE", businessFit: "MODERATE", capacityFit: "UNKNOWN",
        executionReadiness: "NEEDS_DATA", freshness: "FRESH", isTender: false, tenderReadiness: null, winReadiness: "WEAK",
        winReadinessReasons: ["No past-work proof"], proofPackRequirements: ["past-work evidence"],
        prepChecklist: { checklistType: "B2B_OPPORTUNITY_PREP", blockingItems: ["unit economics missing"], managerCollectableItems: ["per-unit cost"], staffCollectableItems: ["staff capacity"], opsIqDraftableItems: ["draft the validation plan"], nextChecklistAction: "Collect: unit economics missing" },
        negativeReasons: ["MISSING_UNIT_ECONOMICS"], nextActionOwner: "MANAGER", recommendedNextStep: "COLLECT_DATA",
        opportunityQuality: "LOW", validationRequired: true, ownerVisibleSummary: "Weekly hotel linen contract (LOW quality; needs data)",
      },
    ],
    topOpportunity: {
      rawSignalType: "B2B_DEMAND_SIGNAL", opportunityTitle: "Weekly hotel linen contract", targetCustomerSegment: "hotels",
      sourceQuality: "OWNER_OBSERVED", evidenceStrength: "MODERATE", businessFit: "MODERATE", capacityFit: "UNKNOWN",
      executionReadiness: "NEEDS_DATA", freshness: "FRESH", isTender: false, tenderReadiness: null, winReadiness: "WEAK",
      winReadinessReasons: ["No past-work proof"], proofPackRequirements: ["past-work evidence"],
      prepChecklist: { checklistType: "B2B_OPPORTUNITY_PREP", blockingItems: ["unit economics missing"], managerCollectableItems: ["per-unit cost"], staffCollectableItems: ["staff capacity"], opsIqDraftableItems: ["draft the validation plan"], nextChecklistAction: "Collect: unit economics missing" },
      negativeReasons: ["MISSING_UNIT_ECONOMICS"], nextActionOwner: "MANAGER", recommendedNextStep: "COLLECT_DATA",
      opportunityQuality: "LOW", validationRequired: true, ownerVisibleSummary: "Weekly hotel linen contract (LOW quality; needs data)",
    },
    clusters: [], topCluster: null, capabilityRecommendations: [],
    summary: { rawSignals: 1, clusters: 1, candidates: 0, tenderCandidates: 0, parkedOrRejected: 0, needsData: 1, ownerReviewRequired: 0, expiredOrStale: 0 },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/owner/now-view")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PAYLOAD) } as Response);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OwnerProcessIntelligencePage", () => {
  it("loads the process-intelligence block, renders the top breakdown, and links back to the Now View", async () => {
    const { container, findByTestId } = render(<OwnerProcessIntelligencePage />);
    await findByTestId("process-intelligence-panel");
    expect(container.textContent ?? "").toMatch(/Escalation response breakdown/i);
    expect(container.textContent ?? "").toMatch(/Reassign the overdue escalations/i);
    // The routed corrections render too, with the owner-approval marker.
    await findByTestId("process-corrections-panel");
    expect(container.textContent ?? "").toMatch(/Recommended corrections/i);
    expect(container.textContent ?? "").toMatch(/Owner approval required/i);
    // The SOP/checklist draft surface renders too.
    await findByTestId("sop-corrections-panel");
    expect(container.textContent ?? "").toMatch(/Proposed SOP \/ checklist changes/i);
    expect(container.textContent ?? "").toMatch(/acceptance\/quality checklist/i);
    // The training/review recommendations render too.
    await findByTestId("training-assignments-panel");
    expect(container.textContent ?? "").toMatch(/Training .* review recommendations/i);
    expect(container.textContent ?? "").toMatch(/Escalation response review/i);
    // The effectiveness ("did the fixes work?") surface renders too.
    await findByTestId("effectiveness-panel");
    expect(container.textContent ?? "").toMatch(/Did the fixes work\?/i);
    expect(container.textContent ?? "").toMatch(/appears to be working/i);
    // The owner workload reduction (executive cockpit) surface renders too.
    await findByTestId("owner-workload-panel");
    expect(container.textContent ?? "").toMatch(/Reduce your workload/i);

    // The approval / auto-action policy surface renders too.
    await findByTestId("approval-policy-panel");
    expect(container.textContent ?? "").toMatch(/What OpsIQ may do without asking/i);

    // The capability-gap / system feature recommendation surface renders too.
    await findByTestId("capability-gap-panel");
    expect(container.textContent ?? "").toMatch(/What OpsIQ should build next/i);
    expect(container.textContent ?? "").toMatch(/Require better proof upfront/i);
    const back = container.querySelector('[data-testid="back-to-now"]') as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/owner/now");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/owner/now-view"))).toBe(true);

    // Executive-cockpit consolidation: the secondary surfaces are grouped in collapsed <details> groups
    // (progressive disclosure / anti-overload), while the primary process breakdown stays outside any group.
    // The cash/profit protection surface renders inside its group too.
    await findByTestId("cash-profit-panel");
    expect(container.textContent ?? "").toMatch(/Protect cash & profit/i);
    // The external opportunity intelligence surface renders inside its group too.
    await findByTestId("opportunity-panel");
    expect(container.textContent ?? "").toMatch(/Grow: opportunities to validate/i);
    // The opportunity validation experiment surface renders inside the same Grow group.
    await findByTestId("validation-panel");
    expect(container.textContent ?? "").toMatch(/Next validation experiment to run/i);
    // The opportunity portfolio / capital-allocation surface renders inside the same Grow group.
    await findByTestId("portfolio-panel");
    expect(container.textContent ?? "").toMatch(/Where capital goes next/i);
    // The structured-intake opportunity operating layer renders inside the same Grow group.
    await findByTestId("operating-panel");
    expect(container.textContent ?? "").toMatch(/Submitted opportunity signals/i);
    for (const gid of ["cockpit-group-cash", "cockpit-group-grow", "cockpit-group-followthrough", "cockpit-group-govern", "cockpit-group-build"]) {
      const grp = await findByTestId(gid);
      expect(grp.tagName.toLowerCase()).toBe("details");
      expect(grp.hasAttribute("open")).toBe(false);
    }
    expect(container.querySelector('[data-testid="process-intelligence-panel"]')!.closest("details")).toBeNull();
  });

  it("shows a safe error (no raw internal detail) when the request fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    const { findByTestId } = render(<OwnerProcessIntelligencePage />);
    const err = await findByTestId("pi-error");
    expect(err.textContent ?? "").toMatch(/not authorized/i);
    expect(err.textContent ?? "").not.toMatch(/stack|Prisma|undefined/i);
  });
});
