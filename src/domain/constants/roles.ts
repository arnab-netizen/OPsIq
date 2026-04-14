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
};

/** Roles that are internal/consultant-side — not client-facing */
export const INTERNAL_ROLES: readonly RoleName[] = [
  ROLES.SYSTEM_ADMIN,
  ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
  ROLES.EXPERIENCED_CONSULTANT,
  ROLES.BEGINNER_CONSULTANT,
  ROLES.ANALYST,
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
