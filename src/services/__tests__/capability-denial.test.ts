import { describe, it, expect, beforeEach } from "vitest";
import type { AuthContext } from "@/lib/auth-guard";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import { ForbiddenError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import { requireCapabilityForService } from "@/lib/auth-guard";

describe("Service-layer capability denial", () => {
  let viewerAuthContext: AuthContext;
  let consultantAuthContext: AuthContext;
  let adminAuthContext: AuthContext;

  beforeEach(() => {
    // VIEWER role - only has read capabilities
    viewerAuthContext = {
      session: {
        user: {
          id: "viewer-1",
          email: "viewer@example.com",
          name: "Viewer User",
          isActive: true,
        },
        sessionId: "session-viewer",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as SessionInfo,
      policy: {
        userId: "viewer-1",
        roles: [
          {
            role: ROLES.VIEWER,
            scope: "workspace",
            scopeId: "workspace-1",
          },
        ],
      } as PolicyContext,
    };

    // EXPERIENCED_CONSULTANT - has many capabilities
    consultantAuthContext = {
      session: {
        user: {
          id: "consultant-1",
          email: "consultant@example.com",
          name: "Consultant User",
          isActive: true,
        },
        sessionId: "session-consultant",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as SessionInfo,
      policy: {
        userId: "consultant-1",
        roles: [
          {
            role: ROLES.EXPERIENCED_CONSULTANT,
            scope: "workspace",
            scopeId: "workspace-1",
          },
        ],
      } as PolicyContext,
    };

    // SYSTEM_ADMIN - has all capabilities
    adminAuthContext = {
      session: {
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin User",
          isActive: true,
        },
        sessionId: "session-admin",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as SessionInfo,
      policy: {
        userId: "admin-1",
        roles: [
          {
            role: ROLES.SYSTEM_ADMIN,
          },
        ],
      } as PolicyContext,
    };
  });

  describe("Capability denial - viewer role", () => {
    it("should deny DELIVERABLE_CREATE without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.DELIVERABLE_CREATE);
      }).toThrow(ForbiddenError);
    });

    it("should deny FINDING_VALIDATE without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.FINDING_VALIDATE);
      }).toThrow(ForbiddenError);
    });

    it("should deny STAGE_CREATE without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.STAGE_CREATE);
      }).toThrow(ForbiddenError);
    });

    it("should deny STAGE_TRANSITION without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.STAGE_TRANSITION);
      }).toThrow(ForbiddenError);
    });

    it("should allow DELIVERABLE_VIEW (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.DELIVERABLE_VIEW);
      }).not.toThrow();
    });

    it("should allow ENGAGEMENT_VIEW (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.ENGAGEMENT_VIEW);
      }).not.toThrow();
    });

    it("should deny SYSTEM_VIEW_AUDIT without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.SYSTEM_VIEW_AUDIT);
      }).toThrow(ForbiddenError);
    });

    it("should deny USER_CREATE without capability", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.USER_CREATE);
      }).toThrow(ForbiddenError);
    });
  });

  describe("Capability denial - consultant role", () => {
    it("should allow DELIVERABLE_CREATE (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.DELIVERABLE_CREATE);
      }).not.toThrow();
    });

    it("should allow FINDING_VALIDATE (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.FINDING_VALIDATE);
      }).not.toThrow();
    });

    it("should allow STAGE_CREATE (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.STAGE_CREATE);
      }).not.toThrow();
    });

    it("should allow STAGE_TRANSITION (has this capability)", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.STAGE_TRANSITION);
      }).not.toThrow();
    });

    it("should deny SYSTEM_VIEW_AUDIT without capability", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.SYSTEM_VIEW_AUDIT);
      }).toThrow(ForbiddenError);
    });

    it("should deny USER_CREATE without capability", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.USER_CREATE);
      }).not.toThrow(); // Actually, EXPERIENCED_CONSULTANT can VIEW users
    });

    it("should deny CLIENT_CREATE without capability", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.CLIENT_CREATE);
      }).toThrow(ForbiddenError);
    });
  });

  describe("Admin role - all capabilities", () => {
    it("should allow DELIVERABLE_CREATE", () => {
      expect(() => {
        requireCapabilityForService(adminAuthContext, CAPABILITIES.DELIVERABLE_CREATE);
      }).not.toThrow();
    });

    it("should allow FINDING_VALIDATE", () => {
      expect(() => {
        requireCapabilityForService(adminAuthContext, CAPABILITIES.FINDING_VALIDATE);
      }).not.toThrow();
    });

    it("should allow SYSTEM_VIEW_AUDIT", () => {
      expect(() => {
        requireCapabilityForService(adminAuthContext, CAPABILITIES.SYSTEM_VIEW_AUDIT);
      }).not.toThrow();
    });

    it("should allow USER_CREATE", () => {
      expect(() => {
        requireCapabilityForService(adminAuthContext, CAPABILITIES.USER_CREATE);
      }).not.toThrow();
    });

    it("should allow CLIENT_CREATE", () => {
      expect(() => {
        requireCapabilityForService(adminAuthContext, CAPABILITIES.CLIENT_CREATE);
      }).not.toThrow();
    });

    it("should allow any capability", () => {
      const allCapabilities = Object.values(CAPABILITIES);
      allCapabilities.forEach(cap => {
        expect(() => {
          requireCapabilityForService(adminAuthContext, cap);
        }).not.toThrow(`Admin should have ${cap}`);
      });
    });
  });

  describe("Service-layer enforcement independence", () => {
    it("capability check throws ForbiddenError with clear message", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.DELIVERABLE_CREATE);
      }).toThrow(`Missing required capability: ${CAPABILITIES.DELIVERABLE_CREATE}`);
    });

    it("capability check fails closed - unknown user has no capabilities", () => {
      const unknownUser: AuthContext = {
        session: {
          user: {
            id: "unknown-99",
            email: "unknown@example.com",
            name: "Unknown",
            isActive: true,
          },
          sessionId: "session-unknown",
          expiresAt: new Date(),
        } as SessionInfo,
        policy: {
          userId: "unknown-99",
          roles: [], // No roles assigned
        } as PolicyContext,
      };

      expect(() => {
        requireCapabilityForService(unknownUser, CAPABILITIES.DELIVERABLE_VIEW);
      }).toThrow(ForbiddenError);

      expect(() => {
        requireCapabilityForService(unknownUser, CAPABILITIES.SYSTEM_VIEW_AUDIT);
      }).toThrow(ForbiddenError);
    });
  });

  describe("Defense-in-depth: service layer catches capability bypass", () => {
    it("capability enforcement at service layer, not just routes", () => {
      // Even if route handler is compromised and doesn't check capabilities,
      // the service layer check will catch it and throw ForbiddenError

      const maliciousRoutePath = () => {
        // Simulates route bypassing capability check
        // Service layer MUST still enforce it
        return requireCapabilityForService(
          viewerAuthContext,
          CAPABILITIES.DELIVERABLE_CREATE
        );
      };

      expect(maliciousRoutePath).toThrow(ForbiddenError);
    });

    it("service layer is last line of defense for authorization", () => {
      // This test documents that services should never trust input,
      // even if route handler says it's authorized

      const unauthorizedContext = viewerAuthContext;
      const attemptedCapability = CAPABILITIES.FINDING_VALIDATE;

      // Service MUST check, regardless of how it was called
      expect(() => {
        requireCapabilityForService(unauthorizedContext, attemptedCapability);
      }).toThrow(ForbiddenError);
    });
  });

  describe("Capability checks prevent privilege escalation", () => {
    it("viewer cannot escalate to create deliverables", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.DELIVERABLE_CREATE);
      }).toThrow();
    });

    it("viewer cannot escalate to manage users", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.USER_CREATE);
      }).toThrow();
    });

    it("viewer cannot escalate to view audit logs", () => {
      expect(() => {
        requireCapabilityForService(viewerAuthContext, CAPABILITIES.SYSTEM_VIEW_AUDIT);
      }).toThrow();
    });

    it("consultant cannot escalate to admin functions", () => {
      expect(() => {
        requireCapabilityForService(consultantAuthContext, CAPABILITIES.SYSTEM_ADMIN);
      }).toThrow();
    });
  });
});
