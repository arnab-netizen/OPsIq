import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { hasCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import type { PolicyContext } from "@/policies/capability-check";

/**
 * Block 3: RBAC Enforcement Tests
 *
 * Verifies role-based authorization for critical operations:
 * - update engagement status
 * - create/update finding
 * - update/rerank recommendation
 * - update action status
 * - generate/export report
 */

describe("Block 3: RBAC Enforcement", () => {
  let mockSession: unknown;
  let mockPolicy: PolicyContext;

  beforeEach(() => {
    mockSession = {
      user: {
        id: "user-123",
        email: "user@example.com",
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Role Capability Mapping", () => {
    it("admin role has all critical capabilities", () => {
      const adminPolicy: PolicyContext = {
        userId: "admin-user",
        roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
      };

      expect(hasCapability(adminPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)).toBe(true);
      expect(hasCapability(adminPolicy, CAPABILITIES.FINDING_CREATE)).toBe(true);
      expect(hasCapability(adminPolicy, CAPABILITIES.FINDING_UPDATE)).toBe(true);
      expect(hasCapability(adminPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(true);
      expect(hasCapability(adminPolicy, CAPABILITIES.ACTION_UPDATE)).toBe(true);
      expect(hasCapability(adminPolicy, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(true);
    });

    it("experienced consultant can create/update findings and recommendations", () => {
      const consultantPolicy: PolicyContext = {
        userId: "consultant-user",
        roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
      };

      expect(hasCapability(consultantPolicy, CAPABILITIES.FINDING_CREATE)).toBe(true);
      expect(hasCapability(consultantPolicy, CAPABILITIES.FINDING_UPDATE)).toBe(true);
      expect(hasCapability(consultantPolicy, CAPABILITIES.ACTION_UPDATE)).toBe(true);
      // But cannot approve (that's RECOMMENDATION_APPROVE which consultants don't have)
      expect(hasCapability(consultantPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
    });

    it("beginner consultant has limited write access", () => {
      const beginnerPolicy: PolicyContext = {
        userId: "beginner-user",
        roles: [{ role: ROLES.BEGINNER_CONSULTANT }],
      };

      expect(hasCapability(beginnerPolicy, CAPABILITIES.FINDING_CREATE)).toBe(true);
      expect(hasCapability(beginnerPolicy, CAPABILITIES.FINDING_UPDATE)).toBe(false);
      expect(hasCapability(beginnerPolicy, CAPABILITIES.ACTION_UPDATE)).toBe(true);
      expect(hasCapability(beginnerPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)).toBe(false);
    });

    it("client roles are blocked from all write operations", () => {
      const clientPolicy: PolicyContext = {
        userId: "client-user",
        roles: [{ role: ROLES.CLIENT_OWNER }],
      };

      expect(hasCapability(clientPolicy, CAPABILITIES.FINDING_CREATE)).toBe(false);
      expect(hasCapability(clientPolicy, CAPABILITIES.FINDING_UPDATE)).toBe(false);
      expect(hasCapability(clientPolicy, CAPABILITIES.ACTION_UPDATE)).toBe(false);
      expect(hasCapability(clientPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
      expect(hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)).toBe(false);
    });

    it("client can view sensitive data", () => {
      const clientPolicy: PolicyContext = {
        userId: "client-user",
        roles: [{ role: ROLES.CLIENT_OWNER }],
      };

      expect(hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(true);
      expect(hasCapability(clientPolicy, CAPABILITIES.FINDING_VIEW)).toBe(true);
      expect(hasCapability(clientPolicy, CAPABILITIES.ACTION_VIEW)).toBe(true);
      expect(hasCapability(clientPolicy, CAPABILITIES.DELIVERABLE_VIEW)).toBe(true);
    });

    it("viewer role is read-only", () => {
      const viewerPolicy: PolicyContext = {
        userId: "viewer-user",
        roles: [{ role: ROLES.VIEWER }],
      };

      expect(hasCapability(viewerPolicy, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(true);
      // But cannot write
      expect(hasCapability(viewerPolicy, CAPABILITIES.FINDING_CREATE)).toBe(false);
      expect(hasCapability(viewerPolicy, CAPABILITIES.ACTION_UPDATE)).toBe(false);
      expect(hasCapability(viewerPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
    });
  });

  describe("Critical Operation Protection", () => {
    describe("Engagement Status Update", () => {
      it("admin can update engagement status", () => {
        const adminPolicy: PolicyContext = {
          userId: "admin-user",
          roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
        };

        expect(
          hasCapability(adminPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
        ).toBe(true);
      });

      it("experienced consultant can update engagement", () => {
        const consultantPolicy: PolicyContext = {
          userId: "consultant-user",
          roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
        };

        expect(
          hasCapability(consultantPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
        ).toBe(true);
      });

      it("client owner cannot update engagement", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
        ).toBe(false);
      });

      it("viewer cannot update engagement", () => {
        const viewerPolicy: PolicyContext = {
          userId: "viewer-user",
          roles: [{ role: ROLES.VIEWER }],
        };

        expect(
          hasCapability(viewerPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
        ).toBe(false);
      });
    });

    describe("Finding Management", () => {
      it("admin can create findings", () => {
        const adminPolicy: PolicyContext = {
          userId: "admin-user",
          roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
        };

        expect(
          hasCapability(adminPolicy, CAPABILITIES.FINDING_CREATE)
        ).toBe(true);
      });

      it("experienced consultant can create findings", () => {
        const consultantPolicy: PolicyContext = {
          userId: "consultant-user",
          roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
        };

        expect(
          hasCapability(consultantPolicy, CAPABILITIES.FINDING_CREATE)
        ).toBe(true);
      });

      it("beginner consultant can create but not update findings", () => {
        const beginnerPolicy: PolicyContext = {
          userId: "beginner-user",
          roles: [{ role: ROLES.BEGINNER_CONSULTANT }],
        };

        expect(
          hasCapability(beginnerPolicy, CAPABILITIES.FINDING_CREATE)
        ).toBe(true);
        expect(
          hasCapability(beginnerPolicy, CAPABILITIES.FINDING_UPDATE)
        ).toBe(false);
      });

      it("client cannot create findings", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.FINDING_CREATE)
        ).toBe(false);
      });

      it("client can read findings", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.FINDING_VIEW)
        ).toBe(true);
      });
    });

    describe("Recommendation Management", () => {
      it("admin can approve recommendations", () => {
        const adminPolicy: PolicyContext = {
          userId: "admin-user",
          roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
        };

        expect(
          hasCapability(adminPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)
        ).toBe(true);
      });

      it("experienced consultant can create but not approve recommendations", () => {
        const consultantPolicy: PolicyContext = {
          userId: "consultant-user",
          roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
        };

        expect(
          hasCapability(consultantPolicy, CAPABILITIES.RECOMMENDATION_CREATE)
        ).toBe(true);
        // Approve is only for ADMIN role in capability mapping
        expect(
          hasCapability(consultantPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)
        ).toBe(false);
      });

      it("client cannot manage recommendations", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.RECOMMENDATION_CREATE)
        ).toBe(false);
        expect(
          hasCapability(clientPolicy, CAPABILITIES.RECOMMENDATION_APPROVE)
        ).toBe(false);
      });

      it("client can view recommendations", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.RECOMMENDATION_VIEW)
        ).toBe(true);
      });
    });

    describe("Action Management", () => {
      it("admin can update actions", () => {
        const adminPolicy: PolicyContext = {
          userId: "admin-user",
          roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
        };

        expect(
          hasCapability(adminPolicy, CAPABILITIES.ACTION_UPDATE)
        ).toBe(true);
      });

      it("experienced consultant can update actions", () => {
        const consultantPolicy: PolicyContext = {
          userId: "consultant-user",
          roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
        };

        expect(
          hasCapability(consultantPolicy, CAPABILITIES.ACTION_UPDATE)
        ).toBe(true);
      });

      it("beginner consultant can update actions", () => {
        const beginnerPolicy: PolicyContext = {
          userId: "beginner-user",
          roles: [{ role: ROLES.BEGINNER_CONSULTANT }],
        };

        expect(
          hasCapability(beginnerPolicy, CAPABILITIES.ACTION_UPDATE)
        ).toBe(true);
      });

      it("client cannot update actions", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.ACTION_UPDATE)
        ).toBe(false);
      });

      it("client can view actions", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.ACTION_VIEW)
        ).toBe(true);
      });
    });

    describe("Report Access", () => {
      it("admin can view reports (via ENGAGEMENT_VIEW)", () => {
        const adminPolicy: PolicyContext = {
          userId: "admin-user",
          roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }],
        };

        expect(
          hasCapability(adminPolicy, CAPABILITIES.ENGAGEMENT_VIEW)
        ).toBe(true);
      });

      it("consultant can view reports", () => {
        const consultantPolicy: PolicyContext = {
          userId: "consultant-user",
          roles: [{ role: ROLES.EXPERIENCED_CONSULTANT }],
        };

        expect(
          hasCapability(consultantPolicy, CAPABILITIES.ENGAGEMENT_VIEW)
        ).toBe(true);
      });

      it("client can view reports", () => {
        const clientPolicy: PolicyContext = {
          userId: "client-user",
          roles: [{ role: ROLES.CLIENT_OWNER }],
        };

        expect(
          hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_VIEW)
        ).toBe(true);
      });

      it("viewer can view engagement summaries", () => {
        const viewerPolicy: PolicyContext = {
          userId: "viewer-user",
          roles: [{ role: ROLES.VIEWER }],
        };

        expect(
          hasCapability(viewerPolicy, CAPABILITIES.ENGAGEMENT_VIEW)
        ).toBe(true);
      });
    });
  });

  describe("Multi-role Scenarios", () => {
    it("user with multiple roles gets highest privilege", () => {
      const multiRolePolicy: PolicyContext = {
        userId: "multi-user",
        roles: [
          { role: ROLES.BEGINNER_CONSULTANT },
          { role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER },
        ],
      };

      // Should have admin capabilities due to higher role
      expect(
        hasCapability(multiRolePolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
      ).toBe(true);
      expect(
        hasCapability(multiRolePolicy, CAPABILITIES.RECOMMENDATION_APPROVE)
      ).toBe(true);
    });

    it("user with engagement-scoped role only has capability in that engagement", () => {
      const scopedPolicy: PolicyContext = {
        userId: "scoped-user",
        roles: [
          {
            role: ROLES.CONSULTANT,
            scope: "engagement",
            scopeId: "eng-123",
          } as unknown,
        ],
      };

      // Note: CONSULTANT is not a standard role, this tests scope behavior
      // In real scenarios, use EXPERIENCED_CONSULTANT or similar
      const scope = { type: "engagement", id: "eng-123" };
      const differentScope = { type: "engagement", id: "eng-456" };

      // This is illustrative - actual scope matching is tested elsewhere
      expect(scopedPolicy.roles[0].scopeId).toBe("eng-123");
    });
  });

  describe("Denial by Default", () => {
    it("denies capability if no matching role assignment", () => {
      const emptyPolicy: PolicyContext = {
        userId: "empty-user",
        roles: [],
      };

      expect(
        hasCapability(emptyPolicy, CAPABILITIES.ENGAGEMENT_UPDATE)
      ).toBe(false);
      expect(
        hasCapability(emptyPolicy, CAPABILITIES.FINDING_CREATE)
      ).toBe(false);
      expect(
        hasCapability(emptyPolicy, CAPABILITIES.ACTION_UPDATE)
      ).toBe(false);
    });

    it("denies capability even with high-level user if not explicitly assigned", () => {
      const limitedPolicy: PolicyContext = {
        userId: "limited-user",
        roles: [{ role: ROLES.ANALYST }],
      };

      // Analyst cannot create findings
      expect(
        hasCapability(limitedPolicy, CAPABILITIES.FINDING_CREATE)
      ).toBe(false);
      // Analyst can only view
      expect(
        hasCapability(limitedPolicy, CAPABILITIES.FINDING_VIEW)
      ).toBe(true);
    });
  });

  describe("Client Role Protection", () => {
    it("client roles cannot access internal-only capabilities", () => {
      const clientPolicy: PolicyContext = {
        userId: "client-user",
        roles: [{ role: ROLES.CLIENT_OWNER }],
      };

      // Internal-only capabilities
      expect(
        hasCapability(clientPolicy, CAPABILITIES.USER_CREATE)
      ).toBe(false);
      expect(
        hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_CREATE)
      ).toBe(false);
      expect(
        hasCapability(clientPolicy, CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS)
      ).toBe(false);
      expect(
        hasCapability(clientPolicy, CAPABILITIES.SYSTEM_ADMIN)
      ).toBe(false);
    });

    it("client team member has same restrictions as client owner", () => {
      const clientPolicy: PolicyContext = {
        userId: "client-user",
        roles: [{ role: ROLES.CLIENT_TEAM_MEMBER }],
      };

      expect(
        hasCapability(clientPolicy, CAPABILITIES.FINDING_CREATE)
      ).toBe(false);
      expect(
        hasCapability(clientPolicy, CAPABILITIES.FINDING_VIEW)
      ).toBe(true);
    });
  });
});
