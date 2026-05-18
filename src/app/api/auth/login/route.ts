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
  const { email, password } = await parseRequestBody(request, loginSchema);

  // Extract idempotency key for session deduplication
  const idempotencyKey = request.headers.get("idempotency-key");

  // Rate limit by IP + email to prevent brute force
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  requireRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  requireRateLimit(`login:${email}`, LOGIN_RATE_LIMIT);

  const user = await db.user.findUnique({ where: { email } });

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

  // Password verification using bcrypt
  const passwordValid = await bcrypt.compare(password, user.hashedPassword);

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

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_LOGGED_IN,
    actorId: user.id,
    entityType: "session",
    entityId: session.id,
    workspaceId,
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
};
