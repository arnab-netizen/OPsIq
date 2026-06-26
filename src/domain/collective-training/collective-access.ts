/**
 * C19 — Owner-Mode collective access guard (pure domain service).
 *
 * Exposes the collective decision packet ONLY inside Owner Mode, scoped to a single
 * workspace. It reuses the existing infra auth/authorization errors (UnauthorizedError /
 * ForbiddenError) and enforces: a session is required (no public/unauthenticated
 * access), and the caller's workspace must match the requested workspace (workspace
 * isolation). It adds NO public route and NO SaaS surface — an existing authenticated
 * Owner-Mode route/handler calls this; it does not create one.
 */

import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import type { CollectiveDecisionPacket } from "@/domain/collective-training/collective-types";

export interface OwnerSession {
  /** Authenticated user id (absent/empty → unauthenticated). */
  userId: string;
  /** The workspace the session is bound to. */
  workspaceId: string;
  /** Owner Mode must be the active surface. */
  ownerMode: boolean;
}

export interface CollectiveRequest {
  workspaceId: string;
  input: CollectiveInput;
}

/**
 * Returns the collective packet for the requested workspace, or throws:
 *  - UnauthorizedError when there is no authenticated session.
 *  - ForbiddenError when Owner Mode is inactive or the workspace does not match.
 */
export function getCollectivePacketForWorkspace(session: OwnerSession | null | undefined, req: CollectiveRequest): CollectiveDecisionPacket {
  if (!session || typeof session.userId !== "string" || session.userId.trim().length === 0) {
    throw new UnauthorizedError("AUTH_INVALID", "Collective packet requires an authenticated Owner-Mode session.");
  }
  if (session.ownerMode !== true) {
    throw new ForbiddenError("WORKSPACE_DENIED", "Collective packet is Owner-Mode only.");
  }
  if (typeof req.workspaceId !== "string" || req.workspaceId.trim().length === 0 || req.workspaceId !== session.workspaceId) {
    throw new ForbiddenError("WORKSPACE_DENIED", "Collective packet is scoped to the session workspace.");
  }
  return runCollective(req.input);
}
