import type { NextRequest } from "next/server";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { BadRequestError, ConflictError } from "@/infra/errors";
import { randomUUID, randomBytes, createHash } from "crypto";
import { z } from "zod/v4";
import * as bcrypt from "bcryptjs";
import { ROLES } from "@/domain/constants/roles";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { isPublicBetaEnabled, PUBLIC_BETA_SIGNUP_SOURCE, CURRENT_POLICY_VERSIONS } from "@/lib/beta";
import { reservePublicBetaCapacity, BetaCapExceededError, BetaCapUnavailableError } from "@/services/auth/beta-cap";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One week — generous enough that a real user finds and reads the email, bounded so an unredeemed link doesn't linger forever. */
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `z.literal(true)` rather than `z.boolean()`: a request that sends `false`,
 * omits the field, or sends a truthy-but-non-boolean value (e.g. the string
 * `"true"`) is rejected identically. There is no server-side default that
 * ever substitutes a missing checkbox with acceptance — every one of the
 * three consents must be explicitly and exactly `true` in the parsed body.
 */
const signupSchema = z.object({
  email: identityEmailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
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
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be 100 characters or fewer"),
  acceptTerms: z.literal(true, "You must accept the Terms of Service"),
  acceptPrivacy: z.literal(true, "You must accept the Privacy Notice"),
  acceptBetaNotice: z.literal(true, "You must accept the Beta Notice"),
});

// Bounds the Postgres-side statement_timeout applied inside the account-graph
// transaction below (see withStatementTimeout in @/lib/db) — simple inserts
// plus one advisory-lock cap check, generous headroom for a cold Neon connection.
const SIGNUP_TRANSACTION_TIMEOUT_MS = 5000;

/** True when `error` is a Prisma unique-constraint violation on User.email. */
function isEmailUniqueViolation(error: unknown): boolean {
  const prismaError = error as { code?: string; meta?: { target?: unknown } } | null;
  if (!prismaError || prismaError.code !== "P2002") return false;
  return JSON.stringify(prismaError.meta?.target ?? "").toLowerCase().includes("email");
}

