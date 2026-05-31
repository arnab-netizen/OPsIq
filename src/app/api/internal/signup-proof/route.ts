import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BadRequestError } from "@/infra/errors";
import * as bcrypt from "bcryptjs";

/**
 * GET /api/internal/signup-proof
 * Diagnostic endpoint for signup path health check
 * Tests database connectivity and bcrypt without mutations
 * Protected by OPSIQ_DIAGNOSTIC_KEY
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
  // Verify diagnostic key
  const providedKey =
    request.headers.get("x-opsiq-diagnostic-key") ||
    new URL(request.url).searchParams.get("key");

  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 404 }
    );
  }
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
    classification: "unknown" as string,
  };

  // Helper to classify the failure
  const classify = (failingStep: string, errorName: string): string => {
    if (!failingStep) return "all_systems_ok";
    if (failingStep === "validation") return "client_error";
    if (failingStep.includes("table_access"))
      return "database_unreachable";
    if (failingStep === "bcrypt_hash") return "bcrypt_failure";
    return "unknown_failure";
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
      result.classification = "client_error";
      return NextResponse.json(result, { status: 200 });
    }

    // STEP 2: User table accessibility
    try {
      const count = await db.user.count();
      result.user_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "user_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "User table not accessible";
      result.classification = "database_unreachable";
      return NextResponse.json(result, { status: 200 });
    }

    // STEP 3: Workspace table accessibility
    try {
      const count = await db.workspace.count();
      result.workspace_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "workspace_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Workspace table not accessible";
      result.classification = "database_unreachable";
      return NextResponse.json(result, { status: 200 });
    }

    // STEP 4: WorkspaceMembership table accessibility
    try {
      const count = await db.workspaceMembership.count();
      result.membership_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "membership_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Membership table not accessible";
      result.classification = "database_unreachable";
      return NextResponse.json(result, { status: 200 });
    }

    // STEP 5: Session table accessibility
    try {
      const count = await db.session.count();
      result.session_table_accessible = true;
    } catch (e) {
      result.first_failing_step = "session_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Session table not accessible";
      result.classification = "database_unreachable";
      return NextResponse.json(result, { status: 200 });
    }

    // STEP 6: Audit table accessibility
    try {
      const count = await db.auditEvent.count();
      result.audit_table_accessible = true;
    } catch (e) {
      result.audit_table_accessible = false;
      result.first_failing_step = "audit_table_access";
      result.error_name = e instanceof Error ? e.name : "UnknownError";
      result.safe_error_message = e instanceof Error ? e.message : "Audit table not accessible";
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
      result.classification = "bcrypt_failure";
      return NextResponse.json(result, { status: 200 });
    }

    // All checks passed - adjust classification if audit is unavailable
    if (result.first_failing_step === "audit_table_access") {
      result.classification = "audit_unavailable";
    } else if (!result.first_failing_step) {
      result.classification = "all_systems_ok";
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    result.first_failing_step = "unhandled_error";
    result.error_name = error instanceof Error ? error.name : "UnknownError";
    result.safe_error_message = error instanceof Error ? error.message : "Unknown error";
    result.classification = classify(result.first_failing_step, result.error_name);
    return NextResponse.json(result, { status: 200 });
  }
};
