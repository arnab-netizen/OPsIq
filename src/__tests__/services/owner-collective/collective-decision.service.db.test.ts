/**
 * Owner Collective Decision (Phase 1 Slice A) — DB-backed runtime read path proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * all migrations applied. Proves the runtime read path:
 *   persisted BusinessConditionProfile (workspace-scoped)
 *     → mapped to DomainSignalInput[]
 *     → existing collective engine (runCollective)
 *     → governed CollectiveDecisionPacket.
 *
 * Covers: runtime success (real persisted row, not mocked), workspace isolation
 * (A cannot read B; empty workspace leaks nothing), explicit empty state, and a
 * degraded profile whose dimensions are unrecognized (no false confidence).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-collective/collective-decision.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getOwnerCommandCenter } from "@/services/owner-collective/collective-decision.service";

const actor = randomUUID();
const ws = () => randomUUID();

const created = { profiles: [] as string[], engagements: [] as string[], workspaces: [] as string[], clients: [] as string[] };

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `collective-test-${actor}@example.com`, name: "Collective Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  // Tear down in FK-safe order. Ignore individual failures.
  for (const id of created.profiles) await db.businessConditionProfile.deleteMany({ where: { id } }).catch(() => undefined);
  for (const id of created.engagements) await db.engagement.deleteMany({ where: { id } }).catch(() => undefined);
  for (const id of created.workspaces) await db.workspace.deleteMany({ where: { id } }).catch(() => undefined);
  for (const id of created.clients) await db.clientAccount.deleteMany({ where: { id } }).catch(() => undefined);
  created.profiles = []; created.engagements = []; created.workspaces = []; created.clients = [];
});

type ProfileLevels = Partial<Record<
  | "businessStatus" | "urgencyLevel" | "cashPressureLevel" | "marginPressureLevel"
  | "clientConcentrationRisk" | "ownerDependencyRisk" | "keyPersonDependencyRisk"
  | "processMaturityLevel" | "managementMaturityLevel" | "executionCapacityLevel"
  | "moralFragilityLevel" | "resilienceLevel" | "growthReadinessLevel",
  string
>>;

/** Seed clientAccount → workspace → engagement → current BusinessConditionProfile. */
async function seedProfile(workspaceId: string, overrides: ProfileLevels = {}): Promise<string> {
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const profileId = randomUUID();

  await db.clientAccount.create({ data: { id: clientId, name: "Collective Client", updatedAt: new Date() } });
  created.clients.push(clientId);

  await db.workspace.create({ data: { id: workspaceId, name: "Collective WS", slug: `collective-${workspaceId}`, createdBy: actor } });
  created.workspaces.push(workspaceId);

  await db.engagement.create({
    data: {
      id: engagementId, code: `ENG-${engagementId}`, title: "Collective Engagement",
      clientId, workspaceId, serviceTier: "standard", engagementMode: "advisory",
      createdBy: actor, updatedAt: new Date(),
    },
  });
  created.engagements.push(engagementId);

  await db.businessConditionProfile.create({
    data: {
      id: profileId,
      engagementId,
      workspaceId,
      businessStatus: overrides.businessStatus ?? "challenged",
      severityScore: 7,
      urgencyLevel: overrides.urgencyLevel ?? "high",
      cashPressureLevel: overrides.cashPressureLevel ?? "critical",
      marginPressureLevel: overrides.marginPressureLevel ?? "high",
      clientConcentrationRisk: overrides.clientConcentrationRisk ?? "medium",
      ownerDependencyRisk: overrides.ownerDependencyRisk ?? "critical",
      keyPersonDependencyRisk: overrides.keyPersonDependencyRisk ?? "medium",
      processMaturityLevel: overrides.processMaturityLevel ?? "low",
      managementMaturityLevel: overrides.managementMaturityLevel ?? "medium",
      executionCapacityLevel: overrides.executionCapacityLevel ?? "low",
      moralFragilityLevel: overrides.moralFragilityLevel ?? "high",
      resilienceLevel: overrides.resilienceLevel ?? "low",
      growthReadinessLevel: overrides.growthReadinessLevel ?? "low",
      isCurrent: true,
      updatedAt: new Date(),
    },
  });
  created.profiles.push(profileId);
  return profileId;
}

