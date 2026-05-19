import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
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

export const POST = withEnforcementFull(async (request) => {
  const { email, password } = await parseRequestBody(request, loginSchema);

  // Rate limit by IP + email to prevent brute force
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  requireRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  requireRateLimit(`login:${email}`, LOGIN_RATE_LIMIT);

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.isActive || !user.hashedPassword) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
      capability: "login",
      decision: "login_failed",
      requestId: request.headers.get("x-request-id") || `login:${email}:${Date.now()}`,
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

  // Password verification using bcrypt
  const passwordValid = await bcrypt.compare(password, user.hashedPassword);

  if (!passwordValid) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
      actorId: user.id,
      workspaceId,
      capability: "login",
      decision: "login_failed",
      requestId: request.headers.get("x-request-id") || `login:${user.id}:${Date.now()}`,
      payload: { reason: "invalid_password" },
      visibility: "internal",
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + getSessionDurationMs());

  const session = await db.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_LOGGED_IN,
    actorId: user.id,
    workspaceId,
    capability: "login",
    decision: "login_success",
    requestId: request.headers.get("x-request-id") || `login:${user.id}:${Date.now()}`,
    entityType: "session",
    entityId: session.id,
    visibility: "internal",
  });

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
});
