import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcement } from "@/lib/enforced-route";

/**
 * SECURITY: This endpoint is DISABLED.
 *
 * CRITICAL VULNERABILITY: This route previously allowed unauthenticated users to:
 * - Submit decisions to any workspace by slug
 * - Create new user accounts and auto-join workspaces
 * - Bypass all authentication and authorization controls
 * - Corrupt data across multi-tenant boundaries
 *
 * STATUS: Endpoint permanently disabled (2026-05-02).
 *
 * If legitimate external decision submission is required, reimplement with:
 * - API key authentication (via headers, not request body)
 * - Workspace mapped from API key, not from request
 * - System actor for decision creation (no user auto-creation)
 * - Signature verification or HMAC authentication
 * - Rate limiting and abuse detection
 * - Audit trail of all submissions
 *
 * See: AUTH_ADVERSARIAL_REPORT.md - CRITICAL VULN #1
 */

export const POST = withEnforcement(async () => {
  throw new Error("Endpoint disabled");
});

export const GET = withEnforcement(async () => {
  throw new Error("Endpoint disabled");
});
