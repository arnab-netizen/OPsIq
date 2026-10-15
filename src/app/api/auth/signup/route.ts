import { NO_CONTROL_CHARACTERS } from "@/domain/founder-recovery/validation";
import type { NextRequest } from "next/server";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError } from "@/infra/errors";
import { randomUUID, randomBytes, createHash } from "crypto";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";
import { describeAuthFailureForOperator, PUBLIC_AUTH_GENERIC_FAILURE, toPublicAuthError } from "@/lib/public-auth-error";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { isBetaRequestInvited, PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";
import { reservePublicBetaCapacity, BetaCapExceededError, BetaPendingFromSourceError, BetaCapUnavailableError, BetaAdmissionRefusedError } from "@/services/auth/beta-cap";
import { canAdmitSignup } from "@/domain/beta/admission";
import { readEffectiveSettings } from "@/services/beta/platform-settings.service";
import { checkAndSendCapacityAlert } from "@/services/beta/capacity-alerts.service";
import { recordVerificationEmailNotSent, verificationBaseUrlProblem } from "@/services/auth/verification-email-signal";
import { recordProductEvent } from "@/services/analytics/product-events.service";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { publicAdmissionRefusal } from "@/lib/public-admission-response";
import { trustedClientAddress } from "@/lib/client-address";
import { EMAIL_VERIFICATION_TTL_MS, isAwaitingEmailOwnership } from "@/services/auth/email-ownership.service";
import { resendVerificationEmailIfEligible } from "@/services/auth/resend-verification.service";
import { requirePgRateLimit, RateLimitError, EMAIL_VERIFICATION_RATE_LIMIT } from "@/infra/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Signup deliberately accepts NO password and NO policy consents. Before the
 * mailbox is proven, no attacker-selected secret may become a trusted login
 * credential for that email, and a consent given by an unproven party is not
 * the mailbox owner's consent. The password and the three policy acceptances
 * are collected AFTER ownership is proven (verify-email -> one-time setup
 * token -> /api/auth/reset-password). Zod's default object behaviour strips
 * unknown keys, so a stale client that still sends `password` / `accept*` has
 * them discarded before any code can read or store them.
 */
const signupSchema = z.object({
  email: identityEmailSchema,
  // Trimmed before length checks, so a whitespace-only name is rejected as
  // empty rather than accepted verbatim. 100 matches the bound already
  // established for workspace names elsewhere in this domain (see the
  // now-disabled onboarding-workspace route's own schema). A punctuation-only
  // or emoji-only name is deliberately still accepted as a display name here
  // — rejecting it would be a naming restriction this task wasn't asked to
  // add — but it can never collide with another workspace's slug, since slug
  // derivation always falls back to a safe ASCII base plus the workspace's
  // own generated id (see slug_generate below).
  workspaceName: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(100, "Business name must be 100 characters or fewer")
    .refine(NO_CONTROL_CHARACTERS.test, NO_CONTROL_CHARACTERS.message),
});

/**
 * The one success body for a fresh signup AND for a repeated signup against an
 * account that is still awaiting verification. It carries no user or workspace
 * id, so the response is byte-identical in both cases and never discloses the
 * identifiers of an account the caller does not own.
 */
const SIGNUP_PENDING_RESPONSE = {
  success: true,
  pendingVerification: true,
  message: "Check your email to confirm your address. You'll choose your password after you confirm.",
} as const;

/** Verified accounts (and legacy accounts that never required verification) keep today's explicit conflict. */
const EXISTING_ACCOUNT_CONFLICT_TEXT = "An account already exists for this email. Sign in, or use Forgot your password if you never chose one.";

/**
 * Repeated signup for an email whose account has not proven its mailbox yet:
 * rotate the verification (every earlier unused link dies, one fresh link is
 * emailed) and answer exactly as a fresh signup does. Nothing else about the
 * existing account (workspace, name, credentials) is touched. The per-email
 * email budget is shared with /api/auth/resend-verification; when it is
 * exhausted the send is skipped silently, because a 429 here would reveal that
 * a pending account exists (a fresh signup is never throttled per email).
 */
async function respondForPendingSignup(email: string, ip: string): Promise<Response> {
  let withinBudget = true;
  try {
    await requirePgRateLimit(`verify-email-resend:${email}`, EMAIL_VERIFICATION_RATE_LIMIT);
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    withinBudget = false;
  }
  if (withinBudget) {
    await resendVerificationEmailIfEligible(email, {
      ip,
      auditEventName: AUDIT_EVENTS.EMAIL_VERIFICATION_RESENT,
      rotate: true,
    });
  }
  return Response.json(SIGNUP_PENDING_RESPONSE, { status: 201 });
}

// Bounds the Postgres-side statement_timeout applied inside the account-graph
// transaction below (see withStatementTimeout in @/lib/db) — simple inserts
// plus one advisory-lock cap check, generous headroom for a cold Neon connection.
const SIGNUP_TRANSACTION_TIMEOUT_MS = 5000;

/**
 * True when `error` is a Prisma unique-constraint violation on User.email.
 *
 * ROOT CAUSE (found live via the concurrent-double-submit test after the signup-response fix
 * above): this repo's Prisma client uses the @prisma/adapter-pg driver adapter, whose
 * PrismaClientKnownRequestError for P2002 does NOT populate `meta.target` at all -- the field
 * this function originally checked. The actual constraint info lives at
 * `meta.driverAdapterError.cause.constraint.fields` (an array, e.g. ["email"]) with the classic
 * `meta.target` shape never present under this adapter. The old check silently always returned
 * false under this driver, so a genuine concurrent-signup race fell through to the generic 500
 * fallback instead of a governed 409 -- caught here, not in production, because the concurrent
 * test in signup-account-graph.db.test.ts exercises the real race, not just the fast pre-check.
 * Checks both the driver-adapter shape and the classic `meta.target` shape (kept for forward/
 * backward compatibility with a future Prisma/adapter version), and never trusts field detection
 * alone without also confirming the error is P2002.
 */
function isEmailUniqueViolation(error: unknown): boolean {
  const prismaError = error as {
    code?: string;
    meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } };
  } | null;
  if (!prismaError || prismaError.code !== "P2002") return false;
  const adapterFields = prismaError.meta?.driverAdapterError?.cause?.constraint?.fields;
  const target = prismaError.meta?.target;
  return JSON.stringify([adapterFields, target]).toLowerCase().includes("email");
}

