import type { CapabilityName } from "@/domain/constants/capabilities";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES, ROLE_HIERARCHY, type RoleName, isClientRole } from "@/domain/constants/roles";
import { ForbiddenError } from "@/infra/errors";

// ─── Role → Capability Mapping ─────────────────────────────────────────────

const ROLE_CAPABILITIES: Record<RoleName, readonly CapabilityName[]> = {
  [ROLES.SYSTEM_ADMIN]: Object.values(CAPABILITIES),

  [ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
    CAPABILITIES.USER_VIEW,
    CAPABILITIES.USER_CREATE,
    CAPABILITIES.USER_UPDATE,
    CAPABILITIES.USER_ASSIGN_ROLE,
    CAPABILITIES.LEAD_CREATE,
    CAPABILITIES.LEAD_UPDATE,
    CAPABILITIES.LEAD_VIEW,
    CAPABILITIES.CLIENT_CREATE,
    CAPABILITIES.CLIENT_UPDATE,
    CAPABILITIES.CLIENT_VIEW,
    CAPABILITIES.CLIENT_ARCHIVE,
    CAPABILITIES.ENGAGEMENT_CREATE,
    CAPABILITIES.ENGAGEMENT_UPDATE,
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
    CAPABILITIES.ENGAGEMENT_CLOSE,
    CAPABILITIES.STAGE_CREATE,
    CAPABILITIES.STAGE_TRANSITION,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.STAGE_RESOLVE_SOFT_BLOCKER,
    CAPABILITIES.EVIDENCE_SUBMIT,
    CAPABILITIES.EVIDENCE_VALIDATE,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_CREATE,
    CAPABILITIES.FINDING_UPDATE,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.FINDING_VALIDATE,
    CAPABILITIES.RECOMMENDATION_CREATE,
    CAPABILITIES.RECOMMENDATION_APPROVE,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.DECISION_CLOSE,
    CAPABILITIES.ACTION_CREATE,
    CAPABILITIES.ACTION_UPDATE,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_DEFINE,
    CAPABILITIES.KPI_RECORD,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_CREATE,
    CAPABILITIES.DELIVERABLE_SUBMIT_VERSION,
    CAPABILITIES.DELIVERABLE_APPROVE,
    CAPABILITIES.DELIVERABLE_ISSUE,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.APPROVAL_REQUEST,
    CAPABILITIES.APPROVAL_DECIDE,
    CAPABILITIES.OVERRIDE_REQUEST,
    CAPABILITIES.OVERRIDE_DECIDE,
    CAPABILITIES.CONDITION_ASSESS,
    CAPABILITIES.CONDITION_VIEW,
    CAPABILITIES.INTERVENTION_MANAGE,
    CAPABILITIES.INTERVENTION_VIEW,
    CAPABILITIES.RISK_MANAGE,
    CAPABILITIES.RISK_VIEW,
    CAPABILITIES.SCOPE_MANAGE,
    CAPABILITIES.SCOPE_VIEW,
    CAPABILITIES.REVIEW_MANAGE,
    CAPABILITIES.REVIEW_VIEW,
    CAPABILITIES.FILE_UPLOAD,
    CAPABILITIES.FILE_VIEW,
    CAPABILITIES.FILE_DELETE,
    CAPABILITIES.OWNER_VIEW,
    CAPABILITIES.OWNER_MANAGE,
    CAPABILITIES.OWNER_ONBOARD,
    CAPABILITIES.SOP_MANAGE,
  ],

  [ROLES.EXPERIENCED_CONSULTANT]: [
    CAPABILITIES.USER_VIEW,
    CAPABILITIES.LEAD_CREATE,
    CAPABILITIES.LEAD_UPDATE,
    CAPABILITIES.LEAD_VIEW,
    CAPABILITIES.CLIENT_VIEW,
    CAPABILITIES.CLIENT_UPDATE,
    CAPABILITIES.ENGAGEMENT_CREATE,
    CAPABILITIES.ENGAGEMENT_UPDATE,
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
    CAPABILITIES.STAGE_CREATE,
    CAPABILITIES.STAGE_TRANSITION,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.STAGE_RESOLVE_SOFT_BLOCKER,
    CAPABILITIES.EVIDENCE_SUBMIT,
    CAPABILITIES.EVIDENCE_VALIDATE,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_CREATE,
    CAPABILITIES.FINDING_UPDATE,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.FINDING_VALIDATE,
    CAPABILITIES.RECOMMENDATION_CREATE,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.ACTION_CREATE,
    CAPABILITIES.ACTION_UPDATE,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_DEFINE,
    CAPABILITIES.KPI_RECORD,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_CREATE,
    CAPABILITIES.DELIVERABLE_SUBMIT_VERSION,
    CAPABILITIES.DELIVERABLE_ISSUE,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.APPROVAL_REQUEST,
    CAPABILITIES.OVERRIDE_REQUEST,
    CAPABILITIES.CONDITION_ASSESS,
    CAPABILITIES.CONDITION_VIEW,
    CAPABILITIES.INTERVENTION_VIEW,
    CAPABILITIES.RISK_MANAGE,
    CAPABILITIES.RISK_VIEW,
    CAPABILITIES.SCOPE_VIEW,
    CAPABILITIES.REVIEW_VIEW,
    CAPABILITIES.FILE_UPLOAD,
    CAPABILITIES.FILE_VIEW,
  ],

  [ROLES.BEGINNER_CONSULTANT]: [
    CAPABILITIES.USER_VIEW,
    CAPABILITIES.LEAD_VIEW,
    CAPABILITIES.CLIENT_VIEW,
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.STAGE_TRANSITION,
    CAPABILITIES.EVIDENCE_SUBMIT,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_CREATE,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.ACTION_CREATE,
    CAPABILITIES.ACTION_UPDATE,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.DELIVERABLE_SUBMIT_VERSION,
    CAPABILITIES.CONDITION_VIEW,
    CAPABILITIES.INTERVENTION_VIEW,
    CAPABILITIES.RISK_VIEW,
    CAPABILITIES.SCOPE_VIEW,
    CAPABILITIES.REVIEW_VIEW,
    CAPABILITIES.FILE_UPLOAD,
    CAPABILITIES.FILE_VIEW,
  ],

  [ROLES.ANALYST]: [
    CAPABILITIES.USER_VIEW,
    CAPABILITIES.LEAD_VIEW,
    CAPABILITIES.CLIENT_VIEW,
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.EVIDENCE_SUBMIT,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.KPI_RECORD,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.CONDITION_VIEW,
    CAPABILITIES.RISK_VIEW,
    CAPABILITIES.FILE_UPLOAD,
    CAPABILITIES.FILE_VIEW,
  ],

  [ROLES.CLIENT_OWNER]: [
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.DELIVERABLE_APPROVE,
    CAPABILITIES.APPROVAL_DECIDE,
    CAPABILITIES.CONDITION_VIEW,
    CAPABILITIES.INTERVENTION_VIEW,
    CAPABILITIES.RISK_VIEW,
    CAPABILITIES.SCOPE_VIEW,
    CAPABILITIES.FILE_VIEW,
  ],

  [ROLES.CLIENT_TEAM_MEMBER]: [
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.EVIDENCE_VIEW,
    CAPABILITIES.FINDING_VIEW,
    CAPABILITIES.RECOMMENDATION_VIEW,
    CAPABILITIES.ACTION_VIEW,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_VIEW,
    CAPABILITIES.FILE_VIEW,
  ],

  [ROLES.VIEWER]: [
    CAPABILITIES.ENGAGEMENT_VIEW,
    CAPABILITIES.STAGE_VIEW,
    CAPABILITIES.KPI_VIEW,
    CAPABILITIES.DELIVERABLE_VIEW,
  ],

  // OpsIQ platform-operator surface (controlled-beta homepage capture).
  // Deliberately EXACTLY these two capabilities and nothing else — no
  // ENGAGEMENT_*/CLIENT_*/USER_* access, no OWNER_* Owner Mode access, no
  // SYSTEM_ADMIN. See ROLES.BETA_REQUEST_OPERATOR's own doc comment.
  [ROLES.BETA_REQUEST_OPERATOR]: [
    CAPABILITIES.BETA_REQUEST_REVIEW,
    CAPABILITIES.BETA_REQUEST_INVITE,
  ],

  // Administration V1 — a SEPARATE narrow platform-operator surface, not an
  // extension of BETA_REQUEST_OPERATOR's bundle above (which is left
  // byte-for-byte unchanged by this addition). No production identity holds
  // this role as of this change.
  [ROLES.ADMINISTRATION_OPERATOR]: [
    CAPABILITIES.BETA_PROGRAM_MANAGE,
    CAPABILITIES.CUSTOMER_ACCESS_MANAGE,
  ],
};

