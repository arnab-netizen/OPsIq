import { getSession, getPolicyContext } from "@/services/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/ui/shell";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Determine owner-recovery nav visibility from the user's effective capabilities.
  // Only owner/internal users (OWNER_VIEW) see the Owner Recovery entry.
  let canViewOwnerRecovery = false;
  try {
    const policy = await getPolicyContext();
    if (policy) {
      const caps = new Set<string>();
      for (const r of policy.roles) {
        for (const c of getCapabilitiesForRole(r.role)) caps.add(c);
      }
      canViewOwnerRecovery = caps.has(CAPABILITIES.OWNER_VIEW);
    }
  } catch {
    canViewOwnerRecovery = false;
  }

  return (
    <AppShell userName={session.user.name} canViewOwnerRecovery={canViewOwnerRecovery}>
      {children}
    </AppShell>
  );
}