describe("[db] Owner Collective Decision runtime read path", () => {
  it("[db] reads a persisted profile and returns a governed collective packet", async () => {
    const workspaceId = ws();
    const profileId = await seedProfile(workspaceId);

    const res = await getOwnerCommandCenter(workspaceId);

    expect(res.hasData).toBe(true);
    expect(res.workspaceId).toBe(workspaceId);
    expect(res.sourceProfileId).toBe(profileId);
    expect(res.packet).not.toBeNull();
    // Cross-domain coverage: cash + profit + capacity + process + workload all mapped.
    expect(res.signalCount).toBeGreaterThanOrEqual(5);
    expect(res.mappedDomains).toContain("cash-survival");
    expect(res.mappedDomains).toContain("profit-improvement");
    expect(res.mappedDomains).toContain("capacity");
    expect(res.dataConfidence).toBe("HIGH");

    // The packet is the real engine output: every governed field is populated.
    const packet = res.packet!;
    expect(packet.businessStage).toBeTruthy();
    expect(packet.primaryDiagnosis).toBeTruthy();
    expect(packet.primaryNextAction).toBeTruthy();
    expect(packet.rankedDomainSignals.length).toBeGreaterThan(0);
    // Critical cash pressure must surface cash-survival as a top-ranked signal.
    expect(packet.rankedDomainSignals.some((s) => s.domain === "cash-survival")).toBe(true);
    // The engine never emits an unsafe output.
    expect(packet.unsafeEmitted).toEqual([]);
  });

  it("[db] enforces workspace isolation — workspace B cannot read workspace A's profile", async () => {
    const workspaceA = ws();
    await seedProfile(workspaceA);

    const otherWorkspace = ws(); // never seeded
    const res = await getOwnerCommandCenter(otherWorkspace);

    expect(res.hasData).toBe(false);
    expect(res.sourceProfileId).toBeNull();
    expect(res.packet).toBeNull();
    expect(res.signalCount).toBe(0);
  });

  it("[db] two workspaces each see only their own profile (no cross-leak)", async () => {
    const workspaceA = ws();
    const workspaceB = ws();
    const profileA = await seedProfile(workspaceA, { businessStatus: "challenged" });
    const profileB = await seedProfile(workspaceB, { businessStatus: "stable", cashPressureLevel: "low" });

    const resA = await getOwnerCommandCenter(workspaceA);
    const resB = await getOwnerCommandCenter(workspaceB);

    expect(resA.sourceProfileId).toBe(profileA);
    expect(resB.sourceProfileId).toBe(profileB);
    expect(resA.sourceProfileId).not.toBe(resB.sourceProfileId);
    expect(resA.businessStatus).toBe("challenged");
    expect(resB.businessStatus).toBe("stable");
  });

  it("[db] returns an explicit empty state when the workspace has no current profile", async () => {
    const emptyWorkspace = ws();
    const res = await getOwnerCommandCenter(emptyWorkspace);

    expect(res.hasData).toBe(false);
    expect(res.packet).toBeNull();
    expect(res.signalCount).toBe(0);
    expect(res.missingCriticalData).toContain("business_condition_profile");
  });

  it("[db] does not read a profile flagged not-current (isCurrent=false)", async () => {
    const workspaceId = ws();
    const profileId = await seedProfile(workspaceId);
    await db.businessConditionProfile.update({ where: { id: profileId }, data: { isCurrent: false } });

    const res = await getOwnerCommandCenter(workspaceId);
    expect(res.hasData).toBe(false);
    expect(res.packet).toBeNull();
  });

  it("[db] surfaces a data gap (no false confidence) when persisted levels are unrecognized", async () => {
    const workspaceId = ws();
    await seedProfile(workspaceId, {
      cashPressureLevel: "unknown", marginPressureLevel: "unknown", ownerDependencyRisk: "unknown",
      keyPersonDependencyRisk: "unknown", clientConcentrationRisk: "unknown", executionCapacityLevel: "unknown",
      processMaturityLevel: "unknown", managementMaturityLevel: "unknown", growthReadinessLevel: "unknown",
    });

    const res = await getOwnerCommandCenter(workspaceId);
    // The persisted row exists, but no dimension was usable → no packet, no false confidence.
    expect(res.hasData).toBe(true);
    expect(res.packet).toBeNull();
    expect(res.signalCount).toBe(0);
    expect(res.dataConfidence).toBe("LOW");
    expect(res.missingCriticalData).toContain("cashPressureLevel");
    expect(res.missingCriticalData).toContain("growthReadinessLevel");
  });

  it("[db] scopes by engagementId when provided and isolates a foreign engagement", async () => {
    const workspaceId = ws();
    const profileId = await seedProfile(workspaceId);
    const profile = await db.businessConditionProfile.findUniqueOrThrow({ where: { id: profileId } });

    const matched = await getOwnerCommandCenter(workspaceId, profile.engagementId);
    expect(matched.sourceProfileId).toBe(profileId);

    const foreign = await getOwnerCommandCenter(workspaceId, randomUUID());
    expect(foreign.hasData).toBe(false);
    expect(foreign.packet).toBeNull();
  });
});