// ─── Self-serve owner scoping ───────────────────────────────────────────────
//
// POST /api/auth/signup is, today, the ONLY production-reachable path that
// creates a UserRoleAssignment (it always grants ADMIN_OR_PORTFOLIO_MANAGER)
// -- the admin-granted /api/users/[userId]/roles route requires a pre-existing
// system_admin, which nothing in production creates. That one role was
// designed to cover two distinct personas (a real consulting-firm admin/
// portfolio manager AND, via this same signup form, a self-serve SMB owner
// running their own business), so its full ~46-capability bundle includes
// consulting-firm-only capabilities (CLIENT_*, ENGAGEMENT_*, LEAD_*,
// DELIVERABLE_*, FINDING_*, USER_CREATE/UPDATE/ASSIGN_ROLE, etc.) that a
// self-serve owner has no legitimate use for -- their entire Owner Mode
// surface (home/cockpit, finance, customers, operations, cashflow, strategy,
// sales, marketing, inventory/vendors, risk/compliance, business setup,
// recovery) is gated solely by OWNER_VIEW/OWNER_MANAGE/OWNER_ONBOARD plus
// SOP_MANAGE, USER_VIEW (People page) and the file capabilities.
//
// signup also sets WorkspaceMembership.role = "owner" -- a value nothing else
// in production ever writes (verified: the only other production write path,
// employee-lifecycle.service.ts, never touches `role`; the other value seen
// anywhere, "admin", comes only from infra/seed.ts's dev/demo seeding). That
// makes it a safe, unambiguous, already-persisted discriminator: an
// ADMIN_OR_PORTFOLIO_MANAGER assignment on a workspace whose membership role
// is "owner" is provably a self-serve signup, and can be narrowed to this
// smaller bundle at derivation time with ZERO changes to any stored
// UserRoleAssignment row. A legitimately-provisioned portfolio manager (any
// future/internal-ops path that sets a WorkspaceMembership.role other than
// "owner") keeps the full bundle unchanged.
const OWNER_SCOPED_CAPABILITIES: readonly CapabilityName[] = [
  CAPABILITIES.USER_VIEW,
  CAPABILITIES.FILE_UPLOAD,
  CAPABILITIES.FILE_VIEW,
  CAPABILITIES.FILE_DELETE,
  CAPABILITIES.OWNER_VIEW,
  CAPABILITIES.OWNER_MANAGE,
  CAPABILITIES.OWNER_ONBOARD,
  CAPABILITIES.SOP_MANAGE,
];

