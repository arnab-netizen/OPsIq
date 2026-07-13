import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Decision Inbox | Rebilix",
  description: "View and manage pending decisions",
};

export default async function DashboardInboxPage() {
  // Enforce authentication
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: Authentication required");
  }

  // Resolve workspace from DB membership (fail closed)
  const membership = await db.workspaceMembership.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { workspaceId: true },
    orderBy: { addedAt: "desc" },
  });

  if (!membership?.workspaceId) {
    throw new Error("Unauthorized: Workspace context required");
  }

  return <InboxClient workspaceId={membership.workspaceId} />;
}
