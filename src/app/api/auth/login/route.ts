import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { UnauthorizedError } from "@/infra/errors";
import { requireRateLimit, LOGIN_RATE_LIMIT } from "@/infra/rate-limit";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = async (request: NextRequest) => {
  let stage = "start";

  try {
    console.log("[LOGIN] START");

    // Parse request body
    stage = "parse_body";
    const { email, password } = await parseRequestBody(request, loginSchema);
    console.log("[LOGIN] BODY_PARSED");

    // Extract idempotency key for session deduplication
    stage = "headers";
    const idempotencyKey = request.headers.get("idempotency-key");
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    console.log("[LOGIN] HEADERS_READ");

    // Rate limit by IP + email to prevent brute force
    stage = "rate_limit";
    requireRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
    requireRateLimit(`login:${email}`, LOGIN_RATE_LIMIT);
    console.log("[LOGIN] RATE_LIMIT_OK");

    // Database initialization - ensure DB is ready before operations
    stage = "db_init";
    try {
      const { getDbInstance } = await import("@/lib/db");
      await getDbInstance();
      console.log("[LOGIN] DB_INIT_OK");
    } catch (dbInitError) {
      const errName = dbInitError instanceof Error ? dbInitError.constructor.name : "UnknownError";
      console.error("[LOGIN] DB_INIT_FAILED", { error: errName });
      throw dbInitError;
    }

    // User lookup
    stage = "user_lookup";
    const user = await db.user.findUnique({ where: { email } });
    console.log("[LOGIN] USER_LOOKUP_OK", { found: !!user });

    if (!user || !user.isActive || !user.hashedPassword) {
      console.log("[LOGIN] USER_VALIDATION_FAILED", { found: !!user, active: user?.isActive, hasPassword: !!user?.hashedPassword });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
        payload: { email, reason: "user_not_found_or_inactive" },
        visibility: "internal",
      });
      throw new UnauthorizedError("Invalid email or password");
    }

    // Get user's workspace membership for audit scope.
    // Login only needs the workspace id (to scope the audit events emitted below); it reads no
    // other membership column. A bare findFirst selects EVERY column of the row, so if the
    // deployed database is missing any newer `workspace_memberships` column (migration/deploy
    // drift — e.g. the Slice 3B employee-profile columns), Prisma throws P2022 ("column ... does
    // not exist") and login 500s with classification "membership_lookup_failed" — the pre-existing
    // production dashboard-smoke failure. Selecting ONLY workspaceId makes login resilient to
    // drift on any non-core column (workspace_id is a core column present since the table's
    // creation), without changing behaviour: workspaceId is still resolved for audit scope.
    stage = "membership_lookup";
    const membership = await db.workspaceMembership.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { addedAt: "asc" },
      select: { workspaceId: true },
    });

    const workspaceId = membership?.workspaceId;
    console.log("[LOGIN] MEMBERSHIP_LOOKUP_OK", { found: !!membership });

    // Password verification using bcrypt
    stage = "password_compare";
    const passwordValid = await bcrypt.compare(password, user.hashedPassword);
    console.log("[LOGIN] PASSWORD_COMPARE_OK", { valid: passwordValid });

    if (!passwordValid) {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
        actorId: user.id,
        workspaceId,
        payload: { reason: "invalid_password" },
        visibility: "internal",
      });
      throw new UnauthorizedError("Invalid email or password");
    }

    // Session creation
    stage = "session_create";
    const sessionId = uuidv4();
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + getSessionDurationMs());

    console.log("[LOGIN] SESSION_CREATE_START");
    const session = await db.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        token,
        expiresAt,
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });
    console.log("[LOGIN] SESSION_CREATE_OK");

    // Audit event
    stage = "audit_write";
    console.log("[LOGIN] AUDIT_CREATE_START");
    try {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGGED_IN,
        actorId: user.id,
        entityType: "session",
        entityId: session.id,
        workspaceId,
        visibility: "internal",
      });
      console.log("[LOGIN] AUDIT_CREATE_OK");
    } catch (auditError) {
      const errName = auditError instanceof Error ? auditError.constructor.name : "UnknownError";
      console.error("[LOGIN] AUDIT_CREATE_FAILED", { error: errName });
      // Don't throw - audit failure shouldn't block login
    }

    // Set cookie
    stage = "cookie_set";
    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    console.log("[LOGIN] COOKIE_SET_OK");

    // Success response
    stage = "response";
    console.log("[LOGIN] SUCCESS");

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.constructor.name : "UnknownError";

    console.error("[LOGIN_FAILED]", { stage, errorName });

    let classification = "unknown_error";
    if (error instanceof UnauthorizedError) {
      classification = "invalid_credentials";
    } else if (stage === "parse_body") {
      classification = "validation_failed";
    } else if (stage === "rate_limit") {
      classification = "rate_limit_exceeded";
    } else if (stage === "db_init") {
      classification = "db_init_failed";
    } else if (stage === "user_lookup") {
      classification = "user_lookup_failed";
    } else if (stage === "password_compare") {
      classification = "password_compare_failed";
    } else if (stage === "membership_lookup") {
      classification = "membership_lookup_failed";
    } else if (stage === "session_create") {
      classification = "session_create_failed";
    } else if (stage === "audit_write") {
      classification = "audit_write_failed";
    } else if (stage === "cookie_set") {
      classification = "cookie_set_failed";
    } else if (stage === "response") {
      classification = "response_failed";
    }

    console.log("[LOGIN] CLASSIFICATION", { stage, classification });

    if (error instanceof UnauthorizedError) {
      return Response.json({
        error: "Invalid email or password",
        classification: "invalid_credentials"
      }, { status: 401 });
    }

    return Response.json(
      {
        error: "Login failed",
        classification,
        stage
      },
      { status: 500 }
    );
  }
};
