/**
 * Beta invitation EMAIL side effect.
 *
 * The invite STATE (REQUESTED / INVITED / REVOKED / REJECTED, with its 14-day entitlement) and the invitation EMAIL are
 * different things. `INVITED` never means "the provider delivered an email": a provider failure leaves the request
 * INVITED, and `resendBetaInvitationEmail` lets an operator send the email again WITHOUT touching the state, the
 * entitlement window, `invitedAt` or `invitedBy`.
 *
 * Every attempt ends in exactly one explicit outcome — SENT (the provider accepted the submission; this is NOT a
 * delivery confirmation), FAILED, NO_PROVIDER or NOT_ATTEMPTED — each with a human-readable, safe reason. Every provider
 * attempt writes one sanitized structured server log line and internal audit events; nothing here ever logs or returns
 * the API key, a token, the recipient address or the provider's response payload.
 *
 * Resend abuse bounds (no schema change): the per-request row is locked FOR UPDATE, the status/expiry/cooldown/hourly-cap
 * checks and the BETA_INVITE_EMAIL_ATTEMPTED claim event commit in one short transaction, and only then is the provider
 * called. A concurrent or repeated POST therefore waits on the lock, sees the committed claim and is refused instead of
 * sending a second email.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { escapeHtml } from "@/lib/integrations/email-html";
import { isInviteExpired } from "@/lib/beta";
import type { BetaApprovalEmailOutcome } from "@/domain/admin/beta-approval-email-notice";

export type BetaInviteEmailAction = "INVITE" | "RESEND";

export interface BetaInviteEmailAttempt {
  outcome: BetaApprovalEmailOutcome;
  /** Safe, human-readable explanation for the operator. Never contains provider text, an address or a token. */
  reason: string | null;
}

/** Minimum gap between two email attempts for the same request. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Maximum operator RESEND attempts for the same request inside the trailing hour (the initial send of an invite is not counted). */
export const RESEND_MAX_PER_HOUR = 5;

const ENTITY_TYPE = "beta_request";

/** Provider error text for the server log: recipient removed (case-insensitively), control characters collapsed, capped. */
function sanitizeProviderErrorForLog(error: unknown, recipient: string): string {
  if (!(error instanceof Error)) return "non-Error thrown";
  const escaped = recipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const providerText = String(error.message);
  return providerText
    .replace(new RegExp(escaped, "gi"), "[recipient]")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .slice(0, 300);
}

/**
 * Result / bookkeeping audit rows for the email SIDE EFFECT. They are written after the provider was (or was not)
 * called, so a failure to write one must never change the reported outcome (a real send must not be reported FAILED,
 * which would invite a duplicate) and must never undo the already-committed invite state. The failure is logged.
 */
async function auditEmailSideEffect(event: Parameters<typeof emitAuditEvent>[0]): Promise<void> {
  try {
    await emitAuditEvent(event);
  } catch (auditError) {
    console.error(
      JSON.stringify({
        event: "BETA_INVITE_EMAIL_AUDIT_WRITE_FAILED",
        auditEventName: event.eventName,
        betaRequestId: event.entityId ?? null,
        errorClass: auditError instanceof Error ? auditError.constructor.name : "UnknownError",
      })
    );
  }
}

function failureReason(status: number | undefined): string {
  if (status === undefined) return "the email provider could not be reached";
  if (status === 401 || status === 403) return `the email provider rejected the request (HTTP ${status}); check the provider account, API key and sender domain`;
  if (status === 422 || status === 400) return `the email provider rejected the message (HTTP ${status})`;
  if (status === 429) return "the email provider is rate limiting requests (HTTP 429)";
  if (status >= 500) return `the email provider reported an error (HTTP ${status})`;
  return `the email provider returned HTTP ${status}`;
}

