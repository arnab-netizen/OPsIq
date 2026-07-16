/**
 * Capability 13 — Startup Session Persistence.
 *
 * Wraps the pure validateStartup engine and persists the result to PostgreSQL.
 * Each call creates an OwnerStartupSession + StartupIdeaRecord[] for each idea.
 * Sessions are workspace-scoped; workspace isolation is enforced at the service layer.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { validateStartup } from "@/domain/owner-strategy/startup-mode";
import type { StartupIntake, StartupIdea, IdeaEvaluation } from "@/domain/owner-strategy/startup-mode.types";
import { NotFoundError } from "@/infra/errors";

export interface CreateStartupSessionInput {
  workspaceId: string;
  actorId: string;
  sessionLabel?: string | null;
  intake: StartupIntake;
  ideas: StartupIdea[];
}

export interface StartupSessionSummary {
  sessionId: string;
  workspaceId: string;
  sessionLabel: string | null;
  status: string;
  recommendedName: string | null;
  ideaCount: number;
  acceptedCount: number;
  createdAt: Date;
}

function ideaToRecord(eval_: IdeaEvaluation, sessionId: string, workspaceId: string) {
  return {
    id: randomUUID(),
    sessionId,
    workspaceId,
    name: eval_.name,
    industry: eval_.industry,
    accepted: eval_.accepted,
    capitalSufficient: eval_.capitalSufficient ?? null,
    capitalGap: eval_.capitalGap ?? null,
    monthlyProfit: eval_.monthlyProfit ?? null,
    riskAdjustedScore: eval_.riskAdjustedScore,
    reasons: eval_.reasons as unknown as object,
    warnings: eval_.warnings as unknown as object,
  };
}

/** Validate ideas against intake and persist the result. Returns the session ID. */
export async function createStartupSession(input: CreateStartupSessionInput): Promise<string> {
  const result = validateStartup(input.intake, input.ideas);
  const sessionId = randomUUID();

  const allIdeas = [...result.shortlist, ...result.rejected];

  await db.ownerStartupSession.create({
    data: {
      id: sessionId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      sessionLabel: input.sessionLabel ?? null,
      intake: input.intake as unknown as object,
      status: "ACTIVE",
      validationResult: result as unknown as object,
      recommendedName: result.recommended?.name ?? null,
      updatedAt: new Date(),
    },
  });

  if (allIdeas.length > 0) {
    await db.startupIdeaRecord.createMany({
      data: allIdeas.map((e) => ideaToRecord(e, sessionId, input.workspaceId)),
    });
  }

  return sessionId;
}

/** Retrieve a specific session with its ideas. Enforces workspace isolation. */
export async function getStartupSession(workspaceId: string, sessionId: string) {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: { ideas: { orderBy: { accepted: "desc" } } },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  return session;
}

/** List sessions for a workspace, newest first. */
export async function listStartupSessions(workspaceId: string): Promise<StartupSessionSummary[]> {
  const sessions = await db.ownerStartupSession.findMany({
    where: { workspaceId },
    include: { ideas: { select: { id: true, accepted: true } } },
    orderBy: { createdAt: "desc" },
  });

  type SessionRow = { id: string; workspaceId: string; sessionLabel: string | null; status: string; recommendedName: string | null; createdAt: Date; ideas: { id: string; accepted: boolean }[] };
  return (sessions as SessionRow[]).map((s) => ({
    sessionId: s.id,
    workspaceId: s.workspaceId,
    sessionLabel: s.sessionLabel,
    status: s.status,
    recommendedName: s.recommendedName,
    ideaCount: s.ideas.length,
    acceptedCount: s.ideas.filter((i) => i.accepted).length,
    createdAt: s.createdAt,
  }));
}
