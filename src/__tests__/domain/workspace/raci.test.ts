import { describe, it, expect } from "vitest";
import { validateRaci, accountableUser, assertValidRaci, RaciValidationError, RaciRole, type RaciAssignment } from "@/domain/workspace/raci";

const A = (userId: string, role: RaciRole): RaciAssignment => ({ userId, role });

describe("[module13] RACI accountability matrix", () => {
  it("a valid matrix has exactly one accountable + >=1 responsible", () => {
    const r = validateRaci([A("u1", RaciRole.ACCOUNTABLE), A("u2", RaciRole.RESPONSIBLE), A("u3", RaciRole.CONSULTED)]);
    expect(r.ok).toBe(true);
    expect(r.accountableUserId).toBe("u1");
    expect(r.responsibleUserIds).toEqual(["u2"]);
  });

  it("allows one person to be both accountable and responsible", () => {
    expect(validateRaci([A("u1", RaciRole.ACCOUNTABLE), A("u1", RaciRole.RESPONSIBLE)]).ok).toBe(true);
  });

  it("rejects zero or multiple accountable", () => {
    expect(validateRaci([A("u2", RaciRole.RESPONSIBLE)]).violations.join(" ")).toMatch(/No ACCOUNTABLE/);
    expect(validateRaci([A("u1", RaciRole.ACCOUNTABLE), A("u2", RaciRole.ACCOUNTABLE), A("u3", RaciRole.RESPONSIBLE)]).violations.join(" ")).toMatch(/Multiple ACCOUNTABLE/);
  });

  it("rejects missing responsible", () => {
    expect(validateRaci([A("u1", RaciRole.ACCOUNTABLE)]).violations.join(" ")).toMatch(/No RESPONSIBLE/);
  });

  it("rejects duplicate (user, role) and empty userId", () => {
    expect(validateRaci([A("u1", RaciRole.ACCOUNTABLE), A("u1", RaciRole.RESPONSIBLE), A("u1", RaciRole.RESPONSIBLE)]).violations.join(" ")).toMatch(/Duplicate/);
    expect(validateRaci([A("", RaciRole.ACCOUNTABLE), A("u2", RaciRole.RESPONSIBLE)]).violations.join(" ")).toMatch(/empty userId/);
  });

  it("accountableUser returns the single A or null when invalid", () => {
    expect(accountableUser([A("u1", RaciRole.ACCOUNTABLE), A("u2", RaciRole.RESPONSIBLE)])).toBe("u1");
    expect(accountableUser([A("u2", RaciRole.RESPONSIBLE)])).toBeNull();
  });

  it("the guard throws RaciValidationError on an invalid matrix", () => {
    expect(() => assertValidRaci([A("u1", RaciRole.ACCOUNTABLE), A("u2", RaciRole.RESPONSIBLE)], "act-1")).not.toThrow();
    try {
      assertValidRaci([A("u1", RaciRole.CONSULTED)], "act-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RaciValidationError);
      expect((e as RaciValidationError).code).toBe("RACI_INVALID");
      expect((e as RaciValidationError).violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});