/** The WorkspaceMembership.role value POST /api/auth/signup writes for every self-serve signup. */
const SELF_SERVE_OWNER_WORKSPACE_ROLE = "owner";

// ─── Internal-only capability guard ─────────────────────────────────────────

/** Capabilities that client roles must never access */
const INTERNAL_ONLY_CAPABILITIES: readonly CapabilityName[] = [
  CAPABILITIES.SYSTEM_ADMIN,
  CAPABILITIES.SYSTEM_VIEW_AUDIT,
  CAPABILITIES.USER_CREATE,
  CAPABILITIES.USER_UPDATE,
  CAPABILITIES.USER_DEACTIVATE,
  CAPABILITIES.USER_ASSIGN_ROLE,
  CAPABILITIES.LEAD_CREATE,
  CAPABILITIES.LEAD_UPDATE,
  CAPABILITIES.CLIENT_CREATE,
  CAPABILITIES.CLIENT_UPDATE,
  CAPABILITIES.CLIENT_ARCHIVE,
  CAPABILITIES.ENGAGEMENT_CREATE,
  CAPABILITIES.ENGAGEMENT_UPDATE,
  CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
  CAPABILITIES.ENGAGEMENT_CLOSE,
  CAPABILITIES.STAGE_CREATE,
  CAPABILITIES.EVIDENCE_VALIDATE,
  CAPABILITIES.FINDING_CREATE,
  CAPABILITIES.FINDING_UPDATE,
  CAPABILITIES.FINDING_VALIDATE,
  CAPABILITIES.RECOMMENDATION_CREATE,
  CAPABILITIES.RECOMMENDATION_APPROVE,
  CAPABILITIES.OVERRIDE_DECIDE,
  CAPABILITIES.CONDITION_ASSESS,
  CAPABILITIES.INTERVENTION_MANAGE,
  CAPABILITIES.RISK_MANAGE,
  CAPABILITIES.SCOPE_MANAGE,
  CAPABILITIES.REVIEW_MANAGE,
  CAPABILITIES.FILE_DELETE,
  CAPABILITIES.BETA_REQUEST_REVIEW,
  CAPABILITIES.BETA_REQUEST_INVITE,
  CAPABILITIES.BETA_PROGRAM_MANAGE,
  CAPABILITIES.CUSTOMER_ACCESS_MANAGE,
];