/**
 * The exact response for every denied signup attempt while public beta is
 * disabled — whether no BetaRequest exists for the email, it exists but is
 * still REQUESTED, or the request body couldn't even be parsed. Byte-identical
 * across all three so the response never reveals which case occurred
 * (mirrors the enumeration-resistance rationale in /api/beta-requests).
 */
const BETA_CLOSED_RESPONSE = {
  success: false,
  error: "Beta registration isn't available for this account right now. Please check back soon.",
  reason: "beta_disabled",
} as const;

/**
 * Best-effort extraction of a normalized email from the request body, for the
 * controlled-beta admission check only. Never throws — any failure (invalid
 * JSON, missing/malformed email) yields null, which the caller treats
 * identically to "not on the allowlist" so the denial response never reveals
 * which failure occurred. Reads a CLONED request so the original request's
 * body stream is left untouched for the real parseRequestBody(signupSchema)
 * call further down when admission succeeds.
 */
async function extractNormalizedEmailForGate(request: NextRequest): Promise<string | null> {
  try {
    const body: unknown = await request.clone().json();
    if (typeof body !== "object" || body === null || !("email" in body)) return null;
    const result = identityEmailSchema.safeParse((body as { email: unknown }).email);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const handleSignup = async (request: NextRequest) => {
  let currentStage = "unknown";
  // The validated canonical email, kept in scope so the concurrent-signup unique-violation handler can re-resolve
  // the race winner (the request body stream is already consumed by then).
  let validatedEmail: string | null = null;
  try {
    // The admission-mode gate. Server-side, authoritative — reads the
    // governed effective settings (DB-backed once Administration's bootstrap
    // has run, byte-identical legacy env-derived behavior otherwise; see
    // platform-settings.service.ts). This check runs BEFORE full
    // request-body validation, as a fast pre-filter: CLOSED/WAITLIST always
    // refuse here; INVITE_ONLY refuses unless the email has a live (INVITED,
    // unexpired) BetaRequest; OPEN_BETA always continues. Capacity is
    // deliberately NOT checked here (it can only be evaluated race-safely
    // under the advisory lock inside the account-graph transaction below) —
    // this is a mode/invite pre-filter only, using the exact same
    // canAdmitSignup() decision function diagnostics uses, so it can never
    // disagree with the real gate about what admits and what doesn't.
    currentStage = "beta_gate";
    const preFilterSettings = await readEffectiveSettings();
    if (preFilterSettings.admissionMode !== "OPEN_BETA") {
      const gateEmail = await extractNormalizedEmailForGate(request);
      const gateInvited = gateEmail !== null && (await isBetaRequestInvited(gateEmail));
      const wouldAdmit = canAdmitSignup(preFilterSettings.admissionMode, gateInvited, true);
      if (!wouldAdmit) {
        // Recorded so the operator's failure view reflects every refusal, not only the rare in-transaction race.
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.SIGNUP_REFUSED_BETA_DISABLED,
          payload: { reason: preFilterSettings.admissionMode === "WAITLIST" ? "admission_waitlist" : preFilterSettings.admissionMode === "CLOSED" ? "admission_closed" : "not_invited" },
          visibility: "internal",
        });
        return publicAdmissionRefusal("/api/auth/signup", BETA_CLOSED_RESPONSE, 403);
      }
      // Pre-filter passed (admitted pending only a capacity check). Fall
      // through into the exact same validation/account-creation flow — no
      // separate signup path, no token. The real, race-safe admission
      // decision (mode + invited + capacity together, under the shared
      // advisory lock) happens again inside the transaction below.
    }

    // Parse and validate request
    currentStage = "validation";
    const { email, workspaceName } = await parseRequestBody(
      request,
      signupSchema
    );
    validatedEmail = email;

    // Check if user already exists (fast pre-check; the User.email unique
    // constraint inside the transaction below is what actually guarantees
    // correctness under a concurrent double-submit).
    currentStage = "user_lookup";
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      if (!isAwaitingEmailOwnership(existingUser)) {
        throw new ConflictError(EXISTING_ACCOUNT_CONFLICT_TEXT);
      }
      currentStage = "pending_verification_rotation";
      return await respondForPendingSignup(email, request.headers.get("x-forwarded-for") ?? "unknown");
    }

    // Generate ids and timestamps up front so every write below is
    // deterministic and the workspace slug can be made collision-proof.
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const now = new Date();
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    // The per-source bound on unverified signups keys on the PLATFORM-set address, never the caller-influenced list.
    const clientAddress = trustedClientAddress(request.headers);

    // Workspace slug is internal routing metadata, not a human-facing
    // uniqueness promise. Always suffixing with the workspace's own id makes
    // it impossible for a degenerate name (empty, whitespace-only,
    // punctuation-only, emoji/unicode-only) or a duplicate display name to
    // collide with another workspace's slug.
    currentStage = "slug_generate";
    const baseSlug =
      workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "workspace";
    const slug = `${baseSlug}-${workspaceId.slice(0, 8)}`;

    // Raw verification token generated up front (outside the transaction, no
    // I/O) so it can be embedded in the token-hash write below; only the
    // sha256 hash is ever persisted, mirroring PasswordResetToken.
    currentStage = "verification_token_generate";
    const rawVerificationToken = randomBytes(32).toString("hex");
    const verificationTokenHash = createHash("sha256").update(rawVerificationToken).digest("hex");

    // Resolved from the VALIDATED, canonical email (not the best-effort
    // pre-filter extraction above) — this is the value that actually
    // determines both the real admission decision and the signupSource tag
    // written below, so it must be exact.
    currentStage = "invite_check";
    const isInvited = await isBetaRequestInvited(email);

    // User (hashedPassword NULL — no credential exists until ownership is
    // proven), Workspace, WorkspaceMembership, UserRoleAssignment and the
    // EmailVerificationToken are the durable
    // initial-account-graph invariant for an open-beta signup: either all of
    // them commit together, or none do. Deliberately NO Session row and NO
    // cookie here — an open-beta account is not usable until the email
    // verification link is redeemed (see /api/auth/verify-email), so there is
    // no session for it to leak into if verification never happens.
    //
    // The admission check (reservePublicBetaCapacity — mode + invited +
    // capacity together) runs FIRST, inside this same transaction, under a
    // Postgres transaction-scoped advisory lock — see
    // src/services/auth/beta-cap.ts for why a plain COUNT(*) is not
    // race-safe under concurrent signups, and why mode/capacity must be
    // re-verified here even though the pre-filter above already checked mode.
    currentStage = "account_graph_transaction";
    const { user, workspace } = await withStatementTimeout(
      db,
      SIGNUP_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        await reservePublicBetaCapacity(tx, isInvited, isInvited ? null : clientAddress);

        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            hashedPassword: null,
            isActive: true,
            requiresEmailVerification: true,
            updatedAt: now,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            id: workspaceId,
            name: workspaceName,
            slug,
            createdBy: user.id,
            isActive: true,
            signupSource: isInvited ? CONTROLLED_BETA_SIGNUP_SOURCE : PUBLIC_BETA_SIGNUP_SOURCE,
          },
        });

        await tx.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: "owner",
            addedBy: user.id,
            isActive: true,
          },
        });

        await tx.userRoleAssignment.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
            scope: "workspace",
            scopeId: workspace.id,
            grantedAt: now,
            isActive: true,
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            tokenHash: verificationTokenHash,
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
            ipAddress: clientAddress ?? (ip !== "unknown" ? ip : null),
          },
        });

        return { user, workspace };
      },
      "signup-account-graph"
    );

    // Audit is emitted post-commit and non-blocking: the durable account
    // graph above has already committed successfully, so a transient
    // audit-write failure must never turn a real signup success into a false
    // failure response.
    currentStage = "audit_emit";
    try {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_CREATED,
        actorId: user.id,
        workspaceId: workspace.id,
        payload: { email, workspaceName, signupSource: workspace.signupSource },
        visibility: "internal",
      });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.EMAIL_VERIFICATION_REQUESTED,
        actorId: user.id,
        workspaceId: workspace.id,
        entityType: "user",
        entityId: user.id,
        visibility: "internal",
      });
      await recordProductEvent({ name: "signup_completed", workspaceId: workspace.id, actorId: user.id });
    } catch (auditError) {
      const governed = classifyOperatorError(
        auditError instanceof Error ? auditError : new Error(String(auditError)),
        { context: "load" }
      );
      console.error("[SIGNUP_AUDIT_FAILURE]", governed.technicalDetails);
    }

    // Best-effort, non-blocking capacity-threshold check (never throws — see
    // checkAndSendCapacityAlert's own doc comment).
    currentStage = "capacity_alert_check";
    await checkAndSendCapacityAlert();

    // Best-effort delivery: the token is already durably stored above, so a
    // transient Resend failure (or no provider configured at all) must never
    // turn a real signup into a client-visible failure — the account exists
    // and can request a fresh verification email via /api/auth/resend-verification.
    currentStage = "verification_email_send";
    try {
      const provider = getEmailProvider();
      if (provider) {
        const verifyUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/verify-email?token=${rawVerificationToken}`;
        if (verificationBaseUrlProblem(getConfig().NEXT_PUBLIC_APP_URL)) {
          await recordVerificationEmailNotSent({ reason: "BASE_URL_NOT_PUBLIC", userId: user.id, workspaceId: workspace.id });
        }
        await provider.send({
          to: user.email,
          subject: "Verify your OpsIQ account",
          html: `<p>Welcome to the OpsIQ beta.</p><p><a href="${verifyUrl}">Confirm your email</a> and you'll then choose your password.</p><p>This link expires in 7 days. If you didn't ask for an OpsIQ account, ignore this email — nothing is activated until you confirm. Never share this link.</p>`,
          text: `Confirm your email for OpsIQ: ${verifyUrl}\n\nYou'll choose your password after you confirm. This link expires in 7 days. If you didn't ask for an OpsIQ account, ignore this email — nothing is activated until you confirm. Never share this link.`,
        });
      } else {
        console.warn("[SIGNUP] No email provider configured — verification token created but not emailed", { userId: user.id });
        await recordVerificationEmailNotSent({ reason: "NO_PROVIDER", userId: user.id, workspaceId: workspace.id });
      }
    } catch (emailError) {
      await recordVerificationEmailNotSent({ reason: "SEND_FAILED", userId: user.id, workspaceId: workspace.id });
      console.error("[SIGNUP] Verification email dispatch failed", { userId: user.id, errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError" });
    }

    currentStage = "response";
    return Response.json(SIGNUP_PENDING_RESPONSE, { status: 201 });
  } catch (error) {
    if (error instanceof BetaCapExceededError) {
      console.warn("[SIGNUP_REFUSED] beta cap reached");
      // No workspaceId exists (the refused signup never created one), so this
      // is the same shape as login's own pre-account USER_LOGIN_FAILED call:
      // emitAuditEvent's fail-safe branch for a missing workspaceId returns a
      // sentinel rather than throwing, so no .catch() is needed here — and
      // DC-19 (scripts/a77-prevention-gates.ts) forbids swallowing a write-path
      // emitAuditEvent failure regardless.
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.SIGNUP_REFUSED_BETA_CAP,
        payload: { reason: error instanceof BetaPendingFromSourceError ? "pending_from_source" : "beta_cap_reached" },
        visibility: "internal",
      });
      return Response.json(
        { success: false, error: error.message, reason: "beta_cap_reached" },
        { status: 403 }
      );
    }
    if (error instanceof BetaCapUnavailableError) {
      // Fail closed: the cap could not be evaluated, so signup is refused
      // rather than silently allowed past an unverifiable limit.
      console.error("[SIGNUP_REFUSED] beta cap unavailable", error.cause);
      return Response.json(
        { success: false, error: "Signup is temporarily unavailable. Please try again shortly.", reason: "beta_cap_unavailable" },
        { status: 503 }
      );
    }
    if (error instanceof BetaAdmissionRefusedError) {
      // The pre-filter above already refuses most of these before this stage
      // is ever reached; this branch exists for the race window between that
      // check and the transaction's authoritative, lock-protected re-check
      // (e.g. an operator closes admission mid-request). Same generic,
      // enumeration-resistant response as the pre-filter.
      console.warn("[SIGNUP_REFUSED] admission refused inside transaction", { reason: error.reason });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.SIGNUP_REFUSED_BETA_DISABLED,
        payload: { reason: error.reason },
        visibility: "internal",
      });
      return publicAdmissionRefusal("/api/auth/signup", BETA_CLOSED_RESPONSE, 403);
    }

    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = describeAuthFailureForOperator(error);
    let prismaCode: string | null = null;
    let classification = "unknown_error";

    // Extract Prisma error code if present
    const prismaError = error as { code?: string };
    if (prismaError.code) {
      prismaCode = prismaError.code;
      if (prismaError.code === "P2002") {
        classification = "unique_constraint_violation";
      } else if (prismaError.code === "P2014") {
        classification = "required_relation_violation";
      } else if (prismaError.code.startsWith("P2")) {
        classification = "database_error";
      }
    }

    console.error(`[SIGNUP_FAILURE] stage=${currentStage} errorName=${errorName} safeMessage=${errorMessage} prismaCode=${prismaCode || "none"} classification=${classification}`);

    // Server-log-only technical detail via the governed classifier (same pattern as the audit-failure path
    // above); length-bounded, never part of any response body.
    console.error(
      "[SIGNUP_FAILURE_DETAIL]",
      classifyOperatorError(error, { context: "load" }).technicalDetails.slice(0, 1000)
    );

    // Check if request has diagnostic key for protected detailed response
    const hasDiagnosticAccess = verifyDiagnosticKeyFromRequest(request);

    // If diagnostic key is valid, return protected diagnostic response
    if (hasDiagnosticAccess) {
      return Response.json(
        {
          reason: "signup_failed",
          stage: currentStage,
          errorName,
          prismaCode,
          safeMessage: errorMessage,
          classification,
        },
        { status: 500 }
      );
    }

    // Otherwise return normal safe error response.
    //
    // ROOT CAUSE (found via Vercel runtime log forensics, [SIGNUP_FAILURE] entries with
    // errorName=ConflictError and errorName=ValidationError): this route is a bare async
    // function, not wrapped in withCanonicalEnforcement (the shared wrapper that converts a
    // thrown AppError into a proper JSON response elsewhere in the app) -- `throw`ing an AppError
    // here (ConflictError from a duplicate email, ValidationError from parseRequestBody, or any
    // other AppError subclass) previously escaped straight past this handler into Next.js's own
    // default error handling, which returns a generic 500 with NO parseable `{error: "..."}` JSON
    // body. The signup page's client-side `res.json().catch(() => null)` then silently got `null`
    // and fell through to its fixed "Something went wrong. Please try again." fallback --
    // discarding the specific, already-safe message computed for every one of these cases,
    // including the single most common one: signing up again with an email that already has an
    // account. Fixed generically (not one-by-one per subclass, which is exactly how the
    // ValidationError case was originally missed) by returning a governed Response.json for ANY
    // AppError, using its own real statusCode/message -- both are constructed safe-by-design (see
    // AppError's subclasses in infra/errors.ts) -- same shape as the BetaCapExceededError/
    // BetaCapUnavailableError branches above.
    const validationFailure = error instanceof z.ZodError ? toPublicAuthError(error) : null;
    if (validationFailure) {
      return Response.json(validationFailure.body, { status: validationFailure.status });
    }

    // A concurrent double-submit can lose the email uniqueness race inside the transaction (the
    // pre-check above only catches the common case) — surface it as the same friendly conflict
    // rather than letting the raw Prisma error fall through to the generic AppError branch below.
    if (isEmailUniqueViolation(error)) {
      // The race winner may be an account that is still awaiting verification: treat the loser exactly like a
      // repeated signup for it (rotate + same success body) rather than a misleading "sign in instead".
      const winner = validatedEmail ? await db.user.findUnique({ where: { email: validatedEmail } }) : null;
      if (validatedEmail && winner && isAwaitingEmailOwnership(winner)) {
        return respondForPendingSignup(validatedEmail, request.headers.get("x-forwarded-for") ?? "unknown");
      }
      return Response.json({ success: false, error: EXISTING_ACCOUNT_CONFLICT_TEXT }, { status: 409 });
    }

    const publicFailure = toPublicAuthError(error);
    if (publicFailure) {
      return Response.json(publicFailure.body, { status: publicFailure.status });
    }

    // CM-SEC-02: never surface a raw internal error (Prisma text, stack, internal
    // hostnames) to a public signup caller. The technical detail is captured in
    // the server log above ([SIGNUP_FAILURE_DETAIL]); the diagnostic-key-gated branch carries only error name/code; the
    // client gets a stable, generic message.
    return Response.json({ success: false, error: PUBLIC_AUTH_GENERIC_FAILURE }, { status: 500 });
  }
};

/**
 * Public signup handler. Throttles by client IP to protect signup from
 * bot/spam floods during high traffic, then delegates to the unchanged signup
 * logic. The limiter is skipped when there is no edge-provided client IP
 * (e.g. server-side tests), so it only engages for real inbound traffic.
 * Rate-limit helpers are imported lazily to keep request-handling concerns
 * separate from the core signup flow.
 */
export const POST = async (request: NextRequest) => {
  const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
  if (clientIp !== "unknown") {
    const { requirePgRateLimit, RateLimitError, LOGIN_RATE_LIMIT } = await import(
      "@/infra/rate-limit"
    );
    try {
      await requirePgRateLimit(`signup:${clientIp}`, LOGIN_RATE_LIMIT);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return Response.json(
          { success: false, error: "Too many signup attempts. Please wait and try again." },
          { status: 429 }
        );
      }
      throw error;
    }
  }
  return handleSignup(request);
};
