import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import * as bcrypt from "bcryptjs";

const DEMO_EMAIL = "operator@demo.local";
const DEMO_PASSWORD = "demo-password-123";
const DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY;

export async function GET(request: NextRequest) {
  // Verify diagnostic key from query param (mobile-friendly)
  const { searchParams } = new URL(request.url);
  const queryKey = searchParams.get("key");
  const headerKey = request.headers.get("x-opsiq-diagnostic-key");

  const providedKey = queryKey || headerKey;
  if (!DIAGNOSTIC_KEY || providedKey !== DIAGNOSTIC_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Check env presence
    const databaseUrlPresent = !!process.env.DATABASE_URL;
    const authSecretPresent = !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET;

    // Validate DATABASE_URL structure before trying to connect
    let databaseUrlNonEmpty = false;
    let databaseUrlProtocolOk = false;
    let databaseUrlHostPresent = false;
    let databaseUrlDatabasePresent = false;
    let databaseUrlLooksPlaceholder = false;
    let databaseUrlParseOk = false;

    if (databaseUrlPresent) {
      const dbUrl = process.env.DATABASE_URL!.trim();
      databaseUrlNonEmpty = dbUrl.length > 0;

      // Check for obvious placeholders
      databaseUrlLooksPlaceholder =
        /REPLACE_|PLACEHOLDER|your_neon_url|example\.com|runner/.test(dbUrl);

      // Try to parse URL
      try {
        const parsed = new URL(dbUrl);
        databaseUrlProtocolOk =
          parsed.protocol === "postgresql:" || parsed.protocol === "postgres:";
        databaseUrlHostPresent = !!parsed.hostname;
        databaseUrlDatabasePresent = !!(parsed.pathname && parsed.pathname.length > 1);
        databaseUrlParseOk =
          databaseUrlProtocolOk &&
          databaseUrlHostPresent &&
          databaseUrlDatabasePresent &&
          !databaseUrlLooksPlaceholder;
      } catch {
        databaseUrlParseOk = false;
      }
    }

    // Check user
    let userFound = false;
    let passwordHashPresent = false;
    let passwordMatch = false;
    let workspaceMembershipFound = false;
    let workspaceFound = false;
    let role = null;

    if (databaseUrlPresent && databaseUrlParseOk) {
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
    let dbConnectionOk = databaseUrlParseOk; // Will be updated if DB ops succeed
    let classification = "unknown";

    if (!databaseUrlPresent) {
      classification = "database_url_missing";
    } else if (!databaseUrlNonEmpty) {
      classification = "database_url_empty";
    } else if (databaseUrlLooksPlaceholder) {
      classification = "database_url_placeholder";
    } else if (!databaseUrlParseOk) {
      classification = "database_url_malformed";
    } else if (!userFound) {
      classification = "user_not_found";
      dbConnectionOk = true; // URL was valid, DB connected, but user missing
    } else if (!passwordHashPresent) {
      classification = "password_hash_missing";
      dbConnectionOk = true;
    } else if (!passwordMatch) {
      classification = "password_mismatch";
      dbConnectionOk = true;
    } else if (!workspaceMembershipFound) {
      classification = "workspace_membership_missing";
      dbConnectionOk = true;
    } else if (!workspaceFound) {
      classification = "workspace_not_found";
      dbConnectionOk = true;
    } else {
      classification = "all_prerequisites_ok";
      dbConnectionOk = true;
    }

    return Response.json({
      databaseUrlPresent,
      databaseUrlNonEmpty,
      databaseUrlProtocolOk,
      databaseUrlHostPresent,
      databaseUrlDatabasePresent,
      databaseUrlLooksPlaceholder,
      databaseUrlParseOk,
      authSecretPresent,
      dbConnectionOk,
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

    // Try to parse DATABASE_URL for structure validation
    let databaseUrlParseOk = false;
    if (process.env.DATABASE_URL) {
      try {
        const parsed = new URL(process.env.DATABASE_URL);
        databaseUrlParseOk =
          (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") &&
          !!parsed.hostname &&
          !!(parsed.pathname && parsed.pathname.length > 1);
      } catch {
        databaseUrlParseOk = false;
      }
    }

    return Response.json(
      {
        databaseUrlPresent: !!process.env.DATABASE_URL,
        databaseUrlParseOk,
        authSecretPresent: !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET,
        dbConnectionOk: false,
        classification: databaseUrlParseOk ? "db_adapter_construction_failure" : "database_url_malformed",
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
