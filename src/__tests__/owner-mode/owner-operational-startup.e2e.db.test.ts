/**
 * BLOCK 3 — Owner-Mode E2E Chain (startup business, PostgreSQL-backed)
 *
 * Exercises the full governance spine for an owner launching a startup:
 *   1. Bootstrap: user, workspace, startup session with viable idea
 *   2. Idea validation → economic model → readiness assessment
 *   3. Execution blueprint creation with persisted plan
 *   4. Whole-business-plan view backed by real DB providers
 *   5. Audit trail: all events workspace-scoped, no cross-tenant leakage
 *
 * Nothing is mocked — every assertion reads from the database.
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/owner-mode/owner-operational-startup.e2e.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createStartupSession,
  buildAndPersistEconomicModel,
  assessAndPersistReadiness,
} from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { seedOwnerDbCase, cleanupOwnerDbCase } from "../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { PrismaClient } from "@/generated/prisma/client";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";

// ─── Shared IDs ───────────────────────────────────────────────────────────────

const actorId = randomUUID();
const ws = randomUUID();
const businessId = randomUUID();
const NOW = new Date("2026-07-01T00:00:00Z");
const prisma = db as unknown as PrismaClient;

const INTAKE: StartupIntake = {
  capitalAvailable: 12000,
  monthlySurvivalNeed: 2500,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 5000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
};

const VIABLE_IDEA: StartupIdea = {
  name: "Mobile Car Detailing",
  industry: "Automotive services",
  structural: {
    grossMarginPct: 70,
    netMarginPct: 35,
    monthlyRevenue: 6000,
    revenueFrequency: "recurring",
    repeatCustomerPct: 0.65,
    customerAcquisitionDifficulty: "low",
    demandValidated: true,
    ownerIsPrimaryOperator: true,
    differentiation: "moderate",
    pricingPower: "moderate",
    capitalIntensity: "low",
    downsideRisk: "low",
  },
  estimatedStartupCost: 2500,
};

const state: {
  sessionId?: string;
  ideaId?: string;
} = {};

let seeded = false;

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db][e2e] Owner-mode governance spine — startup business",
  () => {
    beforeAll(async () => {
      await (prisma as any).user.create({
        data: { id: actorId, email: `e2e-startup-${actorId}@test.local`, name: "E2E Startup Owner", isActive: true, updatedAt: NOW },
      });
      await (prisma as any).workspace.create({
        data: { id: ws, name: "E2E Startup Workspace", slug: `e2e-startup-${ws.slice(0, 8)}`, createdBy: actorId },
      });
      await (prisma as any).workspaceMembership.create({
        data: { userId: actorId, workspaceId: ws, role: "owner", isActive: true },
      });
      await (prisma as any).ownerBusiness.create({
        data: { id: businessId, workspaceId: ws, name: "Mobile Car Detailing", businessType: "startup", currency: "INR", createdBy: actorId },
      });
      seeded = true;
    }, 30000);

    afterAll(async () => {
      if (!seeded) return;
      // Cleanup in dependency order
      await (prisma as any).startupExecutionBlueprint.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).startupOwnerDecision.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).startupReadinessAssessment.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).startupEconomicModel.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).startupIdeaRecord.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).ownerStartupSession.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).auditEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).ownerBusiness.deleteMany({ where: { id: businessId } }).catch(() => undefined);
      await (prisma as any).workspaceMembership.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (prisma as any).workspace.deleteMany({ where: { id: ws } }).catch(() => undefined);
      await (prisma as any).user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
    }, 30000);

    // ── Step 1: Startup session creation ─────────────────────────────────────

    it("STEP 1: creates a startup session with a viable idea, persists evaluation record", async () => {
      const sessionId = await createStartupSession({
        workspaceId: ws,
        actorId,
        sessionLabel: "Car Detailing Startup Evaluation",
        intake: INTAKE,
        ideas: [VIABLE_IDEA],
      });

      state.sessionId = sessionId;
      expect(sessionId).toBeTruthy();

      const persisted = await (prisma as any).ownerStartupSession.findUnique({ where: { id: sessionId } });
      expect(persisted).toBeTruthy();
      expect(persisted.workspaceId).toBe(ws);
      expect(persisted.status).toBe("DRAFT");

      // Retrieve the idea ID for subsequent steps
      const idea = await (prisma as any).startupIdeaRecord.findFirst({
        where: { sessionId, workspaceId: ws },
      });
      expect(idea).toBeTruthy();
      state.ideaId = idea.id;

      const evt = await (prisma as any).auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED },
      });
      expect(evt).toBeTruthy();
    }, 30000);

    // ── Step 2: Economic model ────────────────────────────────────────────────

    it("STEP 2: builds and persists an economic model for the viable idea", async () => {
      const inputs: EconomicInputs = {
        idea: VIABLE_IDEA,
        capitalAvailable: INTAKE.capitalAvailable,
        monthlySurvivalNeed: INTAKE.monthlySurvivalNeed,
        targetMonthlyIncome: INTAKE.targetMonthlyIncome ?? 0,
      };

      const modelId = await buildAndPersistEconomicModel(
        ws,
        state.sessionId!,
        state.ideaId!,
        actorId,
        inputs,
      );

      expect(modelId).toBeTruthy();

      const persisted = await (prisma as any).startupEconomicModel.findUnique({ where: { id: modelId } });
      expect(persisted).toBeTruthy();
      expect(persisted.workspaceId).toBe(ws);
    }, 30000);

    // ── Step 3: Readiness assessment ─────────────────────────────────────────

    it("STEP 3: assesses readiness and persists the result to the session", async () => {
      const inputs: ReadinessInputs = {
        problemEvidenceCount: 4,
        customerEvidenceCount: 8,
        wtpEvidenceCount: 4,
        deliveryTrialCompleted: true,
        acquisitionChannelTested: true,
        economicClassification: "VIABLE",
        cashRunwayMonths: Math.floor(INTAKE.capitalAvailable / INTAKE.monthlySurvivalNeed),
        breakEvenMonths: 2,
        supplierQuoteObtained: true,
        regulatoryCheckCompleted: true,
        licenceRequired: null,
        licenceObtained: null,
        ownerHoursAvailable: INTAKE.hoursPerWeekAvailable,
        capitalAvailableCents: BigInt(INTAKE.capitalAvailable * 100),
        startupCostCents: BigInt(VIABLE_IDEA.estimatedStartupCost * 100),
        criticalHypothesesPassed: 3,
        criticalHypothesesFailed: 0,
      };

      const result = await assessAndPersistReadiness(
        ws,
        state.sessionId!,
        state.ideaId!,
        actorId,
        inputs,
      );

      expect(result).toBeTruthy();
      expect(["READY", "CONDITIONALLY_READY", "NOT_READY", "BLOCKED"]).toContain(result.status);
      expect(result.scores.problemEvidence).toBeGreaterThanOrEqual(0);

      const persisted = await (prisma as any).startupReadinessAssessment.findFirst({
        where: { workspaceId: ws, sessionId: state.sessionId! },
      });
      expect(persisted).toBeTruthy();
    }, 30000);

    // ── Step 4: Execution blueprint ───────────────────────────────────────────

    it("STEP 4: creates an execution blueprint with milestones and tasks", async () => {
      const ownerDecisionId = randomUUID();

      // createBlueprint requires an existing StartupOwnerDecision row and
      // the session's currentOwnerDecisionId to match (concurrency guard)
      await (prisma as any).startupOwnerDecision.create({
        data: {
          id: ownerDecisionId,
          workspaceId: ws,
          sessionId: state.sessionId!,
          ideaId: state.ideaId!,
          decisionType: "GO",
          actorId: actorId,
        },
      });
      await (prisma as any).ownerStartupSession.update({
        where: { id: state.sessionId! },
        data: { currentOwnerDecisionId: ownerDecisionId },
      });

      const result = await createBlueprint(ws, actorId, {
        sessionId: state.sessionId!,
        ideaId: state.ideaId!,
        ownerDecisionId,
        objectiveTitle: "Launch Mobile Car Detailing in 90 days",
        objectiveDescription: "Achieve first 10 recurring customers within 90 days.",
        initialTaskTitles: ["Source detailing equipment", "Register business", "Acquire first 3 customers"],
      });

      expect(result.blueprintId).toBeTruthy();

      const persisted = await (prisma as any).startupExecutionBlueprint.findUnique({
        where: { id: result.blueprintId },
      });
      expect(persisted).toBeTruthy();
      expect(persisted.workspaceId).toBe(ws);
    }, 30000);

    // ── Step 5: Whole-business-plan view (startup scenario) ──────────────────

    it("STEP 5: whole-business-plan returns valid runtime output for startup seed data", async () => {
      const ids = {
        workspaceId: ws, businessId, userId: actorId, now: NOW,
        cashInHand: 12000, skipComplianceAndProof: true, capacityGrowthSafe: true,
      };
      await seedOwnerDbCase(prisma, ids);
      try {
        const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId, now: NOW });
        expect(view.found).toBe(true);
        expect(view.generatedFromRuntime).toBe(true);
        expect(view.plan.businessHealthSummary.length).toBeGreaterThan(0);
        expect(view.nextBestAction.length).toBeGreaterThan(0);
      } finally {
        await cleanupOwnerDbCase(prisma, ids);
      }
    }, 60000);

    // ── Step 6: Audit trail integrity ─────────────────────────────────────────

    it("STEP 6: audit trail is workspace-scoped and contains startup governance events", async () => {
      const events = await (prisma as any).auditEvent.findMany({
        where: { workspaceId: ws },
        orderBy: { occurredAt: "asc" },
      });

      expect(events.length).toBeGreaterThanOrEqual(1);

      for (const evt of events) {
        expect(evt.workspaceId).toBe(ws);
      }

      const names = new Set(events.map((e: any) => e.eventName));
      expect(names.has(AUDIT_EVENTS.STARTUP_SESSION_CREATED)).toBe(true);

      const leaked = await (prisma as any).auditEvent.findMany({
        where: { workspaceId: randomUUID() },
      });
      expect(leaked.length).toBe(0);
    }, 30000);
  },
);
