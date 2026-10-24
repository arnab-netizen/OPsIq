/**
 * Administration V1 — customer directory + access diagnostics.
 *
 * Read-only. Diagnostics calls the SAME authoritative predicates the real
 * routes use (canAdmitSignup, canSubmitBetaRequest, isBetaRequestInvited,
 * readEffectiveSettings/countCapacityUsage, and
 * getEmployeeAccessStatus for workspace access) — never a second,
 * independently-reimplemented copy of any rule, so this can never drift from
 * the real gates (design correction 10).
 *
 * Exposes only reliable, real facts: no secrets, no session tokens, no
 * fabricated/derived states beyond what User/Workspace/WorkspaceMembership/
 * BetaRequest/Session actually record.
 */
import { db } from "@/lib/db";
import { identityEmailSchema } from "@/lib/validation";
import { ValidationError } from "@/infra/errors";
import { isBetaRequestInvited, isInviteExpired } from "@/lib/beta";
import { canAdmitSignup, canSubmitBetaRequest } from "@/domain/beta/admission";
import { readEffectiveSettings, countCapacityUsage, hasSignupCapacity } from "@/services/beta/platform-settings.service";
import { getEmployeeAccessStatus } from "@/services/workspace/employee-lifecycle.service";
import { EmployeeAccessStatus, hasLiveAccess } from "@/domain/workspace/employee-lifecycle";

export interface CustomerSearchResult {
  userId: string | null;
  email: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceRole: string | null;
}

/** Search by email substring (users) or workspace-name substring (workspaces owned by matching users). Capability-gated at the route layer. */
export async function searchCustomers(query: string, limit = 25): Promise<CustomerSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cappedLimit = Math.min(Math.max(limit, 1), 100);

  const byEmail = await db.user.findMany({
    where: { email: { contains: trimmed, mode: "insensitive" } },
    take: cappedLimit,
    select: {
      id: true,
      email: true,
      workspaceMemberships: {
        where: { isActive: true },
        take: 1,
        select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
      },
    },
  });

  const byWorkspaceName = await db.workspace.findMany({
    where: { name: { contains: trimmed, mode: "insensitive" } },
    take: cappedLimit,
    select: {
      id: true,
      name: true,
      workspaceMemberships: {
        where: { isActive: true, role: "owner" },
        take: 1,
        select: { userId: true, role: true, user: { select: { email: true } } },
      },
    },
  });

  const results: CustomerSearchResult[] = [];
  const seen = new Set<string>();

  for (const u of byEmail) {
    const membership = u.workspaceMemberships[0];
    const key = `${u.id}:${membership?.workspaceId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      userId: u.id,
      email: u.email,
      workspaceId: membership?.workspaceId ?? null,
      workspaceName: membership?.workspace.name ?? null,
      workspaceRole: membership?.role ?? null,
    });
  }

  for (const w of byWorkspaceName) {
    const membership = w.workspaceMemberships[0];
    if (!membership) continue;
    const key = `${membership.userId}:${w.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      userId: membership.userId,
      email: membership.user.email,
      workspaceId: w.id,
      workspaceName: w.name,
      workspaceRole: membership.role,
    });
  }

  return results.slice(0, cappedLimit);
}

export interface CustomerDetail {
  email: string;
  betaRequest: {
    status: string;
    invitedAt: string | null;
    invitedExpired: boolean;
    revokedAt: string | null;
    rejectedAt: string | null;
    createdAt: string;
  } | null;
  user: {
    id: string;
    isActive: boolean;
    emailVerifiedAt: string | null;
    createdAt: string;
    activeSessionCount: number;
  } | null;
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceSignupSource: string | null;
    workspaceIsActive: boolean;
    role: string;
    isActive: boolean;
    accessStatus: EmployeeAccessStatus;
  }>;
}

