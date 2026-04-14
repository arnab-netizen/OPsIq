import { describe, it, expect } from "vitest";
import { ROLE_LABELS, formatRole } from "./role-labels";
import { ROLES } from "./roles";

describe("role-labels", () => {
  it("has a label for every role", () => {
    const allRoles = Object.values(ROLES);
    for (const role of allRoles) {
      expect(ROLE_LABELS[role]).toBeDefined();
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it("formatRole returns the label for known roles", () => {
    expect(formatRole("system_admin")).toBe("System Admin");
    expect(formatRole("experienced_consultant")).toBe("Experienced Consultant");
    expect(formatRole("client_owner")).toBe("Client Owner");
  });

  it("formatRole returns the raw string for unknown roles", () => {
    expect(formatRole("unknown_role")).toBe("unknown_role");
  });
});
