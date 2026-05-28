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
  try {
    // Ensure database is initialized before attempting login
    await ensureStartupComplete();
    console.log("[LOGIN] START");

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

    if (!user || !user.isActive || !user.hashedPassword) {
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

    // Password verification using bcrypt
    const passwordValid = await bcrypt.compare(password, user.hashedPassword);
    console.log("[LOGIN] PASSWORD_MATCH", { valid: passwordValid });

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

    console.log("[LOGIN] AUDIT_CREATE_START");
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_IN,
      actorId: user.id,
      entityType: "session",
      entityId: session.id,
      workspaceId,
      visibility: "internal",
    });
    console.log("[LOGIN] AUDIT_CREATE_OK");

    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    console.log("[LOGIN] COOKIE_SET_OK");
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

    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'auth' });
    console.error("[LOGIN_ERROR]", governed.operatorMessage, error);

    if (error instanceof UnauthorizedError) {
      return Response.json({ error: classifyOperatorError(error, { context: "auth" }).operatorMessage }, { status: 401 });
    }

    return Response.json(
      { error: "Login failed", details: governed.operatorMessage },
      { status: 500 }
    );
  }
};
