import { describe, it, expect } from "vitest";
import { resolveFixtureRequest } from "@/policies/fixture-creation.policy";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ForbiddenError } from "@/infra/errors";

const owner = new Set<string>([CAPABILITIES.OWNER_MANAGE, CAPABILITIES.OWNER_VIEW]);
const admin = new Set<string>([CAPABILITIES.OWNER_MANAGE, CAPABILITIES.SYSTEM_ADMIN]);

describe("resolveFixtureRequest (fail-closed fixture authorization)", () => {
  it("absent or false never needs the capability and yields a non-fixture", () => {
    expect(resolveFixtureRequest(undefined, owner, "business", CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(resolveFixtureRequest(false, owner, "business", CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(resolveFixtureRequest(undefined, admin, "business", CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
  });

  it("explicit true without SYSTEM_ADMIN throws ForbiddenError — never a silent false", () => {
    for (const what of ["business", "startup session", "startup blueprint record"] as const) {
      expect(() => resolveFixtureRequest(true, owner, what, CAPABILITIES.SYSTEM_ADMIN)).toThrow(ForbiddenError);
    }
    expect(() => resolveFixtureRequest(true, new Set(), "business", CAPABILITIES.SYSTEM_ADMIN)).toThrow(ForbiddenError);
  });

  it("explicit true with SYSTEM_ADMIN is honored", () => {
    expect(resolveFixtureRequest(true, admin, "business", CAPABILITIES.SYSTEM_ADMIN)).toBe(true);
  });
});