/** Assembles only real, reliable facts for one customer, by their canonical (already-normalized) email. */
export async function getCustomerDetail(email: string): Promise<CustomerDetail> {
  const parsedEmail = identityEmailSchema.safeParse(email);
  if (!parsedEmail.success) throw new ValidationError("Invalid email");
  const normalizedEmail = parsedEmail.data;

  const betaRequestRow = await db.betaRequest.findUnique({
    where: { email: normalizedEmail },
    select: { status: true, invitedAt: true, revokedAt: true, rejectedAt: true, createdAt: true },
  });

  const userRow = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, isActive: true, emailVerifiedAt: true, createdAt: true },
  });

  let activeSessionCount = 0;
  let memberships: CustomerDetail["memberships"] = [];
  if (userRow) {
    activeSessionCount = await db.session.count({
      where: { userId: userRow.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    const membershipRows = await db.workspaceMembership.findMany({
      where: { userId: userRow.id },
      select: {
        workspaceId: true,
        role: true,
        isActive: true,
        workspace: { select: { name: true, signupSource: true, isActive: true } },
      },
    });

    memberships = await Promise.all(
      membershipRows.map(async (m: {
        workspaceId: string;
        role: string;
        isActive: boolean;
        workspace: { name: string; signupSource: string | null; isActive: boolean };
      }) => {
        const status = await getEmployeeAccessStatus(m.workspaceId, userRow.id);
        return {
          workspaceId: m.workspaceId,
          workspaceName: m.workspace.name,
          workspaceSignupSource: m.workspace.signupSource,
          workspaceIsActive: m.workspace.isActive,
          role: m.role,
          isActive: m.isActive,
          accessStatus: status,
        };
      })
    );
  }

  return {
    email: normalizedEmail,
    betaRequest: betaRequestRow
      ? {
          status: betaRequestRow.status,
          invitedAt: betaRequestRow.invitedAt ? betaRequestRow.invitedAt.toISOString() : null,
          invitedExpired: betaRequestRow.status === "INVITED" && !!betaRequestRow.invitedAt && isInviteExpired(betaRequestRow.invitedAt),
          revokedAt: betaRequestRow.revokedAt ? betaRequestRow.revokedAt.toISOString() : null,
          rejectedAt: betaRequestRow.rejectedAt ? betaRequestRow.rejectedAt.toISOString() : null,
          createdAt: betaRequestRow.createdAt.toISOString(),
        }
      : null,
    user: userRow
      ? {
          id: userRow.id,
          isActive: userRow.isActive,
          emailVerifiedAt: userRow.emailVerifiedAt ? userRow.emailVerifiedAt.toISOString() : null,
          createdAt: userRow.createdAt.toISOString(),
          activeSessionCount,
        }
      : null,
    memberships,
  };
}

export interface GateCheck {
  allowed: boolean;
  reason: string;
}

export interface AccessDiagnostics {
  email: string;
  canRequestBeta: GateCheck;
  canSignUp: GateCheck;
  canVerifyEmail: GateCheck;
  canSignIn: GateCheck;
  canAccessWorkspace: (GateCheck & { workspaceId: string }) | null;
}

/**
 * Answers "can request/signup/verify/signin/access [workspace]" using the
 * exact same functions the real routes call — never a reimplementation.
 * `requiresEmailVerification` mirrors login's real check
 * (src/app/api/auth/login/route.ts) exactly: `requiresEmailVerification &&
 * !emailVerifiedAt` blocks sign-in.
 */
export async function diagnoseAccess(email: string, workspaceId?: string): Promise<AccessDiagnostics> {
  const parsed = identityEmailSchema.safeParse(email);
  if (!parsed.success) throw new ValidationError("Invalid email");
  const normalizedEmail = parsed.data;

  const settings = await readEffectiveSettings();
  const canRequestBeta = canSubmitBetaRequest(settings.admissionMode);

  const isInvited = await isBetaRequestInvited(normalizedEmail);
  const hasCapacity = hasSignupCapacity(await countCapacityUsage(), settings.capacityLimit);
  const canSignUp = canAdmitSignup(settings.admissionMode, isInvited, hasCapacity);

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, isActive: true, emailVerifiedAt: true, requiresEmailVerification: true },
  });

  const canVerifyEmail = !!user && user.requiresEmailVerification && !user.emailVerifiedAt;
  const canSignIn = !!user && user.isActive && (!user.requiresEmailVerification || !!user.emailVerifiedAt);

  let canAccessWorkspace: AccessDiagnostics["canAccessWorkspace"] = null;
  if (workspaceId && user) {
    const status = await getEmployeeAccessStatus(workspaceId, user.id);
    canAccessWorkspace = { workspaceId, allowed: hasLiveAccess(status), reason: status };
  } else if (workspaceId && !user) {
    canAccessWorkspace = { workspaceId, allowed: false, reason: "NO_USER" };
  }

  return {
    email: normalizedEmail,
    canRequestBeta: { allowed: canRequestBeta, reason: settings.admissionMode },
    canSignUp: {
      allowed: canSignUp,
      reason: !canRequestBeta && settings.admissionMode !== "INVITE_ONLY"
        ? settings.admissionMode
        : !hasCapacity
          ? "capacity_reached"
          : settings.admissionMode === "INVITE_ONLY" && !isInvited
            ? "not_invited"
            : settings.admissionMode,
    },
    canVerifyEmail: { allowed: canVerifyEmail, reason: !user ? "NO_USER" : canVerifyEmail ? "PENDING_VERIFICATION" : "ALREADY_VERIFIED_OR_NOT_REQUIRED" },
    canSignIn: { allowed: canSignIn, reason: !user ? "NO_USER" : !user.isActive ? "INACTIVE" : canSignIn ? "OK" : "EMAIL_NOT_VERIFIED" },
    canAccessWorkspace,
  };
}
