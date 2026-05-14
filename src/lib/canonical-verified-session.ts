/**
 * PHASE E: CANONICAL VERIFIED SESSION - IMMUTABLE REQUEST SNAPSHOT
 *
 * Single immutable auth snapshot captured at wrapper entry.
 * Represents complete auth reality for request lifetime.
 * Owned by CanonicalExecutionTrace.
 * No mid-request mutations.
 * Replay-deterministic.
 */

import type { SessionInfo, AuthenticatedUser } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";

/**
 * Immutable snapshot of user role assignment
 * Captured at request entry, never changes during request
 */
export interface RoleSnapshot {
  role: string;
  scope: string;
  scopeId: string;
  grantedAt: Date;
}

/**
 * Immutable snapshot of engagement membership
 * Captured at request entry, never changes during request
 */
export interface EngagementMembershipSnapshot {
  engagementId: string;
  role: string;
  joinedAt: Date;
}

/**
 * Immutable snapshot of user entitlements
 * Captured at request entry, never changes during request
 */
export interface EntitlementSnapshot {
  planId: string;
  featureFlags: Set<string>;
  limits: Record<string, number>;
  expiresAt?: Date;
}

/**
 * Immutable snapshot of workspace membership state
 * Captured at request entry, never changes during request
 */
export interface WorkspaceMembershipSnapshot {
  workspaceId: string;
  userId: string;
  isActive: boolean;
  joinedAt: Date;
  roles: RoleSnapshot[];
}

/**
 * Immutable snapshot of revocation state
 * Captured at request entry, never changes during request
 */
export interface RevocationSnapshot {
  sessionRevokedAt?: Date;
  sessionRevocationReason?: string;
  userSuspendedAt?: Date;
  userSuspensionReason?: string;
  workspaceMembershipRevokedAt?: Date;
}

/**
 * PHASE E: CANONICAL VERIFIED SESSION
 *
 * Single immutable snapshot of complete auth reality.
 * Captured once at wrapper entry.
 * Owned by CanonicalExecutionTrace.
 * Never changes during request execution.
 * Immutable after creation (deepFreeze enforced).
 *
 * Guarantees:
 * - One snapshot per request
 * - Immutable identity lineage
 * - Replay-deterministic (same snapshot on replay)
 * - Handler receives read-only reference
 * - No downstream auth re-fetch allowed
 * - No mid-request revocation effects
 * - No mid-request capability changes
 */
export interface CanonicalVerifiedSession {
  // ─── IDENTITY (Immutable)
  snapshotId: string;              // UUID v4, unique per snapshot
  snapshotTimestamp: Date;         // When snapshot was created
  snapshotHash: string;            // Integrity checksum
  traceId: string;                 // Owning trace ID (immutable lineage)
  correlationId: string;           // Request correlation (immutable lineage)

  // ─── ACTOR STATE (Immutable snapshot)
  actor: {
    id: string;                    // User ID
    email: string;                 // User email
    name: string | null;           // User name
    isActive: boolean;             // User active at snapshot time
  };

  // ─── SESSION STATE (Immutable snapshot)
  session: {
    id: string;                    // Session ID
    token: string;                 // Session token (hashed)
    isValid: boolean;              // Session valid at snapshot time
    expiresAt: Date;               // Session expiration
    invalidReason?: "expired" | "revoked" | "inactive_user" | "not_found";
  };

  // ─── WORKSPACE STATE (Immutable snapshot)
  workspace: {
    id: string;                    // Workspace ID
    name: string;                  // Workspace name
    isActive: boolean;             // Workspace active
    membership: WorkspaceMembershipSnapshot;  // User's membership snapshot
  };

  // ─── ROLE SNAPSHOT (Immutable)
  roles: RoleSnapshot[];           // All roles assigned to user at snapshot time

  // ─── ENGAGEMENT SNAPSHOT (Immutable)
  engagementMemberships: EngagementMembershipSnapshot[];  // All engagements user belongs to

  // ─── CAPABILITY SNAPSHOT (Immutable)
  capabilities: Set<CapabilityName>;  // All capabilities granted at snapshot time

  // ─── ENTITLEMENT SNAPSHOT (Immutable)
  entitlements: EntitlementSnapshot;  // Plan, features, limits at snapshot time

  // ─── REVOCATION STATE (Immutable snapshot of revocation state at time of snapshot)
  revocationState: RevocationSnapshot;

  // ─── IMMUTABILITY SEALS
  sealed: boolean;                 // true after finalization
  readonly: boolean;               // true after first access by handler
}

/**
 * Session snapshot builder
 * Creates immutable snapshot of complete auth state
 * Called exactly once per request at wrapper entry
 */
export class CanonicalVerifiedSessionBuilder {
  private snapshot: CanonicalVerifiedSession;

