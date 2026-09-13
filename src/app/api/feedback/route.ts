/**
 * POST /api/feedback
 *
 * Beta feedback surface ("Send beta feedback" / "Report a problem") for
 * signed-in Owner Mode users. Any authenticated member of the caller's
 * workspace may submit feedback — this is deliberately NOT gated on a
 * specific capability (e.g. OWNER_VIEW): a self-serve owner's own
 * workspace membership, verified server-side by withCanonicalEnforcement's
 * `requireWorkspace: true`, is the whole gate. There is no legitimate
 * workspace member this should be closed to, and no capability in
 * src/domain/constants/capabilities.ts maps cleanly onto "may report a bug"
 * without either over-restricting (most capabilities are feature-specific)
 * or requiring a new capability, which the task explicitly rules out.
 *
 * The schema below has no field for cookies, passwords, tokens, or
 * Authorization-header values, and parseRequestBody() rejects any unknown
 * field in the request body outright — so none of that can ever reach the
 * PlatformFeedback row by construction, not by best-effort stripping.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, MUTATION_RATE_LIMIT } from "@/infra/rate-limit";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { escapeHtml } from "@/lib/integrations/email-html";
import { randomUUID } from "crypto";
import { z } from "zod/v4";

const FEEDBACK_CATEGORIES = ["BUG", "CONFUSION", "FEATURE_REQUEST", "OTHER"] as const;

const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  description: z.string().trim().min(1, "Description is required").max(5000),
  route: z.string().trim().max(500).optional(),
  expectedResult: z.string().trim().max(2000).optional(),
});

/**
 * Best-effort operator notification so submitted feedback is actually seen
 * (P0 finding: PlatformFeedback had no read path anywhere). Reuses the same
 * getEmailProvider()/BETA_REQUEST_NOTIFICATION_EMAIL recipient already used
 * for the beta-request owner notification — one shared recipient config, not
 * a second one. Persistence above is authoritative; this never affects the
 * response or rolls back the already-committed row.
 *
 * description/route/expectedResult are free-text, user-authored and
 * untrusted: each is escapeHtml()'d before it reaches the HTML body, so a
 * submitter cannot inject markup (e.g. a fake link) into the email an
 * operator opens. category is a fixed zod enum (not free text) and
 * workspaceId a server-derived UUID, so neither needs escaping. The
 * plain-text body keeps the raw, human-readable values.
 */
async function notifyOwnerOfFeedback(row: {
  id: string;
  category: string;
  description: string;
  route: string | null;
  expectedResult: string | null;
  workspaceId: string | null;
}): Promise<void> {
  try {
    const recipient = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    if (!recipient) return;
    const provider = getEmailProvider();
    if (!provider) return;

    const lines = [
      `Category: ${row.category}`,
      row.route ? `Route: ${row.route}` : null,
      `Description: ${row.description}`,
      row.expectedResult ? `Expected result: ${row.expectedResult}` : null,
      row.workspaceId ? `Workspace: ${row.workspaceId}` : null,
    ].filter((line): line is string => line !== null);

    const htmlLines = [
      `Category: ${escapeHtml(row.category)}`,
      row.route ? `Route: ${escapeHtml(row.route)}` : null,
      `Description: ${escapeHtml(row.description)}`,
      row.expectedResult ? `Expected result: ${escapeHtml(row.expectedResult)}` : null,
      row.workspaceId ? `Workspace: ${escapeHtml(row.workspaceId)}` : null,
    ].filter((line): line is string => line !== null);

    await provider.send({
      to: recipient,
      subject: `New OpsIQ beta feedback: ${row.category}`,
      html: `<p>New in-product feedback was submitted.</p><ul>${htmlLines.map((l) => `<li>${l}</li>`).join("")}</ul>`,
      text: lines.join("\n"),
    });
  } catch (notifyError) {
    console.error(
      "[FEEDBACK] Owner notification dispatch failed",
      notifyError instanceof Error ? notifyError.constructor.name : "UnknownError"
    );
  }
}

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Rate-limit per authenticated actor, before touching the body — a flood of
    // feedback submissions from one signed-in user is bounded the same way any
    // other mutation is (MUTATION_RATE_LIMIT: 30/min), rather than needing a
    // bespoke, tighter limit for what is a low-volume, human-typed action.
    await requirePgRateLimit(`feedback:${ctx.verifiedActorId}`, MUTATION_RATE_LIMIT);

    const body = await parseRequestBody(ctx.request!, feedbackSchema);

    const id = randomUUID();

    await db.platformFeedback.create({
      data: {
        id,
        workspaceId: ctx.verifiedWorkspaceId,
        userId: ctx.verifiedActorId,
        category: body.category,
        description: body.description,
        route: body.route ?? null,
        // Vercel injects this at build time; undefined locally/self-hosted, never an error.
        buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        expectedResult: body.expectedResult ?? null,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PLATFORM_FEEDBACK_SUBMITTED,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      entityType: "platform_feedback",
      entityId: id,
      payload: { category: body.category },
    });

    // Best-effort, non-blocking — persistence above is already durable.
    await notifyOwnerOfFeedback({
      id,
      category: body.category,
      description: body.description,
      route: body.route ?? null,
      expectedResult: body.expectedResult ?? null,
      workspaceId: ctx.verifiedWorkspaceId,
    });

    return { success: true };
  },
  { requireWorkspace: true }
);
