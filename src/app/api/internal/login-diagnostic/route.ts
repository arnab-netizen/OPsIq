import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import * as bcrypt from "bcryptjs";

const DEMO_EMAIL = "operator@demo.local";
const DEMO_PASSWORD = "demo-password-123";
const DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY;

export async function GET(request: NextRequest) {
  // Verify diagnostic key
  const headerKey = request.headers.get("x-opsiq-diagnostic-key");
  if (!DIAGNOSTIC_KEY || headerKey !== DIAGNOSTIC_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Check env presence
    const databaseUrlPresent = !!process.env.DATABASE_URL;
    const authSecretPresent = !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET;

    // Check user
    let userFound = false;
    let passwordHashPresent = false;
    let passwordMatch = false;
    let workspaceMembershipFound = false;
    let workspaceFound = false;
    let role = null;

    if (databaseUrlPresent) {
      const user = await db.user.findUnique({
        where: { email: DEMO_EMAIL },
        select: {
          id: true,
          hashedPassword: true,
          isActive: true,
        },
      });

      userFound = !!user;
      passwordHashPresent = !!user?.hashedPassword;

      if (user?.hashedPassword) {
        passwordMatch = await bcrypt.compare(DEMO_PASSWORD, user.hashedPassword);
      }

      if (user) {
        const membership = await db.workspaceMembership.findFirst({
          where: { userId: user.id, isActive: true },
          select: { id: true, role: true, workspaceId: true },
        });

        workspaceMembershipFound = !!membership;
        role = membership?.role || null;

        if (membership) {
          const workspace = await db.workspace.findUnique({
            where: { id: membership.workspaceId },
          });
          workspaceFound = !!workspace;
        }
      }
    }

    // Classify
    let classification = "unknown";
    if (!databaseUrlPresent) {
      classification = "database_url_missing";
    } else if (!userFound) {
      classification = "user_not_found";
    } else if (!passwordHashPresent) {
      classification = "password_hash_missing";
    } else if (!passwordMatch) {
      classification = "password_mismatch";
    } else if (!workspaceMembershipFound) {
      classification = "workspace_membership_missing";
    } else if (!workspaceFound) {
      classification = "workspace_not_found";
    } else {
      classification = "all_prerequisites_ok";
    }

    return Response.json({
      databaseUrlPresent,
      authSecretPresent,
      userFound,
      passwordHashPresent,
      passwordMatch,
      workspaceMembershipFound,
      workspaceFound,
      role,
      classification,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        databaseUrlPresent: !!process.env.DATABASE_URL,
        authSecretPresent: !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET,
        classification: "diagnostic_failed",
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
