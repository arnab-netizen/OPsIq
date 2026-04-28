import type { UserRole } from "@/domain/auth/types";

export function canEdit(role: UserRole): boolean {
  return role === "admin" || role === "operator";
}

export function canView(role: UserRole): boolean {
  return true;
}

export function canApprove(role: UserRole): boolean {
  return role === "admin";
}
