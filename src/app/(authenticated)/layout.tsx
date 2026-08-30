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

  // Determine owner-recovery nav visibility, and the full resolved capability set for the rest
  // of the nav's per-item `requiresCapability` gates (see sidebar-nav.tsx), from the user's
  // effective capabilities. Only owner/internal users (OWNER_VIEW) see the Owner Recovery entry;
  // consultant-facing items (Clients, Engagements, Leads, People, the consulting dashboard) are
  // gated on the same per-item capability their own API route already requires.
  let canViewOwnerRecovery = false;
  let capabilities: string[] = [];
  try {
    const policy = await getPolicyContext();
    if (policy) {
      const caps = new Set<string>();
      for (const r of policy.roles) {
        for (const c of getCapabilitiesForRole(r.role, policy.workspaceRole)) caps.add(c);
      }
      canViewOwnerRecovery = caps.has(CAPABILITIES.OWNER_VIEW);
      capabilities = Array.from(caps);
    }
  } catch {
    canViewOwnerRecovery = false;
    capabilities = [];
  }

  return (
    <AppShell
      userName={session.user.name}
      canViewOwnerRecovery={canViewOwnerRecovery}
      capabilities={capabilities}
    >
      {children}
    </AppShell>
  );
}
