/**
 * [db] Customer directory + access diagnostics — real Postgres. Proves
 * diagnostics agrees EXACTLY with the real signup-admission predicate
 * (canAdmitSignup) under each admission mode, and that the directory/detail
 * views expose only real, reliable facts.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/admin/customer-access.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { searchCustomers, getCustomerDetail, diagnoseAccess } from "@/services/admin/customer-access.service";
import { canAdmitSignup } from "@/domain/beta/admission";
import { isBetaRequestInvited } from "@/lib/beta";
import { readEffectiveSettings, countExternalBetaWorkspaces } from "@/services/beta/platform-settings.service";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] customer directory + access diagnostics", () => {
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  const betaRequestIds: string[] = [];

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    if (workspaceIds.length) {
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      workspaceIds.length = 0;
    }
    if (userIds.length) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
    if (betaRequestIds.length) {
      await db.betaRequest.deleteMany({ where: { id: { in: betaRequestIds } } });
      betaRequestIds.length = 0;
    }
  });

  it("[db] diagnostics agrees exactly with canAdmitSignup under INVITE_ONLY for an uninvited email", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 50, updatedBy: "seed" } });
    const email = `diag-uninvited-${randomUUID()}@example.com`;

    const diag = await diagnoseAccess(email);
    const settings = await readEffectiveSettings();
    const isInvited = await isBetaRequestInvited(email);
    const count = await countExternalBetaWorkspaces();
    const authoritative = canAdmitSignup(settings.admissionMode, isInvited, count < settings.capacityLimit);

    expect(diag.canSignUp.allowed).toBe(authoritative);
    expect(diag.canSignUp.allowed).toBe(false);
  });

  it("[db] diagnostics agrees exactly with canAdmitSignup under INVITE_ONLY for an INVITED, unexpired email", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 50, updatedBy: "seed" } });
    const id = randomUUID();
    betaRequestIds.push(id);
    const email = `diag-invited-${id}@example.com`;
    await db.betaRequest.create({ data: { id, email, status: "INVITED", invitedAt: new Date() } });

    const diag = await diagnoseAccess(email);
    const settings = await readEffectiveSettings();
    const isInvited = await isBetaRequestInvited(email);
    const count = await countExternalBetaWorkspaces();
    const authoritative = canAdmitSignup(settings.admissionMode, isInvited, count < settings.capacityLimit);

    expect(diag.canSignUp.allowed).toBe(authoritative);
    expect(diag.canSignUp.allowed).toBe(true);
  });

  it("[db] diagnostics agrees exactly with canAdmitSignup under CLOSED (always false, regardless of invite)", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "CLOSED", capacityLimit: 50, updatedBy: "seed" } });
    const id = randomUUID();
    betaRequestIds.push(id);
    const email = `diag-closed-${id}@example.com`;
    await db.betaRequest.create({ data: { id, email, status: "INVITED", invitedAt: new Date() } });

    const diag = await diagnoseAccess(email);
    expect(diag.canSignUp.allowed).toBe(false);
    expect(diag.canRequestBeta.allowed).toBe(false);
  });

  it("[db] diagnostics reflects a real user's verification/active state exactly as login checks it", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    const email = `diag-user-${userId}@example.com`;
    await db.user.create({
      data: { id: userId, email, isActive: true, requiresEmailVerification: true, emailVerifiedAt: null, updatedAt: new Date() },
    });

    const diag = await diagnoseAccess(email);
    expect(diag.canVerifyEmail.allowed).toBe(true);
    expect(diag.canSignIn.allowed).toBe(false); // not verified yet

    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    const diagAfter = await diagnoseAccess(email);
    expect(diagAfter.canVerifyEmail.allowed).toBe(false);
    expect(diagAfter.canSignIn.allowed).toBe(true);
  });

  it("[db] diagnostics reports workspace access using the real employee-lifecycle status", async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    userIds.push(userId);
    workspaceIds.push(workspaceId);
    const email = `diag-member-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Diag WS", slug: `diag-ws-${workspaceId.slice(0, 8)}`, updatedAt: new Date() } });
    await db.workspaceMembership.create({ data: { workspaceId, userId, role: "member", isActive: true } });

    const diag = await diagnoseAccess(email, workspaceId);
    expect(diag.canAccessWorkspace).toEqual({ workspaceId, allowed: true, reason: "ACTIVE" });

    await db.workspaceMembership.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { isActive: false } });
    const diagAfter = await diagnoseAccess(email, workspaceId);
    expect(diagAfter.canAccessWorkspace).toEqual({ workspaceId, allowed: false, reason: "SUSPENDED" });
  });

  it("[db] getCustomerDetail exposes only real facts, no secrets/session tokens", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    const email = `detail-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, emailVerifiedAt: new Date(), updatedAt: new Date() } });
    await db.session.create({ data: { id: randomUUID(), userId, token: `tok-${userId}`, expiresAt: new Date(Date.now() + 3600_000) } });

    const detail = await getCustomerDetail(email);
    expect(detail.user?.activeSessionCount).toBe(1);
    expect(JSON.stringify(detail)).not.toMatch(/tok-/); // no raw session token ever surfaced
  });

  it("[db] searchCustomers finds a user by email substring", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    const uniqueTag = randomUUID().slice(0, 8);
    const email = `search-${uniqueTag}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });

    const results = await searchCustomers(uniqueTag);
    expect(results.some((r) => r.email === email)).toBe(true);
  });
});
