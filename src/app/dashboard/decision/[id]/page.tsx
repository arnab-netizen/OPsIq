import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import DecisionDetailView from "./DecisionDetailView";

export const dynamic = "force-dynamic";

async function getDecision(decisionId: string, workspaceId: string) {
  const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
    include: {
      auditLog: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (!decision) {
    notFound();
  }

  if (decision.workspaceId !== workspaceId) {
    notFound();
  }

  return decision;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const workspaceId = sp?.workspaceId || "";

  try {
    const decision = await getDecision(id, workspaceId);
    return {
      title: `Decision: ${decision.problem} | OpsIQ`,
      description: decision.action,
    };
  } catch {
    return {
      title: "Decision | OpsIQ",
    };
  }
}

export default async function DecisionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  const sp = await searchParams;
  const workspaceId = sp?.workspaceId || "";

  if (!workspaceId) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">Workspace ID required</p>
      </div>
    );
  }

  // Verify user has access to workspace
  const membership = await enforceWorkspaceScoping(
    { nextUrl: { searchParams: new URLSearchParams({ workspaceId }) } } as any,
    workspaceId
  );

  if (!membership) {
    redirect("/login");
  }

  const decision = await getDecision(id, workspaceId);

  return <DecisionDetailView decision={decision} workspaceId={workspaceId} />;
}