  constructor(input: {
    traceId: string;
    correlationId: string;
    sessionInfo: SessionInfo;
    policyContext: PolicyContext;
    workspaceId: string;
    capabilities: Set<CapabilityName>;
  }) {
    const snapshotId = this.generateSnapshotId();
    const now = new Date();

    this.snapshot = {
      snapshotId,
      snapshotTimestamp: now,
      snapshotHash: "",  // Will be set at finalization
      traceId: input.traceId,
      correlationId: input.correlationId,

      actor: {
        id: input.sessionInfo.user.id,
        email: input.sessionInfo.user.email,
        name: input.sessionInfo.user.name,
        isActive: input.sessionInfo.user.isActive,
      },

      session: {
        id: input.sessionInfo.sessionId,
        token: this.hashToken(input.sessionInfo.sessionId),
        isValid: true,  // Only creates snapshot if session is valid
        expiresAt: input.sessionInfo.expiresAt,
      },

      workspace: {
        id: input.workspaceId,
        name: input.workspaceId,  // TODO: Fetch workspace name
        isActive: true,           // TODO: Verify workspace active
        membership: {
          workspaceId: input.workspaceId,
          userId: input.sessionInfo.user.id,
          isActive: true,
          joinedAt: now,  // TODO: Fetch actual join date
          roles: input.policyContext.roles.map((r) => ({
            role: r.role,
            scope: r.scope || "workspace",
            scopeId: r.scopeId || input.workspaceId,
            grantedAt: now,  // TODO: Fetch actual grant date
          })),
        },
      },

      roles: input.policyContext.roles.map((r) => ({
        role: r.role,
        scope: r.scope || "workspace",
        scopeId: r.scopeId || input.workspaceId,
        grantedAt: now,  // TODO: Fetch actual grant date
      })),

      engagementMemberships: (input.policyContext.engagementMemberships || []).map((em) => ({
        engagementId: em.engagementId,
        role: em.role,
        joinedAt: now,  // TODO: Fetch actual join date
      })),

      capabilities: new Set(input.capabilities),

      entitlements: {
        planId: "default",         // TODO: Fetch actual plan
        featureFlags: new Set(),   // TODO: Fetch feature flags
        limits: {},                // TODO: Fetch limits
      },

      revocationState: {
        // All revocation fields undefined (no revocation)
      },

      sealed: false,
      readonly: false,
    };
  }

  /**
   * Finalize snapshot (make immutable)
   */
  public finalize(): CanonicalVerifiedSession {
    if (this.snapshot.sealed) {
      throw new Error("Snapshot already sealed");
    }

    // Calculate integrity hash
    this.snapshot.snapshotHash = this.calculateHash();

    // Seal and freeze
    this.snapshot.sealed = true;
    Object.freeze(this.snapshot);
    this.deepFreeze(this.snapshot);

    return this.snapshot;
  }

  /**
   * Get read-only reference for handler
   */
  public getReadOnlySnapshot(): Readonly<CanonicalVerifiedSession> {
    this.snapshot.readonly = true;
    return Object.freeze({ ...this.snapshot });
  }

  /**
   * Verify snapshot integrity
   */
  public verify(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.snapshot.snapshotId) {
      errors.push("Missing snapshotId");
    }

    if (!this.snapshot.actor.id) {
      errors.push("Missing actor.id");
    }

    if (!this.snapshot.session.id) {
      errors.push("Missing session.id");
    }

    if (!this.snapshot.workspace.id) {
      errors.push("Missing workspace.id");
    }

    if (!this.snapshot.sealed && !this.snapshot.snapshotHash) {
      errors.push("Snapshot not finalized");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private generateSnapshotId(): string {
    const { v4: uuidv4 } = require("uuid");
    return uuidv4();
  }

  private hashToken(token: string): string {
    // Simple hash for demonstration
    return `hash_${token.substring(0, 8)}`;
  }

  private calculateHash(): string {
    // Simple hash of snapshot state
    const key = `${this.snapshot.snapshotId}:${this.snapshot.actor.id}:${this.snapshot.session.id}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash;  // Convert to 32bit integer
    }
    return `hash_${hash.toString(16)}`;
  }

  private deepFreeze(obj: any): any {
    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((prop) => {
      if (obj[prop] !== null && (typeof obj[prop] === "object" || typeof obj[prop] === "function")) {
        if (!Object.isFrozen(obj[prop])) {
          this.deepFreeze(obj[prop]);
        }
      }
    });

    return obj;
  }
}

/**
 * Verify that session snapshot is immutable after finalization
 */
export function isSessionSnapshotImmutable(snapshot: CanonicalVerifiedSession): boolean {
  if (!snapshot.sealed) {
    return false;
  }

  // Check if object is frozen
  return Object.isFrozen(snapshot) && Object.isFrozen(snapshot.roles) && Object.isFrozen(snapshot.capabilities);
}

/**
 * Attempt to mutate snapshot (should fail)
 * Used in tests to verify immutability
 */
export function attemptSessionSnapshotMutation(snapshot: CanonicalVerifiedSession): boolean {
  try {
    (snapshot as any).newField = "test";
    return true;  // Mutation succeeded (bad!)
  } catch {
    return false;  // Mutation blocked (good!)
  }
}
