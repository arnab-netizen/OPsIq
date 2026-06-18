/**
 * Owner Mode Autonomy/Access-Level Classification Policy
 *
 * Deterministic policy layer that classifies what each autonomy and access
 * level permits, and enforces that OpsIQ never acts autonomously.
 *
 * Execution.md Phase 3: Autonomy/Access-Level Classification.
 */

import {
  AutonomyLevel,
  AccessLevel,
  ownerModeCapabilityRegistry,
  type OwnerModeCapability,
} from "./capability-registry";

// ─── Policy: what each autonomy level permits ────────────────────────────────

export interface AutonomyPolicy {
  level: AutonomyLevel;
  may_read: boolean;
  may_write_internal: boolean;
  may_draft: boolean;
  may_act_on_owner_approval: boolean;
  may_execute_autonomously: boolean;
  may_act_external: boolean;
  description: string;
}

export const AUTONOMY_POLICIES: Readonly<Record<AutonomyLevel, AutonomyPolicy>> =
  {
    observe_only: {
      level: "observe_only",
      may_read: true,
      may_write_internal: false,
      may_draft: false,
      may_act_on_owner_approval: false,
      may_execute_autonomously: false,
      may_act_external: false,
      description:
        "System may read and present information only. No writes, no drafts, no actions.",
    },
    advise_only: {
      level: "advise_only",
      may_read: true,
      may_write_internal: true,
      may_draft: true,
      may_act_on_owner_approval: false,
      may_execute_autonomously: false,
      may_act_external: false,
      description:
        "System may read, write advisory records, and draft outputs. Owner must act.",
    },
    draft_action: {
      level: "draft_action",
      may_read: true,
      may_write_internal: true,
      may_draft: true,
      may_act_on_owner_approval: false,
      may_execute_autonomously: false,
      may_act_external: false,
      description:
        "System may draft action plans for owner review. No execution without explicit approval.",
    },
    act_with_owner_approval: {
      level: "act_with_owner_approval",
      may_read: true,
      may_write_internal: true,
      may_draft: true,
      may_act_on_owner_approval: true,
      may_execute_autonomously: false,
      may_act_external: false,
      description:
        "System may execute internal tracking actions only after owner explicitly approves. Never external.",
    },
    autonomous_action_prohibited: {
      level: "autonomous_action_prohibited",
      may_read: false,
      may_write_internal: false,
      may_draft: false,
      may_act_on_owner_approval: false,
      may_execute_autonomously: false,
      may_act_external: false,
      description:
        "All autonomous action by this capability is categorically prohibited.",
    },
  };

// ─── Policy: what each access level permits ──────────────────────────────────

export interface AccessPolicy {
  level: AccessLevel;
  may_read: boolean;
  may_write_internal: boolean;
  may_write_owner_approved: boolean;
  may_write_external: boolean;
  description: string;
}

export const ACCESS_POLICIES: Readonly<Record<AccessLevel, AccessPolicy>> = {
  read_only: {
    level: "read_only",
    may_read: true,
    may_write_internal: false,
    may_write_owner_approved: false,
    may_write_external: false,
    description: "Read operations only. No writes of any kind permitted.",
  },
  write_internal_tracking_only: {
    level: "write_internal_tracking_only",
    may_read: true,
    may_write_internal: true,
    may_write_owner_approved: false,
    may_write_external: false,
    description:
      "May write internal tracking records (advisory, status, logs). No external writes.",
  },
  write_owner_approved_internal_action: {
    level: "write_owner_approved_internal_action",
    may_read: true,
    may_write_internal: true,
    may_write_owner_approved: true,
    may_write_external: false,
    description:
      "May write internal action records after owner approval. External writes remain prohibited.",
  },
  external_action_prohibited: {
    level: "external_action_prohibited",
    may_read: false,
    may_write_internal: false,
    may_write_owner_approved: false,
    may_write_external: false,
    description:
      "All external actions are categorically prohibited. No reads or writes.",
  },
};

// ─── Enforcement functions ────────────────────────────────────────────────────