// ─── Policy Context ─────────────────────────────────────────────────────────

export interface PolicyContext {
  userId: string;
  roles: Array<{
    role: RoleName;
    scope?: string | null;
    scopeId?: string | null;
  }>;
  engagementMemberships?: Array<{
    engagementId: string;
    role: RoleName;
  }>;
  /**
   * The actor's WorkspaceMembership.role for the workspace this context was resolved
   * against (see services/auth.ts::getPolicyContext, which fetches it in the same query
   * that already verifies active membership). Used only to narrow
   * ADMIN_OR_PORTFOLIO_MANAGER to its self-serve-owner-safe subset -- see
   * OWNER_SCOPED_CAPABILITIES above. Undefined/null when no single-workspace context was
   * resolved (falls back to the role's full capability bundle).
   */
  workspaceRole?: string | null;
}

// ─── Capability Resolution ──────────────────────────────────────────────────

/**
 * Resolve a role's effective capability set. `workspaceRole` -- the caller's
 * WorkspaceMembership.role in the workspace this check is scoped to -- narrows
 * ADMIN_OR_PORTFOLIO_MANAGER down to OWNER_SCOPED_CAPABILITIES when it is a
 * self-serve signup ("owner"); any other role, or no workspace context at all,
 * gets the full bundle unchanged. This is the single authoritative place that
 * performs this narrowing -- do not duplicate it elsewhere.
 */
export function getCapabilitiesForRole(
  role: RoleName,
  workspaceRole?: string | null
): readonly CapabilityName[] {
  if (
    role === ROLES.ADMIN_OR_PORTFOLIO_MANAGER &&
    workspaceRole === SELF_SERVE_OWNER_WORKSPACE_ROLE
  ) {
    return OWNER_SCOPED_CAPABILITIES;
  }
  return ROLE_CAPABILITIES[role] ?? [];
}

