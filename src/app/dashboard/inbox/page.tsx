import { getSession } from "@/services/auth";
import { requireWorkspaceContext } from "@/services/workspace/context";
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

  // Enforce workspace context
  const workspace = await requireWorkspaceContext();
  if (!workspace?.workspaceId) {
    throw new Error("Unauthorized: Workspace context required");
  }

  return <InboxClient workspaceId={workspace.workspaceId} />;
}
