/**
 * POST /api/auth/signup — first/last-touch UTM attribution wiring.
 *
 * Proves three things about the new, optional `firstTouchAttribution` /
 * `lastTouchAttribution` request fields (src/lib/attribution/attribution-store.ts is the client-side
 * source of these values; see src/app/signup/page.tsx):
 *   1. A genuine signup with well-formed attribution succeeds, and the USER_CREATED audit event
 *      records PRESENCE only (hasFirstTouchAttribution / hasLastTouchAttribution booleans) — never
 *      the raw UTM text, mirroring the precedent already set by beta_request.created in
 *      src/app/api/beta-requests/route.ts.
 *   2. A malicious-looking value (e.g. a <script> payload in utm_source) never fails the signup and
 *      never reaches the audit payload in any form — it is silently dropped before validation even
 *      finishes, so hasFirstTouchAttribution is computed as if that field were absent.
 *   3. A signup with no attribution fields at all (today's shape) is unaffected.
 *
 * Fully mocked — no real Postgres. The admission gate is forced to OPEN_BETA so execution reaches
 * the account-graph transaction and the audit emit without exercising beta-cap/invite logic, which
 * is covered elsewhere (signup-controlled-beta-admission.test.ts, beta-kill-switch.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infra/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infra/audit")>()),
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/beta/platform-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/beta/platform-settings.service")>()),
  readEffectiveSettings: vi.fn().mockResolvedValue({ admissionMode: "OPEN_BETA", capacityLimit: 999 }),
}));

vi.mock("@/services/auth/beta-cap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth/beta-cap")>()),
  reservePublicBetaCapacity: vi.fn().mockResolvedValue({ admissionMode: "OPEN_BETA" }),
}));

vi.mock("@/lib/beta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/beta")>()),
  isBetaRequestInvited: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/services/beta/capacity-alerts.service", () => ({
  checkAndSendCapacityAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@/lib/config", () => ({
  getConfig: vi.fn().mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://opsiq.solutions" }),
}));

const mocks = vi.hoisted(() => ({
  findUniqueUser: vi.fn(),
  txUserCreate: vi.fn(),
  txWorkspaceCreate: vi.fn(),
  txWorkspaceMembershipCreate: vi.fn(),
  txUserRoleAssignmentCreate: vi.fn(),
  txEmailVerificationTokenCreate: vi.fn(),
  withStatementTimeout: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: mocks.findUniqueUser } },
  withStatementTimeout: mocks.withStatementTimeout,
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

function signupRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = { email: "attributed-signup@example.com", workspaceName: "Attribution Co" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUniqueUser.mockResolvedValue(null);
  mocks.txUserCreate.mockImplementation(async ({ data }: { data: { id: string; email: string } }) => ({ id: data.id, email: data.email }));
  mocks.txWorkspaceCreate.mockImplementation(async ({ data }: { data: { id: string; name: string; slug: string; signupSource: string } }) => ({
    id: data.id,
    name: data.name,
    slug: data.slug,
    signupSource: data.signupSource,
  }));
  mocks.txWorkspaceMembershipCreate.mockResolvedValue({});
  mocks.txUserRoleAssignmentCreate.mockResolvedValue({});
  mocks.txEmailVerificationTokenCreate.mockResolvedValue({});
  mocks.withStatementTimeout.mockImplementation(async (_db: unknown, _ms: number, callback: (tx: unknown) => unknown) =>
    callback({
      user: { create: mocks.txUserCreate },
      workspace: { create: mocks.txWorkspaceCreate },
      workspaceMembership: { create: mocks.txWorkspaceMembershipCreate },
      userRoleAssignment: { create: mocks.txUserRoleAssignmentCreate },
      emailVerificationToken: { create: mocks.txEmailVerificationTokenCreate },
    })
  );
});

async function userCreatedPayload(emitAuditEventMock: ReturnType<typeof vi.fn>) {
  const { AUDIT_EVENTS } = await import("@/domain/constants/audit-events");
  const call = emitAuditEventMock.mock.calls.find((c) => c[0].eventName === AUDIT_EVENTS.USER_CREATED);
  return call?.[0].payload as Record<string, unknown> | undefined;
}

describe("POST /api/auth/signup — UTM attribution", () => {
  it("records presence-only booleans on USER_CREATED when well-formed attribution is supplied, never the raw values", async () => {
    const { emitAuditEvent } = await import("@/infra/audit");
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(
      signupRequest({
        ...BASE_BODY,
        firstTouchAttribution: { utmSource: "linkedin", utmMedium: "social", utmCampaign: "launch-2026" },
        lastTouchAttribution: { utmSource: "google", utmMedium: "cpc" },
      }) as never
    );

    expect(res.status).toBe(201);
    const payload = await userCreatedPayload(emitAuditEvent as never);
    expect(payload).toMatchObject({ hasFirstTouchAttribution: true, hasLastTouchAttribution: true });
    // The raw campaign strings must never appear anywhere in the audit payload.
    expect(JSON.stringify(payload)).not.toMatch(/linkedin|google|launch-2026|cpc|social/);
  });

  it("succeeds and records hasFirstTouchAttribution=false/hasLastTouchAttribution=false when neither is supplied (pre-existing shape)", async () => {
    const { emitAuditEvent } = await import("@/infra/audit");
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(signupRequest(BASE_BODY) as never);

    expect(res.status).toBe(201);
    const payload = await userCreatedPayload(emitAuditEvent as never);
    expect(payload).toMatchObject({ hasFirstTouchAttribution: false, hasLastTouchAttribution: false });
  });

  it.each([
    ["a script tag", { utmSource: "<script>alert(1)</script>" }],
    ["a javascript: scheme value", { utmCampaign: "javascript:alert(1)" }],
    ["an angle-bracket injection in a different field", { utmContent: "\"><img src=x onerror=alert(1)>" }],
    ["an over-long value", { utmTerm: "x".repeat(500) }],
  ])(
    "never fails signup and never lets %s reach the audit payload in any form",
    async (_label, maliciousTag) => {
      const { emitAuditEvent } = await import("@/infra/audit");
      const { POST } = await import("@/app/api/auth/signup/route");

      const res = await POST(
        signupRequest({
          ...BASE_BODY,
          email: `malicious-${Date.now()}@example.com`,
          firstTouchAttribution: maliciousTag,
        }) as never
      );

      // The malicious attribution value must never turn a genuine account creation into a failure.
      expect(res.status).toBe(201);
      const payload = await userCreatedPayload(emitAuditEvent as never);
      // A sole malicious field means nothing ELSE in that object was valid either, so presence is false.
      expect(payload?.hasFirstTouchAttribution).toBe(false);
      expect(JSON.stringify(payload)).not.toMatch(/script|javascript:|onerror|alert\(1\)/i);
    }
  );

  it("drops only the malicious leaf while keeping other well-formed leaves in the same object", async () => {
    const { emitAuditEvent } = await import("@/infra/audit");
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(
      signupRequest({
        ...BASE_BODY,
        firstTouchAttribution: { utmSource: "<script>bad</script>", utmMedium: "newsletter" },
      }) as never
    );

    expect(res.status).toBe(201);
    const payload = await userCreatedPayload(emitAuditEvent as never);
    // utmMedium alone is enough for presence to be true, and the script payload must still never surface.
    expect(payload?.hasFirstTouchAttribution).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/script/i);
  });
});
