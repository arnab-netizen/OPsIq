/**
 * Startup session persistence DB proof — Capability 13.
 *
 * `[db]`-gated. Proves: startup validation results are persisted to PostgreSQL;
 * per-idea evaluation records link correctly to their session; the recommended idea
 * name is stored; workspace isolation prevents cross-workspace reads; listing sessions
 * returns summary data without the full JSON payload; rejection of ideas with
 * insufficient capital is persisted correctly.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-session.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  getStartupSession,
  listStartupSessions,
} from "@/services/owner-strategy/startup-session.service";
import { NotFoundError } from "@/infra/errors";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

const intake: StartupIntake = {
  capitalAvailable: 10000,
  monthlySurvivalNeed: 2000,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 4000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
};

const viableIdea: StartupIdea = {
  name: "Mobile Car Wash",
  industry: "Automotive services",
  structural: {
    grossMarginPct: 65,
    netMarginPct: 30,
    monthlyRevenue: 5000,
    revenueFrequency: "recurring",
    repeatCustomerPct: 0.6,
    customerAcquisitionDifficulty: "low",
    demandValidated: true,
    ownerIsPrimaryOperator: true,
    differentiation: "moderate",
    pricingPower: "moderate",
    capitalIntensity: "low",
    downsideRisk: "low",
  },
  estimatedStartupCost: 3000,
  estimatedMonthlyRevenue: 5000,
  estimatedMonthlyCost: 1500,
  timeToFirstRevenueMonths: 1,
};

const capitalTrapIdea: StartupIdea = {
  name: "Artisan Bakery",
  industry: "Food & Beverage",
  structural: {
    grossMarginPct: 50,
    netMarginPct: 10,
    monthlyRevenue: 8000,
    revenueFrequency: "recurring",
    customerAcquisitionDifficulty: "medium",
    capitalIntensity: "high",
    downsideRisk: "high",
    workingCapitalPressure: "high",
  },
  estimatedStartupCost: 80000, // far above capitalAvailable=10000
  estimatedMonthlyRevenue: 8000,
  estimatedMonthlyCost: 6000,
  timeToFirstRevenueMonths: 6,
};

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-sess-${actor}@example.com`, name: "Startup Session Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: wsA } });
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: wsB } });
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: wsA } });
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: wsB } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Startup session persistence", () => {
  it("[db] persists a validation session and stores per-idea records", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      sessionLabel: "Initial exploration",
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    expect(sessionId).toBeTruthy();

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session).toBeTruthy();
    expect(session!.workspaceId).toBe(wsA);
    expect(session!.sessionLabel).toBe("Initial exploration");
    expect(session!.status).toBe("DRAFT");

    const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId } });
    expect(ideas.length).toBe(2);
  });

  it("[db] correctly marks idea as accepted or rejected based on capital sufficiency", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId } });
    const viable = ideas.find((i) => i.name === "Mobile Car Wash");
    const trap = ideas.find((i) => i.name === "Artisan Bakery");

    expect(viable).toBeTruthy();
    expect(viable!.accepted).toBe(true);
    expect(trap).toBeTruthy();
    expect(trap!.accepted).toBe(false);
  });

  it("[db] persists the recommended idea name at session level", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.recommendedName).toBe("Mobile Car Wash");
  });

  it("[db] getStartupSession returns session with ideas", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const session = await getStartupSession(wsA, sessionId);
    expect(session.id).toBe(sessionId);
    expect(session.ideas.length).toBe(2);
    // Accepted ideas ordered first
    expect(session.ideas[0].accepted).toBe(true);
  });

  it("[db] getStartupSession rejects cross-workspace access", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    await expect(getStartupSession(wsB, sessionId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] listStartupSessions returns summary without full JSON payload", async () => {
    await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      sessionLabel: "Summary test",
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const sessions = await listStartupSessions(wsA);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const summary = sessions.find((s) => s.sessionLabel === "Summary test");
    expect(summary).toBeTruthy();
    expect(summary!.ideaCount).toBe(2);
    expect(summary!.acceptedCount).toBe(1);
    expect(summary!.recommendedName).toBe("Mobile Car Wash");
    // Summaries don't contain full validationResult JSON
    expect("validationResult" in summary!).toBe(false);
  });

  it("[db] listStartupSessions isolates by workspace", async () => {
    await createStartupSession({
      workspaceId: wsB,
      actorId: actor,
      sessionLabel: "WsB session",
      intake,
      ideas: [viableIdea],
    });

    const wsBSessions = await listStartupSessions(wsB);
    const wsASessions = await listStartupSessions(wsA);

    expect(wsBSessions.some((s) => s.sessionLabel === "WsB session")).toBe(true);
    expect(wsASessions.every((s) => s.sessionLabel !== "WsB session")).toBe(true);
  });

  it("[db] session with no viable ideas stores null recommendedName", async () => {
    // Only the capital-trap idea — will be rejected
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [capitalTrapIdea],
    });

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.recommendedName).toBeNull();
  });
});