const handleSignup = async (request: NextRequest) => {
  let currentStage = "unknown";
  try {
    // The beta kill switch. Server-side, authoritative, re-evaluated fresh on
    // every request from process.env — there is no client-supplied field that
    // can influence this check, and no cached/memoized value that could go
    // stale relative to a Vercel environment-variable change. This check runs
    // BEFORE request-body validation, so a disabled beta refuses every
    // signup attempt regardless of what the caller sends.
    currentStage = "beta_gate";
    if (!isPublicBetaEnabled()) {
      return Response.json(
        {
          success: false,
          error: "Open beta registration is currently closed. Please check back soon.",
          reason: "beta_disabled",
        },
        { status: 403 }
      );
    }

    // Parse and validate request
    currentStage = "validation";
    const { email, password, workspaceName } = await parseRequestBody(
      request,
      signupSchema
    );

    // Check if user already exists (fast pre-check; the User.email unique
    // constraint inside the transaction below is what actually guarantees
    // correctness under a concurrent double-submit).
    currentStage = "user_lookup";
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError("Email already in use");
    }

    // Hash password
    currentStage = "bcrypt_hash";
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate ids and timestamps up front so every write below is
    // deterministic and the workspace slug can be made collision-proof.
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const now = new Date();
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";

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

    // User, Workspace, WorkspaceMembership, UserRoleAssignment, the three
    // PolicyAcceptance rows, and the EmailVerificationToken are the durable
    // initial-account-graph invariant for an open-beta signup: either all of
    // them commit together, or none do. Deliberately NO Session row and NO
    // cookie here — an open-beta account is not usable until the email
    // verification link is redeemed (see /api/auth/verify-email), so there is
    // no session for it to leak into if verification never happens.
    //
    // The beta-workspace-cap check (reservePublicBetaCapacity) runs FIRST,
    // inside this same transaction, under a Postgres transaction-scoped
    // advisory lock — see src/services/auth/beta-cap.ts for why a plain
    // COUNT(*) is not race-safe under concurrent signups.
    currentStage = "account_graph_transaction";
    const { user, workspace } = await withStatementTimeout(
      db,
      SIGNUP_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        await reservePublicBetaCapacity(tx);

        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            hashedPassword,
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
            signupSource: PUBLIC_BETA_SIGNUP_SOURCE,
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

        for (const policyType of Object.keys(CURRENT_POLICY_VERSIONS) as Array<keyof typeof CURRENT_POLICY_VERSIONS>) {
          await tx.policyAcceptance.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              policyType,
              version: CURRENT_POLICY_VERSIONS[policyType],
              ipAddress: ip !== "unknown" ? ip : null,
            },
          });
        }

        await tx.emailVerificationToken.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            tokenHash: verificationTokenHash,
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
            ipAddress: ip !== "unknown" ? ip : null,
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
        payload: { email, workspaceName, signupSource: PUBLIC_BETA_SIGNUP_SOURCE },
        visibility: "internal",
      });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.POLICY_ACCEPTED,
        actorId: user.id,
        workspaceId: workspace.id,
        payload: { versions: CURRENT_POLICY_VERSIONS },
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
    } catch (auditError) {
      const governed = classifyOperatorError(
        auditError instanceof Error ? auditError : new Error(String(auditError)),
        { context: "load" }
      );
      console.error("[SIGNUP_AUDIT_FAILURE]", governed.technicalDetails);
    }

    // Best-effort delivery: the token is already durably stored above, so a
    // transient Resend failure (or no provider configured at all) must never
    // turn a real signup into a client-visible failure — the account exists
    // and can request a fresh verification email via /api/auth/resend-verification.
    currentStage = "verification_email_send";
    try {
      const provider = getEmailProvider();
      if (provider) {
        const verifyUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/verify-email?token=${rawVerificationToken}`;
        await provider.send({
          to: user.email,
          subject: "Verify your OpsIQ account",
          html: `<p>Welcome to the OpsIQ open beta.</p><p><a href="${verifyUrl}">Verify your email to activate your account</a></p><p>This link expires in 7 days. Never share it — it grants access to your account.</p>`,
          text: `Verify your OpsIQ account: ${verifyUrl}\n\nThis link expires in 7 days. Never share it — it grants access to your account.`,
        });
      } else {
        console.warn("[SIGNUP] No email provider configured — verification token created but not emailed", { userId: user.id });
      }
    } catch (emailError) {
      console.error("[SIGNUP] Verification email dispatch failed", { userId: user.id, errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError" });
    }

    currentStage = "response";
    return Response.json(
      {
        success: true,
        pendingVerification: true,
        message: "Account created. Check your email to verify your account before signing in.",
        user: { id: user.id, email: user.email },
        workspace: { id: workspace.id, name: workspace.name },
      },
      { status: 201 }
    );
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
        payload: { reason: "beta_cap_reached" },
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

    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

    // Otherwise return normal safe error response
    if (error instanceof z.ZodError) {
      throw new BadRequestError(
        `Validation error: ${error.issues.map((i) => i.message).join(", ")}`
      );
    }

    if (error instanceof ConflictError) {
      throw error;
    }

    // A concurrent double-submit can lose the email uniqueness race inside
    // the transaction (the pre-check above only catches the common case) —
    // surface it as the same friendly conflict rather than a generic failure.
    if (isEmailUniqueViolation(error)) {
      throw new ConflictError("Email already in use");
    }

    // CM-SEC-02: never surface a raw internal error (Prisma text, stack, internal
    // hostnames) to a public signup caller. The full detail is already captured in
    // the server log above and reachable via the diagnostic-key-gated branch; the
    // client gets a stable, generic message.
    throw new BadRequestError("Signup failed. Please try again.");
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
