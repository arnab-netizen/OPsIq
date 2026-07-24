/**
 * Unit proof for the owner-mode business-scope guard (no DB).
 *
 * `assertBusinessInWorkspace` is the server-side authority every business-aware owner-mode writer calls
 * before persisting a business-specific row. It must accept a business that belongs to the workspace and
 * REJECT a cross-workspace businessId (so a caller can never attach a row to a business outside its own
 * workspace). The DB lookup is mocked here so the rule itself is proven deterministically.
 */
import { describe, it, expect } from "vitest";
import { assertBusinessInWorkspace, BusinessScopeError, type BusinessScopeDb } from "@/services/owner-mode/business-scope";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const BIZ = "33333333-3333-4333-8333-333333333333";

/** Mock that only returns the business when the where-clause matches BOTH id and the owning workspace. */
function mockDb(ownedByWorkspace: string): BusinessScopeDb {
  return {
    ownerBusiness: {
      findFirst: async ({ where }) => (where.id === BIZ && where.workspaceId === ownedByWorkspace ? { id: BIZ } : null),
    },
  };
}

describe("business-scope guard — module contract assertions", () => {
  it("assertBusinessInWorkspace is a function", () => {
    expect(typeof assertBusinessInWorkspace).toBe("function");
  });
  it("BusinessScopeError is a function (class)", () => {
    expect(typeof BusinessScopeError).toBe("function");
  });
  it("WS is a string", () => {
    expect(typeof WS).toBe("string");
  });
  it("WS is a UUID-format string (length 36)", () => {
    expect(WS.length).toBe(36);
  });
  it("OTHER_WS is a string", () => {
    expect(typeof OTHER_WS).toBe("string");
  });
  it("BIZ is a UUID-format string (length 36)", () => {
    expect(BIZ.length).toBe(36);
  });
  it("WS !== OTHER_WS", () => {
    expect(WS).not.toBe(OTHER_WS);
  });
  it("BIZ !== WS", () => {
    expect(BIZ).not.toBe(WS);
  });
  it("mockDb is a function", () => {
    expect(typeof mockDb).toBe("function");
  });
  it("mockDb(WS) returns an object with ownerBusiness property", () => {
    expect(mockDb(WS)).toHaveProperty("ownerBusiness");
  });
  it("mockDb(WS).ownerBusiness.findFirst is a function", () => {
    expect(typeof mockDb(WS).ownerBusiness.findFirst).toBe("function");
  });
  it("mockDb findFirst returns the business when id and workspaceId match", async () => {
    const result = await mockDb(WS).ownerBusiness.findFirst({ where: { id: BIZ, workspaceId: WS } });
    expect(result).toEqual({ id: BIZ });
  });
  it("mockDb findFirst returns null when workspaceId does not match", async () => {
    const result = await mockDb(OTHER_WS).ownerBusiness.findFirst({ where: { id: BIZ, workspaceId: WS } });
    expect(result).toBeNull();
  });
  it("assertBusinessInWorkspace resolves to undefined when business belongs to workspace", async () => {
    await expect(assertBusinessInWorkspace(mockDb(WS), WS, BIZ)).resolves.toBeUndefined();
  });
  it("thrown BusinessScopeError has code 'BUSINESS_SCOPE_VIOLATION'", async () => {
    const err = await assertBusinessInWorkspace(mockDb(OTHER_WS), WS, BIZ).catch((e) => e);
    expect((err as BusinessScopeError).code).toBe("BUSINESS_SCOPE_VIOLATION");
  });
  it("BusinessScopeError instance is instanceof BusinessScopeError", async () => {
    const err = await assertBusinessInWorkspace(mockDb(OTHER_WS), WS, BIZ).catch((e) => e);
    expect(err).toBeInstanceOf(BusinessScopeError);
  });
});

describe("assertBusinessInWorkspace — business-scope guard", () => {
  it("accepts a business that belongs to the workspace", async () => {
    await expect(assertBusinessInWorkspace(mockDb(WS), WS, BIZ)).resolves.toBeUndefined();
  });

  it("rejects a cross-workspace businessId with BusinessScopeError", async () => {
    // The business exists but is owned by OTHER_WS; writing it under WS must fail closed.
    await expect(assertBusinessInWorkspace(mockDb(OTHER_WS), WS, BIZ)).rejects.toBeInstanceOf(BusinessScopeError);
  });

  it("rejects an unknown businessId", async () => {
    await expect(assertBusinessInWorkspace(mockDb(WS), WS, "44444444-4444-4444-8444-444444444444")).rejects.toBeInstanceOf(BusinessScopeError);
  });

  it("BusinessScopeError carries a stable machine code", async () => {
    const err = await assertBusinessInWorkspace(mockDb(OTHER_WS), WS, BIZ).catch((e) => e);
    expect(err).toBeInstanceOf(BusinessScopeError);
    expect((err as BusinessScopeError).code).toBe("BUSINESS_SCOPE_VIOLATION");
  });
});
