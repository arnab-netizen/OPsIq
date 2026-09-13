/**
 * POST /api/auth/signup — controlled-beta admission while PUBLIC_BETA_ENABLED
 * is false.
 *
 * Root cause under test: before this change, PUBLIC_BETA_ENABLED=false
 * refused every signup unconditionally. Controlled beta needs a second,
 * narrower admission path: an owner-invited applicant (BetaRequest.status ===
 * "INVITED") must be able to complete the existing signup flow even while
 * public registration stays closed — see markBetaRequestInvited in
 * admin-operability.service.ts for how a request becomes INVITED, and
 * isBetaRequestInvited in @/lib/beta for the lookup this gate uses.
 *
 * DB-free: only db.betaRequest.findUnique is mocked. db.user.findUnique and
 * the account-graph transaction are never reached by any test here — every
 * denied case short-circuits before request-body validation runs, and the
 * one admitted case uses a body that is otherwise invalid (missing consents,
 * exactly the same trick beta-kill-switch.test.ts uses for the enabled case)
 * so the test can observe "reached validation" without needing to mock the
 * full account-creation transaction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueBetaRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    betaRequest: { findUnique: mocks.findUniqueBetaRequest },
    user: { findUnique: vi.fn() },
  },
  withStatementTimeout: vi.fn(),
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

function signupRequest(body: unknown, opts: { rawJson?: string } = {}): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.rawJson ?? JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: "invitee@example.com",
  password: "password123",
  workspaceName: "Invitee Co",
  acceptTerms: true,
  acceptPrivacy: true,
  acceptBetaNotice: true,
};

describe("POST /api/auth/signup — controlled-beta admission (PUBLIC_BETA_ENABLED=false)", () => {
  const originalFlag = process.env.PUBLIC_BETA_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_BETA_ENABLED = "false";
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = originalFlag;
  });

  it("denies with beta_disabled when no BetaRequest exists for the email", async () => {
    mocks.findUniqueBetaRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(VALID_BODY) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: "Open beta registration is currently closed. Please check back soon.",
      reason: "beta_disabled",
    });
  });

  it("denies with beta_disabled when a BetaRequest exists but is still REQUESTED", async () => {
    mocks.findUniqueBetaRequest.mockResolvedValue({ status: "REQUESTED" });
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(VALID_BODY) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reason).toBe("beta_disabled");
  });

  it("admits the request past the gate when the BetaRequest is INVITED — falls through to real validation", async () => {
    mocks.findUniqueBetaRequest.mockResolvedValue({ status: "INVITED" });
    const { POST } = await import("@/app/api/auth/signup/route");
    // Otherwise-invalid body (missing all three consents): if the gate had
    // refused, this would be a 403 beta_disabled. Observing the validation
    // stage's 400 instead is the proof the gate admitted it.
    const invalidButAdmissible = { email: VALID_BODY.email, password: VALID_BODY.password, workspaceName: VALID_BODY.workspaceName };
    const res = await POST(signupRequest(invalidButAdmissible) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
    expect(json.error).not.toMatch(/prisma|stack|internal server error/i);
  });

  it("normalizes case/whitespace before the BetaRequest lookup, matching identityEmailSchema", async () => {
    mocks.findUniqueBetaRequest.mockResolvedValue({ status: "INVITED" });
    const { POST } = await import("@/app/api/auth/signup/route");
    const invalidButAdmissible = {
      email: "  Invitee@Example.com  ",
      password: VALID_BODY.password,
      workspaceName: VALID_BODY.workspaceName,
    };
    await POST(signupRequest(invalidButAdmissible) as never);
    expect(mocks.findUniqueBetaRequest).toHaveBeenCalledWith({
      where: { email: "invitee@example.com" },
      select: { status: true },
    });
  });

  it("denies identically when the request body is not valid JSON at all", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(undefined, { rawJson: "not json" }) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reason).toBe("beta_disabled");
    expect(mocks.findUniqueBetaRequest).not.toHaveBeenCalled();
  });

  it("denies identically when the email field is missing or malformed", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    for (const badEmail of [{}, { email: "not-an-email" }, { email: 12345 }]) {
      const res = await POST(signupRequest(badEmail) as never);
      expect(res.status, JSON.stringify(badEmail)).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe("beta_disabled");
    }
  });

  it("returns byte-identical denial bodies for 'no request', 'REQUESTED', and 'unparseable body'", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    mocks.findUniqueBetaRequest.mockResolvedValue(null);
    const noRequestRes = await POST(signupRequest(VALID_BODY) as never);
    const noRequestBody = await noRequestRes.json();

    mocks.findUniqueBetaRequest.mockResolvedValue({ status: "REQUESTED" });
    const requestedRes = await POST(signupRequest(VALID_BODY) as never);
    const requestedBody = await requestedRes.json();

    const garbageRes = await POST(signupRequest(undefined, { rawJson: "{{{" }) as never);
    const garbageBody = await garbageRes.json();

    expect(noRequestRes.status).toBe(requestedRes.status);
    expect(requestedRes.status).toBe(garbageRes.status);
    expect(noRequestBody).toEqual(requestedBody);
    expect(requestedBody).toEqual(garbageBody);
  });

  it("this gate never runs the BetaRequest lookup while public beta is enabled (unchanged behavior)", async () => {
    process.env.PUBLIC_BETA_ENABLED = "true";
    const { POST } = await import("@/app/api/auth/signup/route");
    const invalidBody = { email: VALID_BODY.email, password: VALID_BODY.password, workspaceName: VALID_BODY.workspaceName };
    const res = await POST(signupRequest(invalidBody) as never);
    expect(res.status).toBe(400); // reaches validation exactly as before this change
    expect(mocks.findUniqueBetaRequest).not.toHaveBeenCalled();
  });
});
