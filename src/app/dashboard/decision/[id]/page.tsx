import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { getSession } from "@/services/auth";
import DecisionDetailView from "./DecisionDetailView";

async function getDecision(decisionId: string) {
  const workspace = await requireWorkspaceContext();
  const session = await getSession();

  if (!session?.user.id) {
    redirect("/login");
  }

  const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
    include: {
      auditLog: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!decision) {
    notFound();
  }

  if (decision.workspaceId !== workspace.workspaceId) {
    notFound();
  }

  return decision;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = await getDecision(id);
  return {
    title: `Decision: ${decision.problem} | OPsIQ`,
    description: decision.action,
  };
}

export default async function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = await getDecision(id);

  return <DecisionDetailView decision={decision} />;
}
