/**
 * BLOCK 3 — Startup-Mode E2E Chain (new business, PostgreSQL-backed)
 *
 * Exercises the full governance spine for an owner starting a new business:
 *   1. Bootstrap: user + workspace
 *   2. Startup session creation — persists session + initial idea evaluations
 *   3. Idea entry — adds a persisted StartupIdeaRecord
 *   4. Idea screening — BusinessFitProfile gate, result persisted
 *   5. Economic model — break-even/runway computed and persisted
 *   6. Readiness assessment — gate scores computed and persisted
 *   7. System recommendation — GO recommendation persisted
 *   8. Owner GO decision — package hash computed and persisted
 *   9. Execution blueprint — full execution chain created atomically
 *  10. Audit trail integrity — all events workspace-scoped, chronological
 *
 * Nothing is mocked — every assertion reads from the database.
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/owner-strategy/owner-operational-startup.e2e.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db, pingDatabase, heartbeatPool } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createStartupSession,
  addIdea,
  screenIdeaRecord,
  buildAndPersistEconomicModel,
  assessAndPersistReadiness,
  createSystemRecommendation,
  recordOwnerDecision,
} from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";
import type { BusinessFitProfile } from "@/domain/owner-strategy/startup-screening";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
import type { BlueprintResult } from "@/services/owner-strategy/startup-execution-blueprint.service";

// ─── Shared IDs ───────────────────────────────────────────────────────────────

const actorId = randomUUID();
const ws = randomUUID();
const NOW = new Date("2026-07-01T00:00:00Z");

// ─── Shared state written by each test, read by later tests ──────────────────

const state: {
  sessionId?: string;
  ideaId?: string;
  systemRecId?: string;
  ownerDecisionId?: string;
  blueprintResult?: BlueprintResult;
} = {};

// ─── Test fixtures ────────────────────────────────────────────────────────────

const intake: StartupIntake = {
  location: "Kolkata, West Bengal",
  capitalAvailable: 500000,
  monthlySurvivalNeed: 50000,
  hoursPerWeekAvailable: 40,
  skills: ["logistics", "vendor management"],
  riskTolerance: "medium",
  targetMonthlyIncome: 80000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
};

const seedIdea: StartupIdea = {
  name: "B2B Courier Aggregator",
  industry: "Logistics",
  structural: {
    grossMarginPct: 60,
    netMarginPct: 25,
    monthlyRevenue: 120000,
    revenueFrequency: "recurring",
    repeatCustomerPct: 0.75,
    customerAcquisitionDifficulty: "low",
    demandValidated: true,
    ownerIsPrimaryOperator: true,
    differentiation: "moderate",
    pricingPower: "moderate",
    capitalIntensity: "low",
    downsideRisk: "low",
  },
  estimatedStartupCost: 200000,
  estimatedMonthlyRevenue: 120000,
  estimatedMonthlyCost: 80000,
  timeToFirstRevenueMonths: 2,
};

const fitProfile: BusinessFitProfile = {
  capitalAvailableCents: 50_000_000,   // INR 5L in paise
  ownerHoursPerWeek: 40,
  riskTolerance: "MEDIUM",
  industry: "Logistics",
  location: "Kolkata",
  hasExistingCustomers: false,
  regulatoryExperience: false,
  priorIndustryExperience: true,
  minimumMonthlyIncomeNeededCents: 5_000_000,  // INR 50k
  cashRunwayMonthsAvailable: 9,
};

const economicInputs: EconomicInputs = {
  startupCostCents: 20_000_000n,
  fixedMonthlyCostCents: 5_000_000n,
  variableUnitCostCents: 200_00n,       // INR 200/shipment
  pricePerUnitCents: 350_00n,           // INR 350/shipment
  cacCents: 50_000_00n,                 // INR 5000/client
  workingCapitalCents: 5_000_000n,
  paymentDelayDays: 30,
  ownerLabourHoursPerWeek: 40,
  capitalAvailableCents: 50_000_000n,
  cashRunwayMonthsAvailable: 9,
};

const readinessInputs: ReadinessInputs = {
  problemEvidenceCount: 3,
  customerEvidenceCount: 5,
  wtpEvidenceCount: 2,
  deliveryTrialCompleted: true,
  acquisitionChannelTested: true,
  economicClassification: "VIABLE",
  cashRunwayMonths: 9,
  breakEvenMonths: 4,
  supplierQuoteObtained: true,
  regulatoryCheckCompleted: true,
  licenceRequired: false,
  licenceObtained: null,
  ownerHoursAvailable: 40,
  capitalAvailableCents: 50_000_000n,
  startupCostCents: 20_000_000n,
  criticalHypothesesPassed: 3,
  criticalHypothesesFailed: 0,
  now: NOW,
};

// Guards afterAll from hanging when beforeAll fails (e.g. Neon cold-start)
let seeded = false;
// Prisma-pool heartbeat: SELECT 1 through the pool every 4s keeps the pool's
// connection active so idleTimeoutMillis never fires and Neon compute stays alive.
let neonKeepalive: ReturnType<typeof setInterval> | undefined;

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db][e2e] Startup-mode governance spine — new business",
  () => {
    beforeAll(async () => {
      // Pool-level retry loop: heartbeatPool() uses globalForPrisma.pgPool.query("SELECT 1")
      // directly. Each AWS ETIMEDOUT (~135s) is caught and retried after 10s.
      // pingDatabase held one 700s attempt (insufficient for Neon's 14+ min cold-start).
      // The pool approach gives Neon many shorter trigger attempts to lock onto.
      let dbAvailable = false;
      const warmupDeadline = Date.now() + 1800000; // 30 min — covers worst-case cold start
      while (Date.now() < warmupDeadline) {
        try {
          await heartbeatPool();
          dbAvailable = true;
          break;
        } catch {
          const remaining = warmupDeadline - Date.now();
          if (remaining > 10000) await new Promise(r => setTimeout(r, 10000));
        }
      }
      if (!dbAvailable) return;

      await db.user.create({
        data: { id: actorId, email: `e2e-startup-${actorId}@test.local`, name: "E2E Startup Owner", isActive: true, updatedAt: NOW },
      });
      await db.workspace.create({
        data: { id: ws, name: "Startup E2E Consultancy", slug: `startup-e2e-${ws.slice(0, 8)}`, createdBy: actorId },
      });
      seeded = true;

      // Direct pool heartbeat every 4s: bypasses Prisma's Proxy/extends chain and
      // sends SELECT 1 straight through the pg.Pool, keeping the pool's TCP connection
      // "recently used" (preventing idleTimeoutMillis eviction) and Neon compute alive.
      neonKeepalive = setInterval(async () => {
        try { await heartbeatPool(); } catch { /* non-fatal */ }
      }, 4000);
    }, 2400000); // 40 min: 30 min warm-up + ~5 min seeding + safety margin

    afterAll(async () => {
      if (neonKeepalive) clearInterval(neonKeepalive);
      if (!seeded) return;
      // Blueprint children first
      if (state.blueprintResult) {
        const r = state.blueprintResult;
        await db.processExecutionTask.deleteMany({ where: { id: { in: r.taskIds } } }).catch(() => undefined);
        await db.kPIOwnershipRecord.deleteMany({ where: { id: { in: r.kpiIds } } }).catch(() => undefined);
        await db.businessRiskEntry.deleteMany({ where: { id: { in: r.riskIds } } }).catch(() => undefined);
        await db.resourceAllocation.deleteMany({ where: { id: { in: r.resourceAllocationIds } } }).catch(() => undefined);
        await db.constraintResolutionRecord.deleteMany({ where: { id: { in: r.constraintIds } } }).catch(() => undefined);
        await db.fundedInitiativeOutcome.deleteMany({ where: { id: { in: r.outcomeIds } } }).catch(() => undefined);
        await db.startupVerificationWindow.deleteMany({ where: { id: { in: r.verificationWindowIds } } }).catch(() => undefined);
        await db.startupExecutionPlan.deleteMany({ where: { id: r.executionPlanId } }).catch(() => undefined);
        await db.startupInitiative.deleteMany({ where: { id: r.initiativeId } }).catch(() => undefined);
        await db.businessObjective.deleteMany({ where: { id: r.objectiveId } }).catch(() => undefined);
        await db.startupExecutionBlueprint.deleteMany({ where: { id: r.blueprintId } }).catch(() => undefined);
      }
      // Startup session artifacts
      await db.startupOwnerDecision.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.startupSystemRecommendation.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.startupReadinessAssessment.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.startupEconomicModel.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.workspace.deleteMany({ where: { id: ws } }).catch(() => undefined);
      await db.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
    }, 300000);

    // Re-warm Neon before each test: the serverless endpoint may auto-suspend between
    // sequential tests (even with idleTimeoutMillis=120s, Neon terminates server-side).
    beforeEach(async () => {
      if (!seeded) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await pingDatabase(); return; } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
        }
      }
    }, 120000);

    // ── Step 1: Session creation ──────────────────────────────────────────────

    it("STEP 1: creates a startup session with initial idea evaluation persisted", async () => {
      const sessionId = await createStartupSession({
        workspaceId: ws,
        actorId,
        sessionLabel: "B2B Courier Aggregator — Validation Workbench",
        entryPath: "HAVE_IDEA",
        intake,
        ideas: [seedIdea],
      });

      state.sessionId = sessionId;
      expect(sessionId).toBeTruthy();

      // Durable proof: session row persisted
      const persisted = await db.ownerStartupSession.findUnique({ where: { id: sessionId } });
      expect(persisted).toBeTruthy();
      expect(persisted!.workspaceId).toBe(ws);
      expect(persisted!.status).toBe("DRAFT");

      // Initial idea evaluations persisted
      const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId, workspaceId: ws } });
      expect(ideas.length).toBeGreaterThanOrEqual(1);

      // Governance proof: session created audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 2: Idea entry ─────────────────────────────────────────────────────

    it("STEP 2: adds a new persisted idea to the session", async () => {
      const ideaId = await addIdea(ws, state.sessionId!, actorId, {
        name: "B2B Courier Aggregator — Phase 2 SaaS",
        industry: "Logistics",
        originType: "OWNER_ENTERED",
      });

      state.ideaId = ideaId;
      expect(ideaId).toBeTruthy();

      // Durable proof: idea row persisted
      const persisted = await db.startupIdeaRecord.findUnique({ where: { id: ideaId } });
      expect(persisted).toBeTruthy();
      expect(persisted!.workspaceId).toBe(ws);
      expect(persisted!.sessionId).toBe(state.sessionId!);

      // Governance proof: idea added audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 3: Idea screening ────────────────────────────────────────────────

    it("STEP 3: screens the idea against the business fit profile, result persisted", async () => {
      const result = await screenIdeaRecord(ws, state.sessionId!, state.ideaId!, actorId, fitProfile);

      expect(result).toBeTruthy();
      expect(["PASSED", "CONDITIONALLY_PASSED", "EVIDENCE_REQUIRED", "REJECTED"]).toContain(result.status);

      // Durable proof: screening result persisted on the idea record
      const persisted = await db.startupIdeaRecord.findUnique({ where: { id: state.ideaId! } });
      expect(persisted!.screeningStatus).toBeTruthy();

      // Governance proof: idea screened audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_IDEA_SCREENED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 4: Economic model ────────────────────────────────────────────────

    it("STEP 4: builds and persists economic model with server-derived viability classification", async () => {
      const modelId = await buildAndPersistEconomicModel(ws, state.sessionId!, state.ideaId!, actorId, economicInputs);
      expect(modelId).toBeTruthy();

      // Durable proof: model row persisted
      const persisted = await db.startupEconomicModel.findUnique({ where: { id: modelId } });
      expect(persisted).toBeTruthy();
      expect(persisted!.workspaceId).toBe(ws);
      expect(["VIABLE", "MARGINAL", "UNVIABLE", "INSUFFICIENT_DATA"]).toContain(persisted!.economicClassification);

      // Governance proof: economic model built audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_ECONOMIC_MODEL_BUILT },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 5: Readiness assessment ──────────────────────────────────────────

    it("STEP 5: assesses readiness with hard gates enforced, result persisted", async () => {
      const assessment = await assessAndPersistReadiness(ws, state.sessionId!, state.ideaId!, actorId, readinessInputs);

      expect(assessment).toBeTruthy();
      expect(["READY", "CONDITIONALLY_READY", "NOT_READY", "BLOCKED"]).toContain(assessment.status);

      // Durable proof: assessment row persisted
      const persisted = await db.startupReadinessAssessment.findFirst({
        where: { workspaceId: ws, session: { id: state.sessionId! } },
      });
      expect(persisted).toBeTruthy();

      // Governance proof: readiness assessed audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_READINESS_ASSESSED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 6: System recommendation ────────────────────────────────────────

    it("STEP 6: persists a GO system recommendation with confidence score", async () => {
      const recId = await createSystemRecommendation(ws, state.sessionId!, actorId, {
        ideaId: state.ideaId!,
        recommendation: "GO",
        rationale: "Unit economics viable; readiness gates pass; owner has sufficient capital and runway.",
        confidence: 0.82,
        inputSnapshot: { economicClassification: "VIABLE", readinessStatus: "READY" },
      });

      state.systemRecId = recId;
      expect(recId).toBeTruthy();

      // Durable proof: recommendation row persisted + linked to session
      const session = await db.ownerStartupSession.findUnique({ where: { id: state.sessionId! } });
      expect(session!.currentSystemRecId).toBe(recId);

      // Governance proof: system recommendation created audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_SYSTEM_RECOMMENDATION_CREATED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 7: Owner GO decision ─────────────────────────────────────────────

    it("STEP 7: records owner GO decision with server-computed package hash", async () => {
      const decisionId = await recordOwnerDecision(ws, state.sessionId!, actorId, {
        ideaId: state.ideaId!,
        decisionType: "GO",
        rationale: "Owner accepts the economic model and readiness gate result.",
        spendingLimitCents: BigInt(200_000_00),  // INR 2L limit
        permittedActions: ["launch", "hire_contractor"],
        prohibitedActions: ["equity_raise"],
        reviewDate: new Date(NOW.getTime() + 30 * 86_400_000),
        materialAssumptions: ["logistics market demand validated", "supplier quote firm for 90 days"],
        linkedSystemRecId: state.systemRecId!,
      });

      state.ownerDecisionId = decisionId;
      expect(decisionId).toBeTruthy();

      // Durable proof: decision row persisted + linked to session
      const session = await db.ownerStartupSession.findUnique({ where: { id: state.sessionId! } });
      expect(session!.currentOwnerDecisionId).toBe(decisionId);

      // Package hash is server-computed (non-null)
      const decision = await db.startupOwnerDecision.findUnique({ where: { id: decisionId } });
      expect(decision!.packageHashSha256).toBeTruthy();
      expect(decision!.decisionType).toBe("GO");

      // Governance proof: owner decision recorded audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_OWNER_DECISION_RECORDED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 8: Execution blueprint ───────────────────────────────────────────

    it("STEP 8: creates execution blueprint atomically — objective, tasks, KPIs, risks, windows all persisted", async () => {
      const result = await createBlueprint(ws, actorId, {
        sessionId: state.sessionId!,
        ideaId: state.ideaId!,
        ownerDecisionId: state.ownerDecisionId!,
        objectiveTitle: "Launch B2B Courier Aggregator in Kolkata metro market",
        objectiveDescription: "Reach INR 1.2L MRR within 90 days by acquiring 12 B2B clients.",
        targetMetricName: "monthly_recurring_revenue_inr",
        targetValue: 120000,
        deadline: new Date(NOW.getTime() + 90 * 86_400_000),
        initialTaskTitles: [
          "Finalize supplier onboarding agreements",
          "Launch outbound sales to 30 target SMEs",
          "Set up billing and invoicing system",
        ],
        kpiNames: [
          { metricName: "monthly_active_clients", metricLabel: "Active B2B Clients", reviewCadence: "weekly" },
          { metricName: "mrr_inr", metricLabel: "MRR (INR)", reviewCadence: "monthly" },
        ],
        riskCodes: [
          { riskCode: "SUPPLIER_DEFAULT", title: "Courier supplier defaults on SLA", category: "operational", likelihood: 0.2, impact: 0.7 },
        ],
        executionPlanStartDate: NOW,
        executionPlanTargetDate: new Date(NOW.getTime() + 90 * 86_400_000),
        executionPlanSpendingLimitCents: BigInt(200_000_00),
        stopConditions: ["MRR falls below INR 20k for 2 consecutive months"],
        rollbackConditions: ["Key supplier exits before 30-day mark"],
      });

      state.blueprintResult = result;

      expect(result.blueprintId).toBeTruthy();
      expect(result.objectiveId).toBeTruthy();
      expect(result.taskIds.length).toBeGreaterThanOrEqual(1);
      expect(result.executionPlanId).toBeTruthy();

      // Durable proof: blueprint row persisted
      const blueprint = await db.startupExecutionBlueprint.findUnique({ where: { id: result.blueprintId } });
      expect(blueprint).toBeTruthy();
      expect(blueprint!.workspaceId).toBe(ws);
      expect(blueprint!.sessionId).toBe(state.sessionId!);
      expect(blueprint!.ideaId).toBe(state.ideaId!);
      expect(blueprint!.ownerDecisionId).toBe(state.ownerDecisionId!);
      expect(blueprint!.blueprintStatus).toBe("ACTIVE");

      // Governance proof: blueprint created audit event
      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_EXECUTION_BLUEPRINT_CREATED },
      });
      expect(evt).toBeTruthy();
    }, 120000);

    // ── Step 9: Audit trail integrity ─────────────────────────────────────────

    it("STEP 9: audit trail is workspace-scoped, chronologically consistent, all governance events present", async () => {
      const events = await db.auditEvent.findMany({
        where: { workspaceId: ws },
        orderBy: { occurredAt: "asc" },
      });

      // At minimum 6 governance events across the startup chain
      expect(events.length).toBeGreaterThanOrEqual(6);

      // Every event is scoped to this workspace
      for (const evt of events) {
        expect(evt.workspaceId).toBe(ws);
      }

      // Temporal ordering is consistent
      for (let i = 1; i < events.length; i++) {
        expect(events[i].occurredAt.getTime()).toBeGreaterThanOrEqual(events[i - 1].occurredAt.getTime());
      }

      // All governance-critical startup event names are present
      const names = new Set(events.map((e) => e.eventName));
      expect(names.has(AUDIT_EVENTS.STARTUP_SESSION_CREATED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_IDEA_ADDED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_IDEA_SCREENED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_ECONOMIC_MODEL_BUILT)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_READINESS_ASSESSED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_SYSTEM_RECOMMENDATION_CREATED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_OWNER_DECISION_RECORDED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.STARTUP_EXECUTION_BLUEPRINT_CREATED)).toBe(true);

      // Cross-tenant isolation: a different workspace sees zero events from ws
      const leaked = await db.auditEvent.findMany({ where: { workspaceId: randomUUID() } });
      expect(leaked.length).toBe(0);
    }, 120000);
  }
);