function logProviderResult(fields: {
  betaRequestId: string;
  action: BetaInviteEmailAction;
  outcome: "SENT" | "FAILED" | "NO_PROVIDER";
  providerHttpStatus?: number;
  providerMessageIdPresent: boolean;
  providerErrorClass?: string;
  detail?: string;
}): void {
  const line = JSON.stringify({
    event: "BETA_INVITE_EMAIL_PROVIDER_RESULT",
    betaRequestId: fields.betaRequestId,
    action: fields.action,
    outcome: fields.outcome,
    provider: "resend",
    providerHttpStatus: fields.providerHttpStatus ?? null,
    providerMessageIdPresent: fields.providerMessageIdPresent,
    providerErrorClass: fields.providerErrorClass ?? null,
    detail: fields.detail ?? null,
  });
  if (fields.outcome === "SENT") console.info(line);
  else console.error(line);
}

/**
 * Sends the invitation email for a request and records the outcome. The caller has already decided that an email SHOULD
 * be sent (a state transition just happened, or a resend claim was committed). Audit rows record the attempt before the
 * provider is called and the result after; the provider's acceptance is recorded as "accepted by provider", never as
 * delivered.
 */
export async function dispatchBetaInviteEmail(input: {
  betaRequestId: string;
  email: string;
  action: BetaInviteEmailAction;
  actorId: string;
}): Promise<BetaInviteEmailAttempt> {
  const { betaRequestId, email, action, actorId } = input;
  const baseAudit = { actorId, entityType: ENTITY_TYPE, entityId: betaRequestId, visibility: "internal" as const };

  const provider = getEmailProvider();
  if (!provider) {
    logProviderResult({ betaRequestId, action, outcome: "NO_PROVIDER", providerMessageIdPresent: false });
    await auditEmailSideEffect({ ...baseAudit, eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_NO_PROVIDER, payload: { action } });
    return { outcome: "NO_PROVIDER", reason: "no email provider is configured" };
  }

  let signupUrl: string;
  try {
    signupUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/signup`;
  } catch {
    logProviderResult({ betaRequestId, action, outcome: "FAILED", providerMessageIdPresent: false, providerErrorClass: "ConfigurationError" });
    await auditEmailSideEffect({
      ...baseAudit,
      eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_FAILED,
      payload: { action, provider: "resend", providerErrorClass: "ConfigurationError" },
    });
    return { outcome: "FAILED", reason: "the application URL for the signup link is not configured" };
  }

  let accepted: { id?: string; httpStatus?: number };
  try {
    const result = await provider.send({
      to: email,
      subject: "Your OpsIQ beta access is ready",
      html: `<p>Your OpsIQ beta access is ready.</p><p><a href="${signupUrl}">Sign up now</a> using this same email address (${escapeHtml(email)}) to activate your account.</p>`,
      text: `Your OpsIQ beta access is ready. Sign up now using this same email address (${email}): ${signupUrl}`,
    });
    accepted = { id: result.id, httpStatus: result.httpStatus };
  } catch (error) {
    // EmailProviderError carries the provider's HTTP status; any other thrown value (network failure, etc.) has none.
    const rawStatus = (error as { status?: unknown } | null)?.status;
    const status = typeof rawStatus === "number" ? rawStatus : undefined;
    const errorClass = error instanceof Error ? error.constructor.name : "UnknownError";
    const detail = sanitizeProviderErrorForLog(error, email);
    logProviderResult({
      betaRequestId,
      action,
      outcome: "FAILED",
      providerHttpStatus: status,
      providerMessageIdPresent: false,
      providerErrorClass: errorClass,
      detail,
    });
    await auditEmailSideEffect({
      ...baseAudit,
      eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_FAILED,
      payload: { action, provider: "resend", providerHttpStatus: status ?? null, providerErrorClass: errorClass, detail },
    });
    return { outcome: "FAILED", reason: failureReason(status) };
  }

  // The provider accepted the submission (2xx). Nothing below can change that outcome.
  const messageId = accepted.id;
  logProviderResult({
    betaRequestId,
    action,
    outcome: "SENT",
    providerHttpStatus: accepted.httpStatus,
    providerMessageIdPresent: typeof messageId === "string" && messageId.length > 0,
  });
  // Acceptance by the provider only. The provider message id is internal audit metadata, never shown in the browser.
  await auditEmailSideEffect({
    ...baseAudit,
    eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_ACCEPTED_BY_PROVIDER,
    payload: { action, provider: "resend", providerHttpStatus: accepted.httpStatus ?? null, providerMessageId: messageId ?? null },
  });
  if (action === "RESEND") {
    await auditEmailSideEffect({ ...baseAudit, eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_RESENT, payload: { providerMessageIdPresent: !!messageId } });
  }
  return { outcome: "SENT", reason: null };
}

/** Records that an email attempt is about to be made (used by the state-transition path, where the state has just committed). */
export async function recordBetaInviteEmailAttempt(input: {
  betaRequestId: string;
  action: BetaInviteEmailAction;
  actorId: string;
}): Promise<void> {
  await auditEmailSideEffect({
    eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_ATTEMPTED,
    actorId: input.actorId,
    entityType: ENTITY_TYPE,
    entityId: input.betaRequestId,
    payload: { action: input.action },
    visibility: "internal",
  });
}

export interface ResendBetaInvitationResult extends BetaInviteEmailAttempt {
  id: string;
  status: string;
  invitedAt: string | null;
  invitedBy: string | null;
}

interface LockedBetaRequestRow {
  id: string;
  email: string;
  status: string;
  invited_at: Date | null;
  invited_by: string | null;
}

/**
 * Operator action "Resend invitation email": sends the email again for a currently valid INVITED request. It never
 * changes status, invitedAt, invitedBy or the entitlement window, and never creates a request. An expired invitation
 * must be re-issued through the governed re-invite transition instead.
 */
export async function resendBetaInvitationEmail(input: {
  betaRequestId: string;
  actorId: string;
}): Promise<ResendBetaInvitationResult> {
  const { betaRequestId, actorId } = input;

  const claim = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<LockedBetaRequestRow[]>`
      SELECT id::text AS id, email, status, invited_at, invited_by
      FROM beta_requests WHERE id = ${betaRequestId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundError("BetaRequest", betaRequestId);

    const snapshot = {
      id: row.id,
      status: row.status,
      invitedAt: row.invited_at ? row.invited_at.toISOString() : null,
      invitedBy: row.invited_by,
    };
    const refuse = (reason: string) => ({ claimed: false as const, email: row.email, snapshot, reason });

    if (row.status !== "INVITED" || !row.invited_at) {
      return refuse(`this request is ${row.status}, not INVITED`);
    }
    if (isInviteExpired(row.invited_at)) {
      return refuse("the invitation has expired and must be re-issued with Re-invite");
    }

    const now = Date.now();
    const recent = await tx.auditEvent.findMany({
      where: {
        eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_ATTEMPTED,
        entityType: ENTITY_TYPE,
        entityId: betaRequestId,
        occurredAt: { gt: new Date(now - 60 * 60 * 1000) },
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, payload: true },
    });
    // Only operator RESEND attempts are bounded; the initial send that accompanies an invite transition does not
    // consume the allowance, so an operator can resend immediately after a failed first send.
    const recentResends = recent.filter((e: { payload: unknown }) => (e.payload as { action?: string } | null)?.action === "RESEND");
    if (recentResends.length >= RESEND_MAX_PER_HOUR) {
      return refuse(`the hourly limit of ${RESEND_MAX_PER_HOUR} email attempts for this request was reached`);
    }
    const last = recentResends[0]?.occurredAt;
    if (last && now - last.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (now - last.getTime())) / 1000));
      return refuse(`an email attempt was just made; wait ${wait} seconds before resending`);
    }

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.BETA_INVITE_EMAIL_ATTEMPTED,
        actorId,
        entityType: ENTITY_TYPE,
        entityId: betaRequestId,
        payload: { action: "RESEND" },
        visibility: "internal",
      },
      tx
    );
    return { claimed: true as const, email: row.email, snapshot };
  });

  if (!claim.claimed) {
    return { ...claim.snapshot, outcome: "NOT_ATTEMPTED", reason: claim.reason };
  }
  const attempt = await dispatchBetaInviteEmail({ betaRequestId, email: claim.email, action: "RESEND", actorId });
  return { ...claim.snapshot, ...attempt };
}
