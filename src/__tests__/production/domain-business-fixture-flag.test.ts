/**
 * P0-B — every acceptance/QA business-creation path must explicitly mark itself as a fixture at
 * creation time, not rely on a human remembering to pass a flag. This proves
 * resolveOrCreateDomainBusiness() (tests/production/helpers/domain-business.ts) — the shared
 * helper 7 production acceptance specs use to create their own dedicated business — always sends
 * isFixtureBusiness: true in its POST body, and never depends on any caller-supplied option to do
 * so.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => {
  const impl = {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
  return { ...impl, default: impl };
});

import { resolveOrCreateDomainBusiness } from "../../../tests/production/helpers/domain-business";
import { resetFixtureCapabilityPreflight } from "../../../tests/production/helpers/fixture-isolation";

describe("resolveOrCreateDomainBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFixtureCapabilityPreflight();
  });

  it("creates acceptance businesses ONLY through the fixture-only route and never sends a fixture flag", async () => {
    let capturedBody: unknown;
    let capturedUrl = "";
    const page = {
      request: {
        get: vi.fn(async (url: string) =>
          url === "/api/admin/acceptance-fixtures/capability"
            ? { status: () => 200, ok: () => true, json: async () => ({ acceptanceFixtureAuthority: true }) }
            : { status: () => 200, ok: () => true, json: async () => [] }
        ),
        post: vi.fn(async (url: string, opts: { data: unknown }) => {
          capturedUrl = url;
          capturedBody = opts.data;
          return { ok: () => true, status: () => 201, json: async () => ({ id: "biz-123" }) };
        }),
      },
    };

    const id = await resolveOrCreateDomainBusiness(undefined, page as never, "finance");

    expect(id).toBe("biz-123");
    expect(capturedUrl).toBe("/api/admin/acceptance-fixtures/businesses");
    expect(capturedBody).not.toHaveProperty("isFixtureBusiness");
    expect(capturedBody).not.toHaveProperty("isFixtureRecord");
  });
});
