import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { intakeProofSubmission } from "@/services/execution/proof-intake.service";

/**
 * POST /api/proof/submit — employee submits proof for a delegated task.
 * Thin wrapper: the proof *contract* (which proof, its required-fields spec, existing
 * workspace hashes for duplicate detection, and the submitting actor) is loaded/derived
 * server-side by `intakeProofSubmission` — the client is authoritative only for the proof
 * artifact (proofType, fields, fileHash). This closes the prior self-certification hole
 * (client-supplied `requirement`/`actor`) and the inert duplicate check.
 */
export const POST = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const body = ctx.request ? await ctx.request.json() : {};

  const taskId = body.command?.taskId ?? body.taskId;
  const submission = body.command?.submission ?? body.submission ?? {};

  return intakeProofSubmission({ workspaceId, actorId, taskId, submission });
});
