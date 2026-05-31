import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { BadRequestError } from "@/infra/errors";
import * as bcrypt from "bcryptjs";

/**
 * GET /api/internal/signup-proof
 * Diagnostic endpoint for signup path health check
 * Tests database connectivity and bcrypt without mutations
 *
 * Returns:
 * {
 *   validation_ok: boolean,
 *   user_table_accessible: boolean,
 *   workspace_table_accessible: boolean,
 *   membership_table_accessible: boolean,
 *   session_table_accessible: boolean,
 *   audit_table_accessible: boolean,
 *   bcrypt_ok: boolean,
 *   first_failing_step: string | null,
 *   error_name: string | null,
 *   safe_error_message: string | null
 * }
 */

export const GET = async (request: NextRequest) => {
  const result = {
    validation_ok: false,
    user_table_accessible: false,
    workspace_table_accessible: false,
    membership_table_accessible: false,
    session_table_accessible: false,
    audit_table_accessible: false,
    bcrypt_ok: false,
    first_failing_step: null as string | null,
    error_name: null as string | null,
    safe_error_message: null as string | null,
  };

  try {
    // STEP 1: Validation check (non-DB)
    try {
      const testEmail = "diagnostic@test.local";
      const testPassword = "TestPassword123";
      const testWorkspace = "Diagnostic";

      if (!testEmail || !testPassword || !testWorkspace) {
        throw new Error("Validation failed");
      }
      if (testPassword.length < 8) {
        throw new Error("Password too short");
      }
      result.validation_ok = true;
    } catch (e) {
      result.first_failing_step = "validation";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Validation failed";
      return Response.json(result, { status: 200 });
    }

    // STEP 2: User table accessibility
    try {
      const count = await db.user.count();
      result.user_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "user_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "User table not accessible";
      return Response.json(result, { status: 200 });
    }

    // STEP 3: Workspace table accessibility
    try {
      const count = await db.workspace.count();
      result.workspace_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "workspace_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Workspace table not accessible";
      return Response.json(result, { status: 200 });
    }

    // STEP 4: WorkspaceMembership table accessibility
    try {
      const count = await db.workspaceMembership.count();
      result.membership_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "membership_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Membership table not accessible";
      return Response.json(result, { status: 200 });
    }

    // STEP 5: Session table accessibility
    try {
      const count = await db.session.count();
      result.session_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "session_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Session table not accessible";
      return Response.json(result, { status: 200 });
    }

    // STEP 6: Audit table accessibility (if exists)
    try {
      const count = await db.auditLog.count();
      result.audit_table_accessible = true;
    } catch (e) {
      // Audit table may not exist, not critical
      result.audit_table_accessible = false;
    }

    // STEP 7: Bcrypt functionality
    try {
      const testPassword = "TestPassword123";
      const hash = await bcrypt.hash(testPassword, 10);
      const verify = await bcrypt.compare(testPassword, hash);
      if (!verify) {
        throw new Error("Bcrypt verification failed");
      }
      result.bcrypt_ok = true;
    } catch (e) {
      result.first_failing_step = "bcrypt_hash";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Bcrypt failed";
      return Response.json(result, { status: 200 });
    }

    // All checks passed
    return Response.json(result, { status: 200 });
  } catch (error) {
    result.first_failing_step = "unhandled_error";
    result.error_name = error instanceof Error ? error.name : "UnknownError";
    result.safe_error_message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(result, { status: 200 });
  }
};
