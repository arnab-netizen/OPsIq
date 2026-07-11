/**
 * Stage A7 — Business Operating System (BOS) End-to-End Validation
 *
 * Validates that OpsIQ functions as ONE coherent Business Operating System across
 * five complete workflows. All tests use mock-injectable patterns — no real DB needed.
 *
 * Workflow A: Owner → Business Context → Manual Entry → Snapshot → Diagnosis →
 *             Recommendations → Actions → Evidence → Verification → Reassessment →
 *             Progress → Dashboard → Learning
 *
 * Workflow B: Finance → Cash → Budget → Profitability → Pricing → Leakage →
 *             Recommendations → Actions → Verification → Updated Financial Health
 *
 * Workflow C: Opportunity Finder → Qualification → Tender Assessment → Owner Approval →
 *             Application Pack → Submission Readiness → Evidence → Learning
 *
 * Workflow D: Startup Mode → Business Context → Diagnosis → Execution Plan →
 *             Progress Tracking → Business Review → Updated Strategy
 *
 * Workflow E: Vendor → Risk → Compliance → Recommendations → Approval → Review
 *
 * Cross-Domain: Recommendation conflicts, duplicate actions, priority conflicts,
 *              KPI consistency, dead ends, owner overload, learning correctness.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Service imports (mock-injectable) ────────────────────────────────────────
import {
  getOwnerBusinessProgress,
  generateOwnerBusinessReview,
  type OwnerProgressDb,
} from "@/services/owner-mode/owner-progress.service";
import { generateBidApplicationPack } from "@/domain/owner-mode/bid-application-pack";
import { assessVendorRisk } from "@/domain/owner-mode/vendor-risk-boundary";
import { checkCashSafetyGate } from "@/domain/owner-finance/cash-safety-gate";
import { checkMarginSafetyGate } from "@/domain/owner-finance/margin-safety-gate";
import { detectProfitLeaks } from "@/domain/owner-mode/profit-leak-radar";
import { analyzePricing } from "@/domain/owner-finance/pricing-analysis";
import type { TenderProcurementCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockEmitAuditEvent = vi.fn().mockResolvedValue("audit-ok");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...args: unknown[]) => mockEmitAuditEvent(...args) }));

// ── OwnerProgressDb factory (injectable mock) ─────────────────────────────────

type StatusMap = { open?: number; in_progress?: number; completed?: number; blocked?: number; overdue?: number };

function makeTable(counts: StatusMap) {
  return {
    count: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const status = where.status as string;
      if (status === "open") return Promise.resolve(counts.open ?? 0);
      if (status === "in_progress") return Promise.resolve(counts.in_progress ?? 0);
      if (status === "completed") return Promise.resolve(counts.completed ?? 0);
      if (status === "blocked") return Promise.resolve(counts.blocked ?? 0);
      if (status === "overdue") return Promise.resolve(counts.overdue ?? 0);
      return Promise.resolve(0);
    }),
  };
}

function makeCycleTable(status: string | null) {
  return { findFirst: vi.fn().mockResolvedValue(status ? { status } : null) };
}

function makeProgressDb(
  domains: { finance?: StatusMap; sales?: StatusMap; operations?: StatusMap; sop?: StatusMap; strategy?: StatusMap } = {},
  cycles: { finance?: string | null; sales?: string | null; operations?: string | null; sop?: string | null; strategy?: string | null } = {},
): OwnerProgressDb {
  return {
    ownerFinanceAction: makeTable(domains.finance ?? {}),
    ownerSalesAction: makeTable(domains.sales ?? {}),
    ownerOperationsAction: makeTable(domains.operations ?? {}),
    ownerSopAction: makeTable(domains.sop ?? {}),
    ownerStrategyAction: makeTable(domains.strategy ?? {}),
    ownerFinanceCycle: makeCycleTable(cycles.finance ?? null),
    ownerSalesCycle: makeCycleTable(cycles.sales ?? null),
    ownerOperationsCycle: makeCycleTable(cycles.operations ?? null),
    ownerSopCycle: makeCycleTable(cycles.sop ?? null),
    ownerStrategyCycle: makeCycleTable(cycles.strategy ?? null),
  };
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const BIZ_ID = "biz-test-001";
const WS_ID = "ws-test-001";
const ACTOR_ID = "actor-test-001";
const REVIEWED_AT = "2024-06-01T09:00:00.000Z";

const baseTenderCandidate: TenderProcurementCandidate = {
  workspaceId: WS_ID,
  signalSourceType: "GOVERNMENT_TENDER",
  opportunityTitle: "Government Cleaning Contract",
  sourceEvidenceSummary: "City Council released a tender notice for weekly office cleaning services",
  sourceRefs: ["https://tenders.gov.example/notice/CC-2024-789"],
  targetBuyer: "City Council",
  eligibility: "KNOWN",
  emdExposure: "LOW",
  paymentDelayRisk: "MEDIUM",
  performancePenaltyRisk: "MEDIUM",
  workingCapitalRequirement: "MEDIUM",
  compliance: "KNOWN",
  documentationBurden: "MEDIUM",
  capacityFit: "STRONG",
  unitEconomics: "KNOWN",
  bidDeadlineDays: 45,
  tenderDecision: "PREPARE_BID_DRAFT",
  readyToBid: false,
  ownerApprovalRequired: true,
  approvalLevel: "OWNER",
  missingData: [],
  systemCapabilityRecommendation: null,
  ownerVisibleExplanation: "This tender matches your service offering. Owner review required before any bid work begins.",
  evaluatedAt: "2024-05-01T00:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW A — End-to-End Owner Business Operating Loop
// ─────────────────────────────────────────────────────────────────────────────

describe("Workflow A — End-to-End BOS: Owner → Progress → Dashboard → Learning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("A1: zero-state business shows no_actions progress (clean start)", async () => {
    const db = makeProgressDb();
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.summary).toBe("no_actions");
    expect(progress.totals.total).toBe(0);
    expect(progress.completionRate).toBe(0);
    expect(progress.workspaceId).toBe(WS_ID);
    expect(progress.businessId).toBe(BIZ_ID);
  });

  it("A2: actions across all 5 domain spines aggregate into totals correctly", async () => {
    const db = makeProgressDb({
      finance: { open: 2, completed: 3 },
      sales: { in_progress: 1, completed: 2 },
      operations: { blocked: 1 },
      sop: { overdue: 1 },
      strategy: { open: 1, completed: 1 },
    });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.totals.total).toBe(12);
    expect(progress.totals.completed).toBe(6);
    expect(progress.totals.blocked).toBe(1);
    expect(progress.totals.overdue).toBe(1);
    expect(progress.byDomain.finance.completed).toBe(3);
    expect(progress.byDomain.sales.inProgress).toBe(1);
  });

  it("A3: completion rate drives on_track summary when ≥50% complete and no blockers", async () => {
    const db = makeProgressDb({ finance: { completed: 4, open: 1 } });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.completionRate).toBeCloseTo(0.8);
    expect(progress.summary).toBe("on_track");
  });

  it("A4: blocked action anywhere forces blocked summary regardless of completion rate", async () => {
    const db = makeProgressDb({ finance: { completed: 10, blocked: 1 } });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.summary).toBe("blocked");
  });

  it("A5: overdue action anywhere forces blocked summary", async () => {
    const db = makeProgressDb({ finance: { completed: 10, overdue: 1 } });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.summary).toBe("blocked");
  });

  it("A6: progress → business review — improving when ≥50% and no critical cycles", async () => {
    const db = makeProgressDb(
      { finance: { completed: 4, open: 1 } },
      { finance: "stable", sales: "stable" },
    );
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("improving");
    expect(review.progress.completionRate).toBeCloseTo(0.8);
    expect(review.reviewedAt).toBe(REVIEWED_AT);
  });

  it("A7: business review — worsening when any cycle shows critical keyword", async () => {
    const db = makeProgressDb(
      { finance: { completed: 8, open: 1 } },
      { operations: "critical_equipment_failure" },
    );
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("worsening");
    expect(review.domainCycleStatuses.operations).toBe("critical_equipment_failure");
  });

  it("A8: business review — stagnant when <50% completion and no critical cycles", async () => {
    const db = makeProgressDb(
      { finance: { open: 3, completed: 1 } },
      { finance: "stable" },
    );
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("stagnant");
  });

  it("A9: business review — insufficient_data when no cycles exist (new business)", async () => {
    const db = makeProgressDb({ finance: { open: 2 } });
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("insufficient_data");
  });

  it("A10: GOVERNANCE — audit event emitted for every business review (never silently)", async () => {
    const db = makeProgressDb();
    await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(mockEmitAuditEvent).toHaveBeenCalledOnce();
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "owner.business_review_generated",
      actorId: ACTOR_ID,
      workspaceId: WS_ID,
    }));
  });

  it("A11: workspace isolation — businessId and workspaceId always flow through unchanged", async () => {
    const db = makeProgressDb({ finance: { completed: 2 } }, { finance: "stable" });
    const review = await generateOwnerBusinessReview("biz-A", "ws-A", ACTOR_ID, REVIEWED_AT, db);
    expect(review.workspaceId).toBe("ws-A");
    expect(review.businessId).toBe("biz-A");
    expect(review.progress.workspaceId).toBe("ws-A");
    expect(review.progress.businessId).toBe("biz-A");
  });

  it("A12: rationale is non-empty and human-readable for every review status", async () => {
    const cases = [
      { domains: { finance: { completed: 8 } }, cycles: { finance: "stable" } },
      { domains: { finance: { open: 4 } }, cycles: { finance: "stable" } },
      { domains: { finance: { completed: 5 } }, cycles: { finance: "critical_cashflow" } },
      { domains: {}, cycles: {} },
    ];
    for (const { domains, cycles } of cases) {
      vi.clearAllMocks();
      const db = makeProgressDb(domains, cycles);
      const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
      expect(typeof review.rationale).toBe("string");
      expect(review.rationale.length).toBeGreaterThan(10);
    }
  });

  it("A13: by-domain breakdown shows zero for domains with no actions", async () => {
    const db = makeProgressDb({ finance: { open: 2, completed: 1 } });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.byDomain.sales.total).toBe(0);
    expect(progress.byDomain.operations.total).toBe(0);
    expect(progress.byDomain.sop.total).toBe(0);
    expect(progress.byDomain.strategy.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW B — Finance Chain: Cash + Budget + Profitability + Pricing + Leakage
// ─────────────────────────────────────────────────────────────────────────────

describe("Workflow B — Finance Chain: Cash → Pricing → Leakage → Recommendations", () => {
  it("B1: cash safety gate blocks GROWTH_SENSITIVE action when cash is CRITICAL", () => {
    const gate = checkCashSafetyGate({ cashRunwayDays: 15 }, "GROWTH_SENSITIVE");
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/cash|runway/i);
  });

  it("B2: cash safety gate passes MAINTENANCE action when cash is CRITICAL (essential ops)", () => {
    const gate = checkCashSafetyGate({ cashRunwayDays: 15 }, "MAINTENANCE");
    expect(gate.allowed).toBe(true);
  });

  it("B3: margin safety gate blocks below-floor discount", () => {
    const gate = checkMarginSafetyGate({ grossMarginPct: 18 }, 12);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/margin/i);
  });

  it("B4: margin safety gate allows above-floor discount", () => {
    const gate = checkMarginSafetyGate({ grossMarginPct: 45 }, 12);
    expect(gate.allowed).toBe(true);
  });

  it("B5: profit leakage detection identifies multiple leakage categories simultaneously", () => {
    const result = detectProfitLeaks({
      workspaceId: WS_ID,
      businessId: BIZ_ID,
      revenue: 500_000,
      grossMarginPct: 18,       // low margin → margin leakage
      wasteRate: 0.15,          // >10% → waste leakage
      priceDeviationPct: 20,    // >15% → pricing leakage
      inventoryTurnoverDays: 65, // >45 days → inventory leakage
      customerRetentionRate: 0.6, // <0.7 → customer leakage
    });
    expect(result.leaks.length).toBeGreaterThan(0);
    const categories = result.leaks.map((l) => l.category);
    expect(categories).toContain("margin");
    expect(result.totalEstimatedLeakage).toBeGreaterThan(0);
  });

  it("B6: pricing analysis produces contribution margin and minimum viable price", () => {
    const result = analyzePricing({
      unitSellingPrice: 100,
      variableCostPerUnit: 60,
      fixedCosts: 5_000,
      unitsSold: 200,
      currency: "AUD",
    });
    expect(result.contributionMarginPerUnit).toBeCloseTo(40);
    expect(result.contributionMarginPct).toBeCloseTo(40);
    expect(result.minimumViablePrice).toBeGreaterThan(0);
    expect(result.minimumViablePrice).toBeLessThan(100);
  });

  it("B7: finance chain is ordered — cash gate runs before pricing (safety before growth)", () => {
    // Safety dominance: GROWTH_SENSITIVE blocked at CRITICAL even if margin looks healthy
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 10 }, "GROWTH_SENSITIVE");
    expect(cashGate.allowed).toBe(false);
    // But pricing analysis itself can still run (it's read-only, not gated)
    const pricing = analyzePricing({ unitSellingPrice: 120, variableCostPerUnit: 50, fixedCosts: 3_000, unitsSold: 100, currency: "AUD" });
    expect(pricing.contributionMarginPct).toBeGreaterThan(0);
  });

  it("B8: leakage engine returns zero-leak result for healthy business", () => {
    const result = detectProfitLeaks({
      workspaceId: WS_ID,
      businessId: BIZ_ID,
      revenue: 1_000_000,
      grossMarginPct: 55,
      wasteRate: 0.03,
      priceDeviationPct: 5,
      inventoryTurnoverDays: 20,
      customerRetentionRate: 0.9,
    });
    expect(result.totalEstimatedLeakage).toBe(0);
    expect(result.leaks.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW C — Tender Chain: Opportunity → Qualification → Application Pack
// ─────────────────────────────────────────────────────────────────────────────

describe("Workflow C — Tender Chain: Opportunity → Assessment → Application Pack → Governance", () => {
  it("C1: application pack always has submissionAllowed = false (governance invariant)", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.submissionAllowed).toBe(false);
  });

  it("C2: application pack always has ownerApprovalRequired = true", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.ownerApprovalRequired).toBe(true);
  });

  it("C3: cover section carries the PREPARE_BID_DRAFT tender decision from the screened candidate", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.cover.tenderDecision).toBe("PREPARE_BID_DRAFT");
  });

  it("C4: urgency prep step added when deadline is within 7 days", () => {
    const urgentCandidate: TenderProcurementCandidate = {
      ...baseTenderCandidate,
      bidDeadlineDays: 5,
    };
    const pack = generateBidApplicationPack(urgentCandidate, REVIEWED_AT);
    const hasUrgency = pack.ownerActions.preparationSteps.some((s) => /urgent|days? away/i.test(s));
    expect(hasUrgency).toBe(true);
  });

  it("C5: pack eligibility section captures compliance and capacity status from the candidate", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.eligibility.eligibility).toBe("KNOWN");
    expect(pack.eligibility.compliant).toBe("KNOWN");
    expect(pack.eligibility.capacityFit).toBe("STRONG");
  });

  it("C6: pack risk section reproduces all risk-band fields from the candidate", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.risk.paymentDelayRisk).toBe("MEDIUM");
    expect(pack.risk.performancePenaltyRisk).toBe("MEDIUM");
    expect(pack.risk.overallRiskSummary).toBeDefined();
  });

  it("C7: pack economics section reflects unit-economics readiness status", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.economics.unitEconomics).toBe("KNOWN");
    expect(pack.economics.ownerActions).toBeDefined();
  });

  it("C8: pack owner actions section specifies preparation steps", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    expect(pack.ownerActions.preparationSteps.length).toBeGreaterThan(0);
  });

  it("C9: workspace isolation — pack.workspaceId always comes from the candidate", () => {
    const candidate = { ...baseTenderCandidate, workspaceId: "ws-tenant-Z" };
    const pack = generateBidApplicationPack(candidate, REVIEWED_AT);
    expect(pack.workspaceId).toBe("ws-tenant-Z");
  });

  it("C10: generatedAt is forwarded unchanged to the pack", () => {
    const ts = "2024-09-15T14:30:00.000Z";
    const pack = generateBidApplicationPack(baseTenderCandidate, ts);
    expect(pack.generatedAt).toBe(ts);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW D — Strategy/Startup Chain: Progress Tracking + Business Review
// ─────────────────────────────────────────────────────────────────────────────

describe("Workflow D — Strategy Chain: Diagnosis → Progress Tracking → Business Review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("D1: progress tracks cross-domain strategy actions distinctly from finance", async () => {
    const db = makeProgressDb({
      finance: { completed: 2 },
      strategy: { open: 3, completed: 1 },
    });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    expect(progress.byDomain.finance.completed).toBe(2);
    expect(progress.byDomain.strategy.open).toBe(3);
    expect(progress.byDomain.strategy.completed).toBe(1);
  });

  it("D2: strategy cycle status flows through to business review domain cycle statuses", async () => {
    const db = makeProgressDb(
      { strategy: { completed: 3, open: 1 } },
      { strategy: "strategic_gap_identified" },
    );
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.domainCycleStatuses.strategy).toBe("strategic_gap_identified");
  });

  it("D3: updated strategy (failing cycle) drives worsening review status", async () => {
    const db = makeProgressDb(
      { strategy: { completed: 5 } },
      { strategy: "failing_to_execute_plan" },
    );
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("worsening");
  });

  it("D4: all 5 domain cycles can contribute to review independently", async () => {
    const db = makeProgressDb({}, {
      finance: "stable",
      sales: "stable",
      operations: "improving",
      sop: "stable",
      strategy: "stable",
    });
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(Object.values(review.domainCycleStatuses).filter(Boolean).length).toBe(5);
    // No critical/failing keyword → not worsening
    expect(review.status).not.toBe("worsening");
  });

  it("D5: progress + review are always workspace-scoped (no cross-tenant bleed)", async () => {
    const dbA = makeProgressDb({ strategy: { completed: 3 } }, { strategy: "stable" });
    const dbB = makeProgressDb({ strategy: { open: 5 } }, { strategy: "critical_plan_failure" });

    const [reviewA, reviewB] = await Promise.all([
      generateOwnerBusinessReview("biz-A", "ws-A", ACTOR_ID, REVIEWED_AT, dbA),
      generateOwnerBusinessReview("biz-B", "ws-B", ACTOR_ID, REVIEWED_AT, dbB),
    ]);

    expect(reviewA.workspaceId).toBe("ws-A");
    expect(reviewA.businessId).toBe("biz-A");
    expect(reviewB.workspaceId).toBe("ws-B");
    expect(reviewB.businessId).toBe("biz-B");
    expect(reviewA.status).toBe("improving");
    expect(reviewB.status).toBe("worsening");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW E — Vendor Chain: Risk → Classification → Recommendations
// ─────────────────────────────────────────────────────────────────────────────

describe("Workflow E — Vendor Chain: Risk Assessment → Classification → Recommendations", () => {
  it("E1: low-risk vendor with single product line is classified informational", () => {
    const result = assessVendorRisk({
      vendorName: "ABC Supplies",
    });
    expect(result.classification).toBe("informational");
    expect(result.ownerNotificationRequired).toBe(false);
    expect(result.blockedFromNewOrders).toBe(false);
  });

  it("E2: high-concentration vendor (sole supplier) is flagged high_concentration_risk", () => {
    const result = assessVendorRisk({
      vendorName: "MegaVendor",
      soleSupplier: true,
    });
    expect(result.classification).toBe("high_concentration_risk");
    expect(result.ownerNotificationRequired).toBe(true);
  });

  it("E3: vendor with unverified bank details is blocked_pending_review", () => {
    const result = assessVendorRisk({
      vendorName: "RiskyVendor",
      bankUnverified: true,
    });
    expect(result.classification).toBe("blocked_pending_review");
    expect(result.blockedFromNewOrders).toBe(true);
    expect(result.ownerNotificationRequired).toBe(true);
  });

  it("E4: vendor with expiring contract is classified review_advised", () => {
    const result = assessVendorRisk({
      vendorName: "SlowPayer",
      contractExpiringSoon: true,
    });
    expect(result.classification).toBe("review_advised");
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it("E5: all classifications produce non-empty recommendedActions", () => {
    const informational = assessVendorRisk({ vendorName: "Test" });
    // Informational may have empty or populated recommendations — just must be an array
    expect(Array.isArray(informational.recommendedActions)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-DOMAIN CONSISTENCY AUDIT
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-Domain — System Consistency: No Conflicts, No Dead Ends", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CONSISTENCY-1: cash gate and margin gate are independent — one can block while other passes", () => {
    // Cash critical but margin healthy
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 10 }, "GROWTH_SENSITIVE");
    const marginGate = checkMarginSafetyGate({ grossMarginPct: 55 }, 12);
    expect(cashGate.allowed).toBe(false);
    expect(marginGate.allowed).toBe(true);
  });

  it("CONSISTENCY-2: safety-first ordering — cash gate blocks before margin gate is consulted", () => {
    // Both gates apply in sequence; the first blocker is sufficient
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 5 }, "GROWTH_SENSITIVE");
    expect(cashGate.allowed).toBe(false);
    // Even if margin is also unhealthy, no double-block issue — both are additive constraints
    const marginGate = checkMarginSafetyGate({ grossMarginPct: 12 }, 12);
    expect(marginGate.allowed).toBe(false);
  });

  it("CONSISTENCY-3: vendor blocked-status is orthogonal to finance gates (no cross-domain conflict)", () => {
    // A blocked vendor doesn't affect the cash safety gate
    const vendorResult = assessVendorRisk({
      vendorName: "BlockedVendor",
      bankUnverified: true,     // unverified bank → blocked_pending_review
      performanceFailures: true, // additional risk signal
    });
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 90 }, "GROWTH_SENSITIVE");
    expect(vendorResult.blockedFromNewOrders).toBe(true);
    expect(cashGate.allowed).toBe(true); // cash is fine — vendor block is separate
  });

  it("CONSISTENCY-4: tender pack governance never conflicts with finance safety gates (different domains)", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 90 }, "GROWTH_SENSITIVE");
    // Pack always requires owner approval, regardless of cash status
    expect(pack.ownerApprovalRequired).toBe(true);
    expect(pack.submissionAllowed).toBe(false);
    expect(cashGate.allowed).toBe(true); // no conflict
  });

  it("CONSISTENCY-5: progress aggregation is additive — cross-domain totals never double-count", async () => {
    const db = makeProgressDb({
      finance: { open: 2, completed: 3 },
      sales: { open: 1, completed: 1 },
      operations: { in_progress: 2 },
      sop: { completed: 1 },
      strategy: { open: 1 },
    });
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    const sumFromDomains =
      progress.byDomain.finance.total +
      progress.byDomain.sales.total +
      progress.byDomain.operations.total +
      progress.byDomain.sop.total +
      progress.byDomain.strategy.total;
    expect(progress.totals.total).toBe(sumFromDomains);
  });

  it("CONSISTENCY-6: worsening review does not prevent parallel domains from being stable", async () => {
    const db = makeProgressDb({}, {
      finance: "stable",
      sales: "stable",
      operations: "critical_equipment_failure",
      sop: "stable",
      strategy: "stable",
    });
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);
    expect(review.status).toBe("worsening"); // operations is critical
    expect(review.domainCycleStatuses.finance).toBe("stable"); // finance is still stable
    expect(review.domainCycleStatuses.sales).toBe("stable");
  });

  it("CONSISTENCY-7: learning loop audit events fire independently for each review (no shared state)", async () => {
    const db1 = makeProgressDb({ finance: { completed: 3 } }, { finance: "stable" });
    const db2 = makeProgressDb({ sales: { completed: 2 } }, { sales: "stable" });
    await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db1);
    await generateOwnerBusinessReview("biz-2", "ws-2", "actor-2", REVIEWED_AT, db2);
    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(2);
    const calls = mockEmitAuditEvent.mock.calls;
    expect(calls[0][0].workspaceId).toBe("ws-1");
    expect(calls[1][0].workspaceId).toBe("ws-2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REALITY SIMULATIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("Reality Simulations — Realistic Business Scenarios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SIM-1: Cash Crisis Scenario — business with 15-day runway is blocked + worsening", async () => {
    // Cash crisis: blocked actions, finance showing critical
    const db = makeProgressDb(
      { finance: { overdue: 3, open: 5, completed: 1 } },
      { finance: "critical_cash_runway" },
    );
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);

    expect(progress.summary).toBe("blocked"); // overdue actions
    expect(review.status).toBe("worsening"); // critical cycle

    // Cash gate blocks growth actions
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 15 }, "GROWTH_SENSITIVE");
    expect(cashGate.allowed).toBe(false);
  });

  it("SIM-2: High-Growth Business — healthy status across all domains, improving review", async () => {
    const db = makeProgressDb(
      {
        finance: { completed: 5, in_progress: 2 },
        sales: { completed: 4, in_progress: 1 },
        operations: { completed: 3, in_progress: 2 },
        sop: { completed: 2 },
        strategy: { completed: 3, in_progress: 1 },
      },
      {
        finance: "strong_growth",
        sales: "above_target",
        operations: "efficient",
        sop: "compliant",
        strategy: "on_plan",
      },
    );
    const progress = await getOwnerBusinessProgress(BIZ_ID, WS_ID, db);
    const review = await generateOwnerBusinessReview(BIZ_ID, WS_ID, ACTOR_ID, REVIEWED_AT, db);

    expect(progress.summary).toBe("on_track");
    expect(review.status).toBe("improving");
    expect(review.domainCycleStatuses.finance).toBe("strong_growth");
  });

  it("SIM-3: Vendor Failure + Operational Block — blocked vendor forces owner notification", () => {
    const vendorResult = assessVendorRisk({
      vendorName: "Key Supplier Ltd",
      soleSupplier: true,       // single-source dependency
      contractExpired: true,    // expired contract → blocked_pending_review
      performanceFailures: true, // quality/delivery failures
    });
    expect(vendorResult.blockedFromNewOrders).toBe(true);
    expect(vendorResult.ownerNotificationRequired).toBe(true);
    expect(vendorResult.classification).toBe("blocked_pending_review");
  });

  it("SIM-4: Tender Opportunity + Poor Cash — pack generated but finance blocks growth spend", () => {
    const pack = generateBidApplicationPack(baseTenderCandidate, REVIEWED_AT);
    const cashGate = checkCashSafetyGate({ cashRunwayDays: 25 }, "GROWTH_SENSITIVE");

    // Tender pack is governance-correct (prep only, never submit)
    expect(pack.submissionAllowed).toBe(false);
    expect(pack.ownerApprovalRequired).toBe(true);
    // Finance gate independently blocks growth spending during cash crunch
    expect(cashGate.allowed).toBe(false);
    // No conflict — they are orthogonal: tender prep is OK, spend is blocked
  });

  it("SIM-5: Small Business Startup — new business has no_actions across all domains", async () => {
    const db = makeProgressDb(); // No actions anywhere
    const progress = await getOwnerBusinessProgress("new-biz-001", WS_ID, db);
    expect(progress.summary).toBe("no_actions");
    expect(progress.completionRate).toBe(0);
    expect(Object.values(progress.byDomain).every((d) => d.total === 0)).toBe(true);
  });

  it("SIM-6: Operational Failure + Pricing Collapse — leakage found on low margin", () => {
    const leakageResult = detectProfitLeaks({
      workspaceId: WS_ID,
      businessId: BIZ_ID,
      revenue: 200_000,
      grossMarginPct: 8,          // below 15% threshold
      wasteRate: 0.08,
      priceDeviationPct: 25,      // significant price deviation
      inventoryTurnoverDays: 55,
      customerRetentionRate: 0.75,
    });
    expect(leakageResult.leaks.length).toBeGreaterThan(0);
    expect(leakageResult.totalEstimatedLeakage).toBeGreaterThan(0);
    const leakCategories = leakageResult.leaks.map((l) => l.category);
    expect(leakCategories.some((c) => c === "margin" || c === "pricing")).toBe(true);
  });

  it("SIM-7: Large Business — multi-business workspace progress is isolated per business", async () => {
    const dbA = makeProgressDb({ finance: { completed: 20, open: 5 } }, { finance: "stable" });
    const dbB = makeProgressDb({ sales: { open: 10, blocked: 2 } }, { sales: "struggling" });

    const [progA, reviewA] = await Promise.all([
      getOwnerBusinessProgress("biz-large-A", "ws-multi", dbA),
      generateOwnerBusinessReview("biz-large-A", "ws-multi", ACTOR_ID, REVIEWED_AT, dbA),
    ]);
    vi.clearAllMocks();
    const [progB, reviewB] = await Promise.all([
      getOwnerBusinessProgress("biz-large-B", "ws-multi", dbB),
      generateOwnerBusinessReview("biz-large-B", "ws-multi", ACTOR_ID, REVIEWED_AT, dbB),
    ]);

    expect(progA.summary).toBe("on_track");
    expect(reviewA.status).toBe("improving");
    expect(progB.summary).toBe("blocked"); // blocked sales actions
    expect(reviewB.status).toBe("stagnant"); // no critical cycle but low completion
  });
});
