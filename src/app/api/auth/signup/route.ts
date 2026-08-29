import type { NextRequest } from "next/server";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { BadRequestError, ConflictError } from "@/infra/errors";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";
import { ROLES } from "@/domain/constants/roles";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const signupSchema = z.object({
  email: z.email("Invalid email address"),
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
});

// Bounds the Postgres-side statement_timeout applied inside the account-graph
// transaction below (see withStatementTimeout in @/lib/db) — five simple
// inserts, generous headroom for a cold Neon connection.
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

    // User, Workspace, WorkspaceMembership, UserRoleAssignment and Session
    // are the durable initial-account-graph invariant: either all five
    // commit together, or none do. Wrapping them in one transaction closes
    // the previous orphaned-User/orphaned-Workspace failure windows (a
    // failure at any later stage used to leave every earlier `create`
    // permanently committed).
    currentStage = "account_graph_transaction";
    const { user, workspace, sessionToken } = await withStatementTimeout(
      db,
      SIGNUP_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            hashedPassword,
            isActive: true,
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

        const sessionToken = randomUUID();
        await tx.session.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            token: sessionToken,
            expiresAt: new Date(Date.now() + getSessionDurationMs()),
            ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
            userAgent: request.headers.get("user-agent") ?? "unknown",
          },
        });

        return { user, workspace, sessionToken };
      },
      "signup-account-graph"
    );

    // Cookie mutation stays outside the DB transaction — it is not a
    // database operation and must never be coupled to Prisma's rollback
    // semantics (use the token, not the session id, matching login).
    currentStage = "cookie_set";
    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getSessionDurationMs() / 1000,
      path: "/",
    });

    // Audit is emitted post-commit and non-blocking: the durable account
    // graph above has already committed successfully, so a transient
    // audit-write failure must never turn a real signup success into a false
    // failure response to a client who already holds a valid session cookie
    // (mirrors the login route's established "don't block on audit" pattern).
    currentStage = "audit_emit";
    try {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_CREATED,
        actorId: user.id,
        workspaceId: workspace.id,
        payload: {
          email,
          workspaceName,
        },
        visibility: "internal",
      });
    } catch (auditError) {
      const governed = classifyOperatorError(
        auditError instanceof Error ? auditError : new Error(String(auditError)),
        { context: "load" }
      );
      console.error("[SIGNUP_AUDIT_FAILURE]", governed.technicalDetails);
    }

    currentStage = "response";
    return Response.json(
      {
        success: true,
        user: { id: user.id, email: user.email },
        workspace: { id: workspace.id, name: workspace.name },
      },
      { status: 201 }
    );
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    let prismaCode: string | null = null;
    let classification = "unknown_error";

    // Extract Prisma error code if present
    const prismaError = error as any;
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
    const { requireRateLimit, RateLimitError, LOGIN_RATE_LIMIT } = await import(
      "@/infra/rate-limit"
    );
    try {
      requireRateLimit(`signup:${clientIp}`, LOGIN_RATE_LIMIT);
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
