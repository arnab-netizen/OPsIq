/**
 * Open-beta hostile audit — the two /api/internal/* diagnostic routes that
 * MUTATE the database (create/relink demo engagements; grant a
 * UserRoleAssignment) must never be reachable in production merely because
 * the shared OPSIQ_DIAGNOSTIC_KEY leaked (a single secret shared across a
 * dozen endpoints). They must now double-gate exactly like
 * /api/internal/smoke-cleanup already did: a hard production-environment
 * check, in addition to (and evaluated before) the diagnostic key.
 *
 * No database access is required for the refusal path: isNonProductionEnvironment()
 * is checked and returns before either route ever calls db.*, so these tests
 * prove the gate itself, independent of DB availability.
 */
import { describe, it, expect, afterEach } from "vitest";
import { isNonProductionEnvironment } from "@/lib/security/diagnostic-key";

const DIAGNOSTIC_KEY = "test-diagnostic-key-for-gate-proof";

function requestWithKey(key?: string): Request {
  return new Request("http://localhost/api/internal/x", {
    method: "POST",
    headers: key ? { "x-opsiq-diagnostic-key": key } : {},
  });
}

describe("isNonProductionEnvironment", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  });

  it("is false when VERCEL_ENV is production, regardless of NODE_ENV", () => {
    process.env.VERCEL_ENV = "production";
    Object.assign(process.env, { NODE_ENV: "development" });
    expect(isNonProductionEnvironment()).toBe(false);
  });

  it("is true for NODE_ENV=test with no VERCEL_ENV set (the vitest environment itself)", () => {
    delete process.env.VERCEL_ENV;
    Object.assign(process.env, { NODE_ENV: "test" });
    expect(isNonProductionEnvironment()).toBe(true);
  });

  it("is true for NODE_ENV=development with no VERCEL_ENV set", () => {
    delete process.env.VERCEL_ENV;
    Object.assign(process.env, { NODE_ENV: "development" });
    expect(isNonProductionEnvironment()).toBe(true);
  });

  it("is false for any other NODE_ENV value (e.g. unset/'production')", () => {
    delete process.env.VERCEL_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    expect(isNonProductionEnvironment()).toBe(false);
  });
});

describe("POST /api/internal/demo-engagement-proof — production write gate", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalKey === undefined) delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    else process.env.OPSIQ_DIAGNOSTIC_KEY = originalKey;
  });

  it("returns 404 in production even with a correct diagnostic key (no DB call reached)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
    const { POST } = await import("@/app/api/internal/demo-engagement-proof/route");
    const res = await POST(requestWithKey(DIAGNOSTIC_KEY) as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 in production with no key at all", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    const { POST } = await import("@/app/api/internal/demo-engagement-proof/route");
    const res = await POST(requestWithKey() as never);
    expect(res.status).toBe(404);
  });

  it("still requires the diagnostic key outside production (environment gate alone is not sufficient)", async () => {
    delete process.env.VERCEL_ENV;
    process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
    const { POST } = await import("@/app/api/internal/demo-engagement-proof/route");
    const res = await POST(requestWithKey("wrong-key") as never);
    expect(res.status).toBe(404); // unauthorized also returns 404, not 401, by existing design
  });
});

describe("POST /api/internal/demo-permission-proof — production write gate", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalKey === undefined) delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    else process.env.OPSIQ_DIAGNOSTIC_KEY = originalKey;
  });

  it("returns 404 in production even with a correct diagnostic key (no DB call reached — this route GRANTS a role assignment)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
    const { POST } = await import("@/app/api/internal/demo-permission-proof/route");
    const res = await POST(requestWithKey(DIAGNOSTIC_KEY) as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 in production with no key at all", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    const { POST } = await import("@/app/api/internal/demo-permission-proof/route");
    const res = await POST(requestWithKey() as never);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/internal/smoke-cleanup — unchanged behavior after refactor to the shared guard", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalKey === undefined) delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    else process.env.OPSIQ_DIAGNOSTIC_KEY = originalKey;
  });

  it("still returns 404 in production (regression guard: switching to the shared isNonProductionEnvironment helper must not change this route's own behavior)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
    const { DELETE } = await import("@/app/api/internal/smoke-cleanup/route");
    const res = await DELETE(requestWithKey(DIAGNOSTIC_KEY) as never);
    expect(res.status).toBe(404);
  });
});
