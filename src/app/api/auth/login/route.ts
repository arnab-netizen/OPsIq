import { withRequestContext } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { UnauthorizedError } from "@/infra/errors";
import { getSessionCookieName, getSessionDurationMs } from "@/services/auth";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";
import { cookies } from "next/headers";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = withRequestContext(async (request) => {
  const { email, password } = await parseRequestBody(request, loginSchema);

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.isActive || !user.hashedPassword) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
      payload: { email, reason: "user_not_found_or_inactive" },
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  // Password verification: In production, use bcrypt/argon2.
  // For the foundation scaffold, we store hashed passwords and compare directly.
  // The hashing implementation will be added with the user management module.
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(password).digest("hex");

  if (hash !== user.hashedPassword) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGIN_FAILED,
      actorId: user.id,
      payload: { reason: "invalid_password" },
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
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.USER_LOGGED_IN,
    actorId: user.id,
    entityType: "session",
    entityId: session.id,
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
