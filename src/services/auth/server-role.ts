import type { UserRole } from "@/domain/auth/types";
export { getSession } from "@/services/auth";

export async function resolveServerRole(): Promise<UserRole | null> {
  const { getSession } = await import("@/services/auth");
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  return "admin";
}