export function hasCapability(
  ctx: PolicyContext,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): boolean {
  // Check global role assignments
  for (const assignment of ctx.roles) {
    const caps = getCapabilitiesForRole(assignment.role, ctx.workspaceRole);
    if (!caps) continue;
    if (!caps.includes(capability)) continue;

    // Enforce internal-only guard: client roles cannot access internal capabilities
    if (isClientRole(assignment.role) && INTERNAL_ONLY_CAPABILITIES.includes(capability)) {
      continue;
    }

    if (!scope) return true;
    if (!assignment.scope) return true;
    if (assignment.scope === scope.type && assignment.scopeId === scope.id) {
      return true;
    }
  }

  // Check engagement memberships for engagement-scoped capabilities
  if (scope?.type === "engagement" && ctx.engagementMemberships) {
    for (const membership of ctx.engagementMemberships) {
      if (membership.engagementId !== scope.id) continue;
      const caps = ROLE_CAPABILITIES[membership.role];
      if (!caps) continue;
      if (!caps.includes(capability)) continue;
      if (isClientRole(membership.role) && INTERNAL_ONLY_CAPABILITIES.includes(capability)) {
        continue;
      }
      return true;
    }
  }

  return false;
}

export function requireCapability(
  ctx: PolicyContext,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): void {
  if (!hasCapability(ctx, capability, scope)) {
    throw new ForbiddenError(
      `Missing required capability: ${capability}`
    );
  }
}

export function highestRole(ctx: PolicyContext): RoleName | null {
  let highest: RoleName | null = null;
  let highestLevel = -1;

  for (const assignment of ctx.roles) {
    const level = ROLE_HIERARCHY[assignment.role] ?? 0;
    if (level > highestLevel) {
      highestLevel = level;
      highest = assignment.role;
    }
  }

  return highest;
}

/**
 * Numeric hierarchy level of the actor's highest role (−1 when the actor has no role). Lives here — beside
 * `highestRole` / `ROLE_HIERARCHY` — so canonical routes can read role hierarchy WITHOUT importing the legacy
 * `@/lib/auth-guard` module (which the strict-auth governance rule forbids in canonical routes).
 */
export function getActorHierarchyLevel(ctx: PolicyContext): number {
  const role = highestRole(ctx);
  if (!role) return -1;
  return ROLE_HIERARCHY[role] ?? 0;
}

/** Check if a context has any internal (non-client) role */
export function hasInternalAccess(ctx: PolicyContext): boolean {
  return ctx.roles.some((r) => !isClientRole(r.role));
}

/**
 * The single authoritative check for "is this actor a self-serve owner" (F2/F4). Deliberately NOT
 * `ctx.workspaceRole === "owner"` directly — that string is an internal signup-time implementation
 * detail (see `SELF_SERVE_OWNER_WORKSPACE_ROLE` above), and duplicating it as a second check
 * elsewhere is exactly the drift `getCapabilitiesForRole`'s own doc comment warns against. Instead
 * this reads the SAME resolved capability set every other check in this file reads: a self-serve
 * owner holds `OWNER_VIEW` (the narrowed `OWNER_SCOPED_CAPABILITIES` bundle always includes it) but
 * never `ENGAGEMENT_CREATE` (an `INTERNAL_ONLY_CAPABILITIES` entry the narrowing strips, and the full
 * consultant/admin bundle always carries) — so a consultant or admin who also happens to hold
 * `OWNER_VIEW` is correctly excluded. Used to route owner-only first-run UI (dashboard's
 * "Run your first diagnosis" CTA, the root `/` redirect) without re-deriving role logic in a page or
 * component.
 */
export function isSelfServeOwnerContext(ctx: PolicyContext): boolean {
  return hasCapability(ctx, CAPABILITIES.OWNER_VIEW) && !hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE);
}
