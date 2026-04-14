export const ROLES = {
  SYSTEM_ADMIN: "system_admin",
  PRINCIPAL_CONSULTANT: "principal_consultant",
  SENIOR_CONSULTANT: "senior_consultant",
  CONSULTANT: "consultant",
  ANALYST: "analyst",
  CLIENT_OWNER: "client_owner",
  CLIENT_STAKEHOLDER: "client_stakeholder",
  VIEWER: "viewer",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  [ROLES.SYSTEM_ADMIN]: 100,
  [ROLES.PRINCIPAL_CONSULTANT]: 80,
  [ROLES.SENIOR_CONSULTANT]: 60,
  [ROLES.CONSULTANT]: 40,
  [ROLES.ANALYST]: 30,
  [ROLES.CLIENT_OWNER]: 20,
  [ROLES.CLIENT_STAKEHOLDER]: 10,
  [ROLES.VIEWER]: 0,
};
