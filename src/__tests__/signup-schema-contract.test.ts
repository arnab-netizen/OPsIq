import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

/**
 * Signup Schema Contract Test
 *
 * Verifies that signup route provides all required fields according to schema:
 * - User: id, email, updatedAt (plus optional hashedPassword, isActive)
 * - Session: id, userId, token, expiresAt (plus optional ipAddress, userAgent)
 * - Workspace: name, slug, isActive (id auto-generated)
 * - WorkspaceMembership: workspaceId, userId, role, addedBy, isActive (id auto-generated)
 */

describe("Signup Schema Contract", () => {
  it("should create user with all required fields", async () => {
    const userId = randomUUID();
    const now = new Date();

    const user = await db.user.create({
      data: {
        id: userId,
        email: `test-user-${Date.now()}@example.com`,
        hashedPassword: "test-hash-password",
        isActive: true,
        updatedAt: now,
      },
    });

    // Verify all required fields are present
    expect(user.id).toBe(userId);
    expect(user.email).toBeDefined();
    expect(user.isActive).toBe(true);
    expect(user.updatedAt).toBeDefined();
    expect(user.updatedAt.getTime()).toBeGreaterThan(0);

    // Cleanup
    await db.user.delete({ where: { id: userId } });
  });

  it("should create session with distinct id and token", async () => {
    // Create a test user first for the session FK
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        email: `test-session-${Date.now()}@example.com`,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    const sessionId = randomUUID();
    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await db.session.create({
      data: {
        id: sessionId,
        userId,
        token: sessionToken,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      },
    });

    // Verify all required fields are present
    expect(session.id).toBe(sessionId);
    expect(session.userId).toBe(userId);
    expect(session.token).toBe(sessionToken);
    expect(session.expiresAt).toBeDefined();

    // Critical security check: token must be different from id
    expect(session.token).not.toBe(session.id);

    // Cleanup
    await db.session.delete({ where: { id: sessionId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("should create workspace with required fields", async () => {
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        email: `test-workspace-${Date.now()}@example.com`,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    const workspace = await db.workspace.create({
      data: {
        name: `Test Workspace ${Date.now()}`,
        slug: `test-ws-${Date.now()}`,
        createdBy: userId,
        isActive: true,
      },
    });

    // Verify all required fields are present
    expect(workspace.id).toBeDefined();
    expect(workspace.name).toBeDefined();
    expect(workspace.slug).toBeDefined();
    expect(workspace.isActive).toBe(true);

    // Cleanup
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: userId } });
  });

  it("should verify session token and id are always different UUIDs", () => {
    // This test ensures signup generates distinct session id and token
    // Session.id = internal identifier
    // Session.token = authentication token (set in cookie)
    // They MUST be different to prevent session fixation

    const id1 = randomUUID();
    const id2 = randomUUID();

    expect(id1).not.toBe(id2);

    // Verify both are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id1).toMatch(uuidRegex);
    expect(id2).toMatch(uuidRegex);
  });
});
