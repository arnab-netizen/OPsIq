import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { UnauthorizedError } from "@/infra/errors";
import { requireRateLimit, LOGIN_RATE_LIMIT } from "@/infra/rate-limit";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { ensureStartupComplete } from "@/infra/startup-orchestrator";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = async (request: NextRequest) => {
  let classification = "unknown";
  try {
    console.log("[LOGIN] START");

    try {
      console.log("[LOGIN] ENV_DATABASE_URL_PRESENT", { present: !!process.env.DATABASE_URL });
    } catch (logError) {
      console.error("[LOGIN] LOG_ENV_CHECK_FAILED", logError instanceof Error ? logError.message : String(logError));
    }

    // Ensure database is initialized before attempting login
    try {
      console.log("[LOGIN] STARTUP_START");
      await ensureStartupComplete();
      console.log("[LOGIN] DB_INIT_OK");
    } catch (startupError) {
      const errorName = startupError instanceof Error ? startupError.constructor.name : "UnknownError";
      const errorMsg = startupError instanceof Error ? startupError.message : String(startupError);
      console.error("[LOGIN] STARTUP_FAILED", { error: errorName, message: errorMsg });
      throw startupError;
    }

    console.log("[LOGIN] PARSE_START");
    const { email, password } = await parseRequestBody(request, loginSchema);
    console.log("[LOGIN] EMAIL_PARSED", { email: email ? "yes" : "no" });

    // Extract idempotency key for session deduplication
    const idempotencyKey = request.headers.get("idempotency-key");

    // Rate limit by IP + email to prevent brute force
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    requireRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
    requireRateLimit(`login:${email}`, LOGIN_RATE_LIMIT);

    const user = await db.user.findUnique({ where: { email } });
    console.log("[LOGIN] USER_LOOKUP", { found: !!user, isActive: user?.isActive, hasPassword: !!user?.hashedPassword });
    console.log("[LOGIN] USER_FOUND", { found: !!user });

    if (!user || !user.isActive || !user.hashedPassword) {
      console.log("[LOGIN] FAILED_USER_VALIDATION");
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
        payload: { email, reason: "user_not_found_or_inactive" },
        visibility: "internal",
      });
      throw new UnauthorizedError("Invalid email or password");
    }

    // Get user's workspace membership for audit scope
    const membership = await db.workspaceMembership.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { addedAt: "asc" },
    });

    const workspaceId = membership?.workspaceId;
    console.log("[LOGIN] MEMBERSHIP_LOOKUP", { found: !!membership, hasWorkspace: !!workspaceId });
    console.log("[LOGIN] MEMBERSHIP_FOUND", { found: !!membership });

    // Password verification using bcrypt
    const passwordValid = await bcrypt.compare(password, user.hashedPassword);
    console.log("[LOGIN] PASSWORD_MATCH", { valid: passwordValid });
    console.log("[LOGIN] PASSWORD_VALID", { valid: passwordValid });

    if (!passwordValid) {
      console.log("[LOGIN] FAILED_PASSWORD_MISMATCH");
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
        actorId: user.id,
        workspaceId,
        payload: { reason: "invalid_password" },
        visibility: "internal",
      });
      throw new UnauthorizedError("Invalid email or password");
    }

    const sessionId = uuidv4();
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + getSessionDurationMs());

    console.log("[LOGIN] SESSION_CREATE_START");
    let session;
    try {
      session = await db.session.create({
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
    } catch (error) {
      const errName = error instanceof Error ? error.constructor.name : "UnknownError";
      console.log("[LOGIN] SESSION_CREATE_FAILED", { error: errName });
      throw error;
    }

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
    } catch (error) {
      const errName = error instanceof Error ? error.constructor.name : "UnknownError";
      console.log("[LOGIN] AUDIT_CREATE_FAILED", { error: errName });
      // Don't throw - audit failure shouldn't block login
    }

    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    console.log("[LOGIN] COOKIE_SET_OK");
    console.log("[LOGIN] REDIRECT_DASHBOARD_START");
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[LOGIN_FAILED]", { errorName, errorMsg });

    try {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'auth' });
      console.error("[LOGIN_ERROR]", governed.operatorMessage);
    } catch (classifyError) {
      console.error("[LOGIN] CLASSIFY_FAILED", classifyError instanceof Error ? classifyError.message : String(classifyError));
    }

    classification = "unknown_error";
    if (error instanceof UnauthorizedError) {
      classification = "unauthorized";
    } else if (errorMsg.includes("Database not initialized")) {
      classification = "db_not_initialized";
    } else if (errorMsg.includes("Startup previously failed")) {
      classification = "startup_failed";
    } else if (errorMsg.includes("Startup checks timed out")) {
      classification = "startup_timeout";
    } else if (errorMsg.includes("database") || errorMsg.includes("Database")) {
      classification = "db_error";
    } else if (errorMsg.includes("ENOENT") || errorMsg.includes("connection")) {
      classification = "connection_error";
    } else if (errorMsg.includes("parse") || errorMsg.includes("Parse")) {
      classification = "request_parse_error";
    }
    console.log("[LOGIN] FAILED_CLASSIFICATION", { classification });

    let errorMessage = "Login failed";
    try {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'auth' });
      errorMessage = governed.operatorMessage;
    } catch {
      // If classification fails, use generic message
    }

    if (error instanceof UnauthorizedError) {
      return Response.json({ error: classifyOperatorError(error, { context: "auth" }).operatorMessage }, { status: 401 });
    }

    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
};
