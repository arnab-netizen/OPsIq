export const ROLES = {
  // System
  SYSTEM_ADMIN: "system_admin",

  // Consultant tiers (Module 1 required roles)
  ADMIN_OR_PORTFOLIO_MANAGER: "admin_or_portfolio_manager",
  EXPERIENCED_CONSULTANT: "experienced_consultant",
  BEGINNER_CONSULTANT: "beginner_consultant",

  // Analyst
  ANALYST: "analyst",

  // Client roles (Module 1 required roles)
  CLIENT_OWNER: "client_owner",
  CLIENT_TEAM_MEMBER: "client_team_member",

  // Read-only
  VIEWER: "viewer",

  // OpsIQ platform-operator surface, narrower than SYSTEM_ADMIN. Carries
  // ONLY BETA_REQUEST_REVIEW/BETA_REQUEST_INVITE (see capability-check.ts) —
  // deliberately excluded from every consulting-firm and self-serve-owner
  // capability bundle. This is the distinction between a customer/business
  // owner (self-serve "owner" WorkspaceMembership, OWNER_SCOPED_CAPABILITIES)
  // and an OpsIQ platform operator, even when the same real account performs
  // both roles today.
  BETA_REQUEST_OPERATOR: "beta_request_operator",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  [ROLES.SYSTEM_ADMIN]: 100,
  [ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: 80,
  [ROLES.EXPERIENCED_CONSULTANT]: 60,
  [ROLES.BEGINNER_CONSULTANT]: 40,
  [ROLES.ANALYST]: 30,
  [ROLES.CLIENT_OWNER]: 20,
  [ROLES.CLIENT_TEAM_MEMBER]: 10,
  [ROLES.VIEWER]: 0,
  // Deliberately low and non-overlapping with any client-role level: this
  // role grants two narrow write capabilities (not read-only, so it can't
  // share VIEWER's level of 0), but must sit below every consulting-firm
  // role so assertHierarchyAuthority (services/role-assignment.ts) never
  // lets it be mistaken for a broader internal tier.
  [ROLES.BETA_REQUEST_OPERATOR]: 5,
};

/** Roles that are internal/consultant-side — not client-facing */
export const INTERNAL_ROLES: readonly RoleName[] = [
  ROLES.SYSTEM_ADMIN,
  ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
  ROLES.EXPERIENCED_CONSULTANT,
  ROLES.BEGINNER_CONSULTANT,
  ROLES.ANALYST,
  ROLES.BETA_REQUEST_OPERATOR,
];

/** Roles that are client-side */
export const CLIENT_ROLES: readonly RoleName[] = [
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_TEAM_MEMBER,
];

/** Check if a role is a client role */
export function isClientRole(role: RoleName): boolean {
  return CLIENT_ROLES.includes(role);
}
