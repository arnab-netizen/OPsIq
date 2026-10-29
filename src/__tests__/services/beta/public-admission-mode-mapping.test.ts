/**
 * src/services/beta/public-presentation.service.ts's row-interpretation
 * logic (missing row -> legacy fallback, malformed admission_mode -> fail
 * closed, valid row -> returned exactly) duplicates
 * readEffectiveSettings()'s legacy-fallback/validity rules by calling the
 * same two exported helpers, but applies them to a raw SQL row shape
 * instead of a Prisma row -- this had zero direct test coverage (the DB
 * tests in stage8/ deliberately hold the pool busy so the query never
 * returns a row at all). Unit-level, no real DB: mocks `@/lib/db`'s
 * `getRawPool`/`withRawStatementTimeout` to hand back a controlled raw
 * `{ rows: [...] }` result directly.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue({}),
  getRawPool: vi.fn().mockResolvedValue({ connect: vi.fn(), query: vi.fn() }),
  withRawStatementTimeout: vi.fn(),
}));

const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
  else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
});

describe("public-presentation.service.ts admission-mode row mapping", () => {
  it("no platform_settings row: falls back to the legacy env-derived mode (INVITE_ONLY leg)", async () => {
    delete process.env.PUBLIC_BETA_ENABLED;
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");
    await expect(getPublicAdmissionMode()).resolves.toBe("INVITE_ONLY");
  });

  it("no platform_settings row: falls back to the legacy env-derived mode (OPEN_BETA leg, matching readEffectiveSettings() exactly)", async () => {
    process.env.PUBLIC_BETA_ENABLED = "true";
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");
    await expect(getPublicAdmissionMode()).resolves.toBe("OPEN_BETA");
  });

  it("a malformed admission_mode value fails closed to null, never silently passed through", async () => {
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ admission_mode: "NOT_A_REAL_MODE" }],
    });

    const { getPublicAdmissionMode, getPublicBetaPresentation } = await import(
      "@/services/beta/public-presentation.service"
    );
    await expect(getPublicAdmissionMode()).resolves.toBeNull();
    const presentation = await getPublicBetaPresentation();
    expect(presentation.openRegistration).toBe(false);
  });

  it("a valid row's admission_mode is returned exactly (OPEN_BETA)", async () => {
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ admission_mode: "OPEN_BETA" }],
    });

    const { getPublicAdmissionMode, getPublicBetaPresentation } = await import(
      "@/services/beta/public-presentation.service"
    );
    await expect(getPublicAdmissionMode()).resolves.toBe("OPEN_BETA");
    const presentation = await getPublicBetaPresentation();
    expect(presentation.openRegistration).toBe(true);
    expect(presentation.primaryCtaLabel).toBe("Start free");
  });

  it("a valid row's admission_mode is returned exactly (INVITE_ONLY)", async () => {
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ admission_mode: "INVITE_ONLY" }],
    });

    const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");
    await expect(getPublicAdmissionMode()).resolves.toBe("INVITE_ONLY");
  });

  it("a thrown error (acquisition timeout, backstop, connection error, anything) fails closed to null / INVITE_ONLY, never throws to the caller", async () => {
    const { withRawStatementTimeout } = await import("@/lib/db");
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("simulated failure"));

    const { getPublicAdmissionMode, getPublicBetaPresentation } = await import(
      "@/services/beta/public-presentation.service"
    );
    await expect(getPublicAdmissionMode()).resolves.toBeNull();
    const presentation = await getPublicBetaPresentation();
    expect(presentation.openRegistration).toBe(false);
    expect(presentation.primaryCtaLabel).toBe("Request beta access");
  });
});
