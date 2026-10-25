/**
 * E. Production acceptance helpers must refuse to proceed when fixture isolation is unavailable and
 * must verify a created record really is a fixture before returning its id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => {
  const impl = { existsSync: vi.fn(() => false), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() };
  return { ...impl, default: impl };
});

import { resolveOrCreateDomainBusiness } from "../../../tests/production/helpers/domain-business";
import {
  assertFixtureCreationCapable,
  assertBusinessIsFixture,
  assertStartupSessionIsFixture,
  resetFixtureCapabilityPreflight,
  FIXTURE_ISOLATION_UNAVAILABLE,
} from "../../../tests/production/helpers/fixture-isolation";

const res = (status: number, body: unknown = {}) => ({ status: () => status, ok: () => status >= 200 && status < 300, json: async () => body });

function makePage(opts: { probe: number; created?: { status: number; body: unknown }; listBody?: unknown }) {
  const posts: string[] = [];
  const page = {
    request: {
      get: vi.fn(async (url: string) => {
        if (url.startsWith("/api/admin/fixture-businesses")) return res(opts.probe, { businesses: [] });
        return res(200, opts.listBody ?? []);
      }),
      post: vi.fn(async (url: string) => {
        posts.push(url);
        const c = opts.created ?? { status: 201, body: { id: "biz-1" } };
        return res(c.status, c.body);
      }),
    },
  };
  return { page, posts };
}

describe("production fixture-isolation helpers", () => {
  beforeEach(() => { vi.clearAllMocks(); resetFixtureCapabilityPreflight(); });

  it("refuses before creating anything when the actor cannot create fixtures (probe 403)", async () => {
    const { page, posts } = makePage({ probe: 403 });
    await expect(resolveOrCreateDomainBusiness(undefined, page as never, "finance")).rejects.toThrow(FIXTURE_ISOLATION_UNAVAILABLE);
    expect(posts).toHaveLength(0);
  });

  it("stops if the capability probe is anything but 200", async () => {
    for (const status of [401, 404, 500]) {
      resetFixtureCapabilityPreflight();
      const { page, posts } = makePage({ probe: status });
      await expect(resolveOrCreateDomainBusiness(undefined, page as never, "sales")).rejects.toThrow(/FIXTURE ISOLATION UNAVAILABLE/);
      expect(posts).toHaveLength(0);
    }
  });

  it("does not treat HTTP 201 as proof: a created business visible in the ordinary list fails the run", async () => {
    const { page } = makePage({ probe: 200, listBody: [{ id: "biz-1" }] });
    await expect(resolveOrCreateDomainBusiness(undefined, page as never, "finance")).rejects.toThrow(/visible in the ordinary owner list/);
  });

  it("returns the id only after the fixture is verified absent from the ordinary list", async () => {
    const { page } = makePage({ probe: 200, listBody: [{ id: "someone-else" }] });
    await expect(resolveOrCreateDomainBusiness(undefined, page as never, "finance")).resolves.toBe("biz-1");
  });

  it("a 403 from the corrected route surfaces as a failed creation, never a usable id", async () => {
    const { page } = makePage({ probe: 200, created: { status: 403, body: {} } });
    await expect(resolveOrCreateDomainBusiness(undefined, page as never, "finance")).rejects.toThrow(/HTTP 403/);
  });

  it("startup session verification fails when the session is in the ordinary list", async () => {
    const visible = makePage({ probe: 200, listBody: { sessions: [{ id: "s-1" }] } });
    await expect(assertStartupSessionIsFixture(undefined, visible.page as never, "s-1")).rejects.toThrow(/ordinary owner list/);
    const hidden = makePage({ probe: 200, listBody: { sessions: [] } });
    await expect(assertStartupSessionIsFixture(undefined, hidden.page as never, "s-1")).resolves.toBeUndefined();
    await expect(assertBusinessIsFixture(undefined, hidden.page as never, "b")).resolves.toBeUndefined();
    await expect(assertFixtureCreationCapable(undefined, hidden.page as never)).resolves.toBeUndefined();
  });
});
