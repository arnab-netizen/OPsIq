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

describe("resolveOrCreateDomainBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always sends isFixtureBusiness: true when creating a dedicated acceptance business", async () => {
    let capturedBody: unknown;
    const page = {
      request: {
        post: vi.fn(async (_url: string, opts: { data: unknown }) => {
          capturedBody = opts.data;
          return { ok: () => true, status: () => 201, json: async () => ({ id: "biz-123" }) };
        }),
      },
    };

    const id = await resolveOrCreateDomainBusiness(undefined, page as never, "finance");

    expect(id).toBe("biz-123");
    expect(capturedBody).toMatchObject({ isFixtureBusiness: true });
  });
});
