/**
 * REAL (unmocked) canonical-route-enforcement.ts integration tests for:
 *   GET /api/admin/d3-runtime-diagnostic
 *
 * This is the TEMPORARY, SYSTEM_ADMIN-gated, read-only diagnostic endpoint authorized solely for
 * the D3 controlled-beta launch-blocker runtime-vs-database forensics thread. Only auth (session +
 * policy context) is mocked, exactly as src/__tests__/api/growth/pricing-tiers-real-route.db.test.ts
 * does it — the REAL withCanonicalEnforcement auth pipeline, the REAL shared `db` singleton, and
 * the REAL listBusinesses() service all run against a real Postgres database.
 *
 * Proves:
 *  1. unauthenticated (invalid session) -> 401, no data returned.
 *  2. an OWNER_VIEW-only actor (admin_or_portfolio_manager role — has OWNER_VIEW, lacks
 *     SYSTEM_ADMIN) -> 403, no data returned.
 *  3. a SYSTEM_ADMIN actor -> 200, full body shape.
 *  4. workspaceId in the response is the canonical-auth-derived workspace (the actor's own
 *     workspaceMembership row), never trusted from a query parameter or header.
 *  5. the response body never contains DATABASE_URL, a connection string, or any credential-shaped
 *     substring.
 *  6. the endpoint performs zero mutations (OwnerBusiness row count/state identical before and after).
 *  7. returned aggregate counts (total/fixtureTrue/fixtureFalse/activeNonFixture) are exactly
 *     correct against a seeded test workspace.
 *  8. listBusinessesCount excludes fixture businesses and archived businesses, matching
 *     listBusinesses()'s own real, unmocked behavior.
 *  9. the two named diagnostic ids (Trinity Services / sample acceptance business) resolve
 *     correctly when present in the caller's own workspace and only there.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/d3-runtime-diagnostic-real-route.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const TRINITY_SERVICES_ID = "0d99e80e-dc3a-46c5-b0bf-23dd09f2ed8c";
const SAMPLE_ACCEPTANCE_BUSINESS_ID = "aae15e3f-1c94-439e-b7e5-e59bd68d9064";

let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRole: "system_admin" | "admin_or_portfolio_manager" = "system_admin";
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => {
    if (!mockSessionValid) {
      return { valid: false, session: null, invalidReason: "no_session" };
    }
    return {
      valid: true,
      session: {
        user: { id: mockActorId, email: "diagnostic-test@example.com", name: "Diagnostic Test", isActive: true },
        sessionId: "test-session",
        expiresAt: new Date(Date.now() + 86400000),
      },
      invalidReason: undefined,
    };
  }),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "diagnostic-test@example.com", name: "Diagnostic Test", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: mockActorId,
      roles: [{ role: mockRole, scope: "workspace", scopeId: mockWorkspaceId }],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: mockActorId,
    roles: [{ role: mockRole, scope: "workspace", scopeId: mockWorkspaceId }],
    engagementMemberships: [],
  })),
}));

function makeRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.com/api/admin/d3-runtime-diagnostic${query}`, { method: "GET" });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "GET /api/admin/d3-runtime-diagnostic — REAL route + REAL canonical-route-enforcement",
  () => {
    let workspaceId: string;
    let actorId: string;
    let trinityId: string;
    let sampleAcceptanceId: string;
    let otherRealBusinessId: string;
    let archivedBusinessId: string;
    let fixtureBusinessId: string;

    beforeEach(async () => {
      actorId = randomUUID();
      workspaceId = randomUUID();
      mockActorId = actorId;
      mockWorkspaceId = workspaceId;
      mockSessionValid = true;
      mockRole = "system_admin";

      trinityId = TRINITY_SERVICES_ID;
      sampleAcceptanceId = SAMPLE_ACCEPTANCE_BUSINESS_ID;
      otherRealBusinessId = randomUUID();
      archivedBusinessId = randomUUID();
      fixtureBusinessId = randomUUID();

      await db.user.create({
        data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: "D3 Diagnostic WS", slug: `d3-diag-ws-${workspaceId.substring(0, 8)}` },
      });
      await db.workspaceMembership.create({
        data: { userId: actorId, workspaceId, role: "admin", isActive: true },
      });

      // Trinity Services — real, active, non-fixture (the exact known-good business).
      await db.ownerBusiness.create({
        data: {
          id: trinityId, workspaceId, name: "Trinity Services", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actorId, updatedAt: new Date(),
        },
      });
      // Sample acceptance business — reclassified fixture (D3's own target class).
      await db.ownerBusiness.create({
        data: {
          id: sampleAcceptanceId, workspaceId, name: "OPSIQ Production Acceptance - test", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: true, createdBy: actorId, updatedAt: new Date(),
        },
      });
      // A second real, active, non-fixture business — proves the counts aren't hardcoded to 1.
      await db.ownerBusiness.create({
        data: {
          id: otherRealBusinessId, workspaceId, name: "Second Real Business", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actorId, updatedAt: new Date(),
        },
      });
      // Archived, non-fixture — must count in total/fixtureFalse but NOT in activeNonFixture or listBusinesses().
      await db.ownerBusiness.create({
        data: {
          id: archivedBusinessId, workspaceId, name: "Archived Business", businessType: "generic_local_service",
          currency: "USD", isActive: false, isFixtureBusiness: false, createdBy: actorId, updatedAt: new Date(),
        },
      });
      // Another fixture business — must count in fixtureTrue but NOT in listBusinesses().
      await db.ownerBusiness.create({
        data: {
          id: randomUUID(), workspaceId, name: "OPSIQ Acceptance - Other", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: true, createdBy: actorId, updatedAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      await db.ownerBusiness.deleteMany({ where: { workspaceId } });
      await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: actorId } });
    });

    it("unauthenticated (invalid session) -> 401, no data returned", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");

      const response = await GET(makeRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.ownerBusiness).toBeUndefined();
      expect(body.workspaceId).toBeUndefined();
    });

    it("OWNER_VIEW-only actor (admin_or_portfolio_manager, no SYSTEM_ADMIN) -> 403, no data returned", async () => {
      mockRole = "admin_or_portfolio_manager";
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");

      const response = await GET(makeRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.ownerBusiness).toBeUndefined();
    });

    it("SYSTEM_ADMIN actor -> 200, full body shape, correct aggregate counts against seeded DB", async () => {
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");

      const response = await GET(makeRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      const body = await response.json();

      expect(typeof body.buildCommitSha).toBe("string");
      expect(typeof body.currentDatabase).toBe("string");
      expect(typeof body.currentSchema).toBe("string");

      // Seeded: 5 total (Trinity + sample acceptance + other real + archived + second fixture).
      expect(body.ownerBusiness.total).toBe(5);
      expect(body.ownerBusiness.fixtureTrue).toBe(2); // sampleAcceptance + second fixture
      expect(body.ownerBusiness.fixtureFalse).toBe(3); // trinity + otherReal + archived
      // activeNonFixture excludes the archived one -> trinity + otherReal only.
      expect(body.ownerBusiness.activeNonFixture).toBe(2);

      expect(body.trinityServices).toEqual({ id: trinityId, isFixtureBusiness: false, isActive: true });
      expect(body.sampleAcceptanceBusiness).toEqual({ id: sampleAcceptanceId, isFixtureBusiness: true, isActive: true });

      // listBusinesses() is real+unmocked: isActive:true AND isFixtureBusiness:false only ->
      // exactly trinity + otherReal, matching activeNonFixture exactly (this is the actual
      // cross-check the D3 mission needs: raw counts vs the real service-layer result).
      expect(body.listBusinessesCount).toBe(2);
      expect(body.listBusinessesCount).toBe(body.ownerBusiness.activeNonFixture);
    });

    it("workspaceId in the response is canonical-auth-derived, not client-suppliable", async () => {
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");

      // Attempt to override via query string — must be ignored entirely; the route never reads
      // request query params for workspace resolution.
      const response = await GET(makeRequest(`?workspaceId=${randomUUID()}`), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(workspaceId);
    });

    it("response never contains DATABASE_URL, a connection string, or credential-shaped text", async () => {
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");

      const response = await GET(makeRequest(), { params: Promise.resolve({}) });
      const raw = await response.text();

      expect(raw).not.toContain(process.env.DATABASE_URL ?? "__unset__");
      expect(raw).not.toMatch(/postgres(ql)?:\/\/[^"]*:[^"@]*@/i);
      expect(raw).not.toMatch(/password|passwd|secret|token|api_key/i);
      // A SHA-256 hex digest is 64 chars — the fingerprint field must never be the raw hostname
      // itself (which would contain a "." and be readable).
      const parsed = JSON.parse(raw);
      if (parsed.databaseHostFingerprintSha256) {
        expect(parsed.databaseHostFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("performs zero mutations — OwnerBusiness row count and field values identical before and after", async () => {
      const before = await db.ownerBusiness.findMany({
        where: { workspaceId },
        select: { id: true, isFixtureBusiness: true, isActive: true, version: true },
        orderBy: { id: "asc" },
      });

      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      await GET(makeRequest(), { params: Promise.resolve({}) });

      const after = await db.ownerBusiness.findMany({
        where: { workspaceId },
        select: { id: true, isFixtureBusiness: true, isActive: true, version: true },
        orderBy: { id: "asc" },
      });

      expect(after).toEqual(before);
    });

    it("Trinity/sample-acceptance ids resolve to null when not present in the caller's own workspace (workspace-scoped, not global lookup)", async () => {
      // A second, unrelated workspace that does NOT contain the two named ids.
      const otherWorkspaceId = randomUUID();
      const otherActorId = randomUUID();
      await db.user.create({ data: { id: otherActorId, email: `${otherActorId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: otherWorkspaceId, name: "Other WS", slug: `other-ws-${otherWorkspaceId.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: otherActorId, workspaceId: otherWorkspaceId, role: "admin", isActive: true } });

      mockActorId = otherActorId;
      mockWorkspaceId = otherWorkspaceId;
      mockRole = "system_admin";

      try {
        const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
        const response = await GET(makeRequest(), { params: Promise.resolve({}) });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.trinityServices).toBeNull();
        expect(body.sampleAcceptanceBusiness).toBeNull();
        expect(body.ownerBusiness.total).toBe(0);
      } finally {
        await db.workspaceMembership.deleteMany({ where: { userId: otherActorId } });
        await db.workspace.deleteMany({ where: { id: otherWorkspaceId } });
        await db.user.deleteMany({ where: { id: otherActorId } });
      }
    });
  }
);

/**
 * Path B — OPSIQ_DIAGNOSTIC_KEY access path (PR #444 follow-up).
 *
 * Reuses the REAL, unmocked verifyDiagnosticKeyFromRequest() (src/lib/security/diagnostic-key.ts)
 * — the exact same timing-safe validator every other `/api/internal/*` diagnostic route already
 * uses. Proves the key path is fixed to exactly D3_FIXED_WORKSPACE_ID, cannot be redirected to
 * another workspace, never echoes the key or DATABASE_URL, performs zero mutations, and that an
 * invalid/missing key falls straight through to Path A's own unmodified, unregressed auth check.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "GET /api/admin/d3-runtime-diagnostic — diagnostic-key access path (Path B)",
  () => {
    const D3_FIXED_WORKSPACE_ID = "d0609f28-dbbd-4a29-a5d2-fd74a7bb4ce5";
    const originalDiagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
    const DIAGNOSTIC_KEY_TEST_VALUE = `test-d3-diagnostic-key-${randomUUID()}`;

    // A separate, ordinary session identity (mirrors the describe block above) used only for the
    // "authenticated OWNER_VIEW" denial tests — deliberately decoupled from D3_FIXED_WORKSPACE_ID
    // so those tests exercise real workspace-membership resolution, not the fixed-workspace path.
    let sessionActorId: string;
    let sessionWorkspaceId: string;

    // The fixed D3 workspace's seeded business rows, used only by the diagnostic-key-path tests.
    let fixedWsOwnerId: string;
    let otherRealBusinessId: string;
    let fixtureBusinessId: string;

    function makeKeyRequest(headerValue?: string, query = ""): NextRequest {
      return new NextRequest(`https://example.com/api/admin/d3-runtime-diagnostic${query}`, {
        method: "GET",
        headers: headerValue !== undefined ? { "x-opsiq-diagnostic-key": headerValue } : undefined,
      });
    }

    beforeEach(async () => {
      process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY_TEST_VALUE;

      sessionActorId = randomUUID();
      sessionWorkspaceId = randomUUID();
      mockActorId = sessionActorId;
      mockWorkspaceId = sessionWorkspaceId;
      mockSessionValid = true;
      mockRole = "system_admin";

      await db.user.create({
        data: { id: sessionActorId, email: `${sessionActorId}@example.com`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: sessionWorkspaceId, name: "D3 Key-Path Session WS", slug: `d3-key-session-ws-${sessionWorkspaceId.substring(0, 8)}` },
      });
      await db.workspaceMembership.create({
        data: { userId: sessionActorId, workspaceId: sessionWorkspaceId, role: "admin", isActive: true },
      });

      // Defensive cleanup: this exact fixed id must never carry rows left over from a prior run.
      await db.ownerBusiness.deleteMany({ where: { workspaceId: D3_FIXED_WORKSPACE_ID } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: D3_FIXED_WORKSPACE_ID } });
      await db.workspace.deleteMany({ where: { id: D3_FIXED_WORKSPACE_ID } });

      fixedWsOwnerId = randomUUID();
      otherRealBusinessId = randomUUID();
      fixtureBusinessId = randomUUID();

      await db.user.create({
        data: { id: fixedWsOwnerId, email: `${fixedWsOwnerId}@example.com`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: D3_FIXED_WORKSPACE_ID, name: "D3 Fixed WS (test)", slug: `d3-fixed-ws-test-${randomUUID().substring(0, 8)}` },
      });
      await db.workspaceMembership.create({
        data: { userId: fixedWsOwnerId, workspaceId: D3_FIXED_WORKSPACE_ID, role: "admin", isActive: true },
      });

      await db.ownerBusiness.create({
        data: {
          id: TRINITY_SERVICES_ID, workspaceId: D3_FIXED_WORKSPACE_ID, name: "Trinity Services", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: fixedWsOwnerId, updatedAt: new Date(),
        },
      });
      await db.ownerBusiness.create({
        data: {
          id: SAMPLE_ACCEPTANCE_BUSINESS_ID, workspaceId: D3_FIXED_WORKSPACE_ID, name: "OPSIQ Production Acceptance - test", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: true, createdBy: fixedWsOwnerId, updatedAt: new Date(),
        },
      });
      await db.ownerBusiness.create({
        data: {
          id: otherRealBusinessId, workspaceId: D3_FIXED_WORKSPACE_ID, name: "Other Real Business (fixed ws test)", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: fixedWsOwnerId, updatedAt: new Date(),
        },
      });
      await db.ownerBusiness.create({
        data: {
          id: fixtureBusinessId, workspaceId: D3_FIXED_WORKSPACE_ID, name: "Fixture Business (fixed ws test)", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: true, createdBy: fixedWsOwnerId, updatedAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      if (originalDiagnosticKey === undefined) {
        delete process.env.OPSIQ_DIAGNOSTIC_KEY;
      } else {
        process.env.OPSIQ_DIAGNOSTIC_KEY = originalDiagnosticKey;
      }

      await db.workspaceMembership.deleteMany({ where: { userId: sessionActorId } });
      await db.workspace.deleteMany({ where: { id: sessionWorkspaceId } });
      await db.user.deleteMany({ where: { id: sessionActorId } });

      await db.ownerBusiness.deleteMany({ where: { workspaceId: D3_FIXED_WORKSPACE_ID } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: D3_FIXED_WORKSPACE_ID } });
      await db.workspace.deleteMany({ where: { id: D3_FIXED_WORKSPACE_ID } });
      await db.user.deleteMany({ where: { id: fixedWsOwnerId } });
    });

    it("anonymous + no key -> denied (falls through to Path A's unmodified auth, 401)", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest(undefined), { params: Promise.resolve({}) });
      expect(response.status).toBe(401);
    });

    it("anonymous + invalid key -> denied (falls through to Path A's unmodified auth, 401)", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest("totally-wrong-key"), { params: Promise.resolve({}) });
      expect(response.status).toBe(401);
    });

    it("authenticated OWNER_VIEW + no key -> denied (403, unregressed Path A behavior)", async () => {
      mockSessionValid = true;
      mockRole = "admin_or_portfolio_manager";
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest(undefined), { params: Promise.resolve({}) });
      expect(response.status).toBe(403);
    });

    it("authenticated OWNER_VIEW + invalid key -> denied (403, unregressed Path A behavior)", async () => {
      mockSessionValid = true;
      mockRole = "admin_or_portfolio_manager";
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest("wrong-key"), { params: Promise.resolve({}) });
      expect(response.status).toBe(403);
    });

    it("SYSTEM_ADMIN + invalid key -> still allowed (Path A unregressed by a bad key present)", async () => {
      mockSessionValid = true;
      mockRole = "system_admin";
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest("totally-wrong-key"), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(sessionWorkspaceId);
    });

    it("valid diagnostic key + no user session -> allowed for the fixed D3 workspace (200), correct counts", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest(DIAGNOSTIC_KEY_TEST_VALUE), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.workspaceId).toBe(D3_FIXED_WORKSPACE_ID);
      // Seeded: trinity + sampleAcceptance + otherReal + fixtureBusiness = 4 total.
      expect(body.ownerBusiness.total).toBe(4);
      expect(body.ownerBusiness.fixtureTrue).toBe(2); // sampleAcceptance + fixtureBusiness
      expect(body.ownerBusiness.fixtureFalse).toBe(2); // trinity + otherReal
      expect(body.ownerBusiness.activeNonFixture).toBe(2); // trinity + otherReal
      expect(body.trinityServices).toEqual({ id: TRINITY_SERVICES_ID, isFixtureBusiness: false, isActive: true });
      expect(body.sampleAcceptanceBusiness).toEqual({ id: SAMPLE_ACCEPTANCE_BUSINESS_ID, isFixtureBusiness: true, isActive: true });
      expect(body.listBusinessesCount).toBe(2);
      expect(body.listBusinessesCount).toBe(body.ownerBusiness.activeNonFixture);
    });

    it("valid diagnostic key cannot select another workspace via query string", async () => {
      mockSessionValid = false;
      const someOtherWorkspaceId = randomUUID();
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(
        makeKeyRequest(DIAGNOSTIC_KEY_TEST_VALUE, `?workspaceId=${someOtherWorkspaceId}`),
        { params: Promise.resolve({}) }
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(D3_FIXED_WORKSPACE_ID);
      expect(body.workspaceId).not.toBe(someOtherWorkspaceId);
    });

    it("query-param diagnostic key is NOT accepted (header only)", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      // Key supplied ONLY via query string, no header -- must be rejected as Path B and fall
      // through to Path A's unmodified auth check (no session -> 401).
      const response = await GET(
        makeKeyRequest(undefined, `?key=${encodeURIComponent(DIAGNOSTIC_KEY_TEST_VALUE)}`),
        { params: Promise.resolve({}) }
      );
      expect(response.status).toBe(401);
    });

    it("response never contains the diagnostic key", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest(DIAGNOSTIC_KEY_TEST_VALUE), { params: Promise.resolve({}) });
      const raw = await response.text();
      expect(raw).not.toContain(DIAGNOSTIC_KEY_TEST_VALUE);
    });

    it("response never contains DATABASE_URL or a connection string (diagnostic-key path)", async () => {
      mockSessionValid = false;
      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      const response = await GET(makeKeyRequest(DIAGNOSTIC_KEY_TEST_VALUE), { params: Promise.resolve({}) });
      const raw = await response.text();
      expect(raw).not.toContain(process.env.DATABASE_URL ?? "__unset__");
      expect(raw).not.toMatch(/postgres(ql)?:\/\/[^"]*:[^"@]*@/i);
      expect(raw).not.toMatch(/password|passwd|secret|token|api_key/i);
    });

    it("performs zero mutations via the diagnostic-key path", async () => {
      mockSessionValid = false;
      const before = await db.ownerBusiness.findMany({
        where: { workspaceId: D3_FIXED_WORKSPACE_ID },
        select: { id: true, isFixtureBusiness: true, isActive: true, version: true },
        orderBy: { id: "asc" },
      });

      const { GET } = await import("@/app/api/admin/d3-runtime-diagnostic/route");
      await GET(makeKeyRequest(DIAGNOSTIC_KEY_TEST_VALUE), { params: Promise.resolve({}) });

      const after = await db.ownerBusiness.findMany({
        where: { workspaceId: D3_FIXED_WORKSPACE_ID },
        select: { id: true, isFixtureBusiness: true, isActive: true, version: true },
        orderBy: { id: "asc" },
      });
      expect(after).toEqual(before);
    });
  }
);
