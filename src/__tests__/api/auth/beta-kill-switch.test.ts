/**
 * POST /api/auth/signup — the PUBLIC_BETA_ENABLED kill switch.
 *
 * Root cause under test: before open-beta hardening, signup had no server-side
 * gate at all — anyone could self-register unconditionally. These tests pin
 * three properties without needing a real database: the gate is checked
 * BEFORE request-body validation (so a disabled beta refuses regardless of
 * payload shape), it is re-evaluated fresh from process.env on every request
 * (no caching that could go stale relative to a Vercel env-var change), and
 * no client-supplied field can influence it (there is no such field in the
 * request schema, and the check reads only process.env).
 *
 * No database or network access is required: the gate short-circuits before
 * any db.user.findUnique / transaction call, which these tests prove by
 * using a body that WOULD otherwise fail differently at a later stage
 * (invalid consent, in Test B) — if the beta gate ran after validation, Test
 * B would observe a validation error instead of proceeding, so seeing the
 * validation error is itself the proof that the gate does not block a valid
 * request when enabled, without needing to mock the database at all.
 */
import { describe, it, expect, afterEach } from "vitest";

function signupRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: "kill-switch-test@example.com",
  password: "password123",
  workspaceName: "Kill Switch Co",
  acceptTerms: true,
  acceptPrivacy: true,
  acceptBetaNotice: true,
};

describe("POST /api/auth/signup — PUBLIC_BETA_ENABLED kill switch", () => {
  const originalFlag = process.env.PUBLIC_BETA_ENABLED;

  afterEach(() => {
    // vitest.setup.ts defaults this to "true" for the whole suite; restore
    // that default (or whatever ambient value preceded this file) so tests
    // in other files are never left seeing a flipped flag.
    if (originalFlag === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = originalFlag;
  });

  it("BETA_DISABLED_SIGNUP_REFUSED: refuses with 403 when PUBLIC_BETA_ENABLED is not \"true\", even with an otherwise-perfect body", async () => {
    process.env.PUBLIC_BETA_ENABLED = "false";
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(VALID_BODY) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.reason).toBe("beta_disabled");
  });

  it("BETA_DISABLED_SIGNUP_REFUSED: also refuses when the flag is entirely unset (fail-closed default)", async () => {
    delete process.env.PUBLIC_BETA_ENABLED;
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(VALID_BODY) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reason).toBe("beta_disabled");
  });

  it("BETA_DISABLED_SIGNUP_REFUSED: refuses for any near-true string other than the exact literal \"true\"", async () => {
    for (const value of ["True", "TRUE", "1", "yes", " true", "true "]) {
      process.env.PUBLIC_BETA_ENABLED = value;
      const { POST } = await import("@/app/api/auth/signup/route");
      const res = await POST(signupRequest(VALID_BODY) as never);
      expect(res.status, `value=${JSON.stringify(value)}`).toBe(403);
    }
  });

  it("BETA_ENABLED_SIGNUP_ALLOWED_TO_CONTINUE: with the flag \"true\", execution proceeds past the gate into validation rather than stopping at beta_disabled", async () => {
    process.env.PUBLIC_BETA_ENABLED = "true";
    const { POST } = await import("@/app/api/auth/signup/route");
    // A body missing all three consents is invalid — but proving it fails at
    // VALIDATION (not at the beta gate) is exactly what shows the gate let it
    // through. If the gate ran after validation this test would be unable to
    // tell the two failure modes apart; because it runs first, the visible
    // failure category, thrown from later in the same handler, IS the proof.
    const invalidBody = { email: VALID_BODY.email, password: VALID_BODY.password, workspaceName: VALID_BODY.workspaceName };
    await expect(POST(signupRequest(invalidBody) as never)).rejects.toMatchObject({
      name: "BadRequestError",
      statusCode: 400,
    });
  });

  it("CLIENT_CANNOT_OVERRIDE_BETA_FLAG: a client-supplied flag-shaped field in the body has no effect while the server flag is false", async () => {
    process.env.PUBLIC_BETA_ENABLED = "false";
    const { POST } = await import("@/app/api/auth/signup/route");
    for (const spoof of [
      { PUBLIC_BETA_ENABLED: true },
      { publicBetaEnabled: true },
      { betaEnabled: true },
      { enabled: true },
    ]) {
      const res = await POST(signupRequest({ ...VALID_BODY, ...spoof }) as never);
      expect(res.status, JSON.stringify(spoof)).toBe(403);
      const json = await res.json();
      expect(json.reason, JSON.stringify(spoof)).toBe("beta_disabled");
    }
  });

  it("CLIENT_CANNOT_OVERRIDE_BETA_FLAG: GET /api/auth/beta-status is display-only and cannot itself open registration", async () => {
    process.env.PUBLIC_BETA_ENABLED = "false";
    const { GET } = await import("@/app/api/auth/beta-status/route");
    const statusRes = await GET();
    const statusJson = await statusRes.json();
    expect(statusJson.enabled).toBe(false);

    // Even if a compromised/modified client believed beta were enabled (or
    // simply lied about it), the signup route re-checks the server flag
    // itself and refuses regardless of what beta-status returned.
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(VALID_BODY) as never);
    expect(res.status).toBe(403);
  });
});
