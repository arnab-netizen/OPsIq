import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const signupSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  workspaceName: z.string().min(1, "Workspace name is required"),
});

export const POST = async (request: NextRequest) => {
  let currentStage = "unknown";
  try {
    // Parse and validate request
    currentStage = "validation";
    const { email, password, workspaceName } = await parseRequestBody(
      request,
      signupSchema
    );

    // Check if user already exists
    currentStage = "user_lookup";
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError("Email already in use");
    }

    // Hash password
    currentStage = "bcrypt_hash";
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate user ID and timestamps
    const userId = randomUUID();
    const now = new Date();

    // Create user
    currentStage = "user_create";
    const user = await db.user.create({
      data: {
        id: userId,
        email,
        hashedPassword,
        isActive: true,
        updatedAt: now,
      },
    });

    // Create workspace for user
    currentStage = "workspace_create";
    const workspace = await db.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        createdBy: user.id,
        isActive: true,
      },
    });

    // Add user as owner to workspace
    currentStage = "membership_create";
    await db.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        addedBy: user.id,
        isActive: true,
      },
    });

    // Grant owner permissions via UserRoleAssignment
    currentStage = "role_assignment_create";
    await db.userRoleAssignment.create({
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

    // Create session (token is a separate unique identifier required by schema)
    currentStage = "session_create";
    const sessionId = randomUUID();
    const sessionToken = randomUUID();
    const expiresAt = new Date(
      Date.now() + getSessionDurationMs()
    );

    const session = await db.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        token: sessionToken,
        expiresAt,
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
        userAgent: request.headers.get("user-agent") ?? "unknown",
      },
    });

    // Set session cookie (use token, not id, matching auth/login pattern)
    currentStage = "cookie_set";
    const cookieStore = await cookies();
    const sessionCookieName = getSessionCookieName();
    cookieStore.set(sessionCookieName, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getSessionDurationMs() / 1000,
      path: "/",
    });

    // Emit audit event
    currentStage = "audit_emit";
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

    if (error instanceof Error) {
      throw new BadRequestError(error.message);
    }

    throw new BadRequestError("Signup failed");
  }
};
