import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Decision Inbox | OpsIQ",
  description: "View and manage pending decisions",
};

/**
 * Controlled owner-facing state for an authenticated user whose account is not attached to an active
 * workspace membership. Fail-closed: no decision data is loaded or rendered — the user is told what is
 * missing and where to go, instead of receiving an unhandled 500.
 */
function NoWorkspaceState() {
  return (
    <div className="mx-auto max-w-2xl py-16 px-4" data-testid="inbox-no-workspace">
      <h1 className="text-2xl font-bold text-foreground">No workspace yet</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your account is signed in, but it is not attached to an active workspace. The decision inbox
        needs a workspace before it can show anything.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask whoever set up your OpsIQ account to add you to a workspace, then reload this page.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

export default async function DashboardInboxPage() {
  // Authentication first — no database query runs until the session is established.
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Resolve workspace from DB membership (fail closed).
  const membership = await db.workspaceMembership.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { workspaceId: true },
    orderBy: { addedAt: "desc" },
  });

  if (!membership?.workspaceId) {
    return <NoWorkspaceState />;
  }

  return <InboxClient workspaceId={membership.workspaceId} />;
}