/**
 * Returns true if a capability may execute an internal action.
 * Requires both owner approval AND act_with_owner_approval autonomy level.
 */
export function canExecuteInternalAction(cap: OwnerModeCapability): boolean {
  const autonomyPolicy = AUTONOMY_POLICIES[cap.autonomy_level];
  const accessPolicy = ACCESS_POLICIES[cap.access_level];
  return (
    autonomyPolicy.may_act_on_owner_approval &&
    accessPolicy.may_write_owner_approved &&
    cap.owner_approval_required
  );
}

/**
 * Returns true if a capability may execute autonomously (without owner approval).
 * This must always return false for all registered capabilities — it is a hard invariant.
 */
export function canExecuteAutonomously(cap: OwnerModeCapability): boolean {
  return AUTONOMY_POLICIES[cap.autonomy_level].may_execute_autonomously;
}

/**
 * Returns true if a capability may perform external actions.
 * This must always return false for all registered capabilities — hard invariant.
 */
export function canActExternal(cap: OwnerModeCapability): boolean {
  return (
    AUTONOMY_POLICIES[cap.autonomy_level].may_act_external ||
    ACCESS_POLICIES[cap.access_level].may_write_external
  );
}

/**
 * Validates that a proposed capability satisfies Phase 3 hard rules.
 * Returns an array of violation strings (empty = valid).
 */
export function validateCapabilityAutonomyConstraints(
  cap: OwnerModeCapability
): string[] {
  const violations: string[] = [];

  if (canExecuteAutonomously(cap)) {
    violations.push(
      `${cap.id}: autonomy_level '${cap.autonomy_level}' permits autonomous execution — PROHIBITED`
    );
  }

  if (canActExternal(cap)) {
    violations.push(
      `${cap.id}: access_level '${cap.access_level}' or autonomy_level permits external action — PROHIBITED`
    );
  }

  if (
    cap.autonomy_level === "act_with_owner_approval" &&
    !cap.owner_approval_required
  ) {
    violations.push(
      `${cap.id}: autonomy 'act_with_owner_approval' requires owner_approval_required = true`
    );
  }

  if (
    cap.access_level === "write_owner_approved_internal_action" &&
    !cap.owner_approval_required
  ) {
    violations.push(
      `${cap.id}: access 'write_owner_approved_internal_action' requires owner_approval_required = true`
    );
  }

  return violations;
}

/**
 * Validates all registered capabilities against Phase 3 constraints.
 * Returns a map of capabilityId → violation list. Empty inner array = valid.
 */
export function auditRegistryAutonomyConstraints(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const cap of ownerModeCapabilityRegistry) {
    result.set(cap.id, validateCapabilityAutonomyConstraints(cap));
  }
  return result;
}

/**
 * Returns all capabilities that require owner approval before any state change.
 * These are the only capabilities that may write to owner-approved action records.
 */
export function getApprovalGatedCapabilities(): ReadonlyArray<OwnerModeCapability> {
  return ownerModeCapabilityRegistry.filter(
    (c) => c.autonomy_level === "act_with_owner_approval"
  );
}

/**
 * Returns all capabilities with external_action_prohibited access level.
 * Provided as an explicit allow-list proof — not a runtime gate.
 */
export function getExternallyProhibitedCapabilities(): ReadonlyArray<OwnerModeCapability> {
  return ownerModeCapabilityRegistry.filter(
    (c) => c.access_level === "external_action_prohibited"
  );
}

// ─── Phase 3 hard-rule assertions ────────────────────────────────────────────

/**
 * Throws if any registered capability violates Phase 3 autonomy constraints.
 * Called at module load time in test environments to catch regressions.
 */
export function assertPhase3Invariants(): void {
  const audit = auditRegistryAutonomyConstraints();
  const allViolations: string[] = [];
  for (const [, violations] of audit) {
    allViolations.push(...violations);
  }
  if (allViolations.length > 0) {
    throw new Error(
      `Phase 3 autonomy constraint violations:\n${allViolations.join("\n")}`
    );
  }
}
