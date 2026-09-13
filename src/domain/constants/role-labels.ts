import type { RoleName } from "@/domain/constants/roles";

export const ROLE_LABELS: Record<RoleName, string> = {
  system_admin: "System Admin",
  admin_or_portfolio_manager: "Admin / Portfolio Mgr",
  experienced_consultant: "Experienced Consultant",
  beginner_consultant: "Beginner Consultant",
  analyst: "Analyst",
  client_owner: "Client Owner",
  client_team_member: "Client Team Member",
  viewer: "Viewer",
  beta_request_operator: "Beta Request Operator",
};

export function formatRole(role: string): string {
  return ROLE_LABELS[role as RoleName] ?? role;
}
