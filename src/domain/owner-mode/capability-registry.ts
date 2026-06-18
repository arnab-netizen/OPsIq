/**
 * Owner Mode Capability Registry
 *
 * Typed internal config — no DB, no UI, no AI services.
 * Defines what OpsIQ can do, who decides each action, and where AI is
 * categorically prohibited from deciding.
 *
 * Execution.md Phase 2: System Capability, Risk, and AI-Control Register.
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AutonomyLevel =
  | "observe_only"
  | "advise_only"
  | "draft_action"
  | "act_with_owner_approval"
  | "autonomous_action_prohibited";

export type AccessLevel =
  | "read_only"
  | "write_internal_tracking_only"
  | "write_owner_approved_internal_action"
  | "external_action_prohibited";

/** AI may only perform support-only roles — never decide or execute. */
export type AiAllowedRole =
  | "summarize"
  | "explain"
  | "challenge"
  | "suggest"
  | "draft"
  | "compare_options"
  | "identify_contradictions"
  | "prepare_narrative";

/** AI must never perform these roles in any capability. */
export type AiProhibitedRole =
  | "decide"
  | "execute"
  | "verify_evidence"
  | "approve"
  | "admit_learning"
  | "control_status"
  | "override_rules"
  | "override_constraints"
  | "bypass_review"
  | "train_self"
  | "act_external";

// ─── Core record type ─────────────────────────────────────────────────────────

export interface OwnerModeCapability {
  /** Stable identifier — never reuse a retired ID. */
  id: string;
  capability_name: string;
  description: string;
  risk_level: RiskLevel;
  autonomy_level: AutonomyLevel;
  access_level: AccessLevel;
  /** Whether AI is involved in this capability at all. */
  ai_allowed: boolean;
  /**
   * Which support-only AI roles are permitted.
   * Must be a strict subset of AiAllowedRole.
   * Empty when ai_allowed is false.
   */
  ai_allowed_roles: AiAllowedRole[];
  /**
   * Prohibited AI roles for this capability.
   * Must always include at least the full AiProhibitedRole set.
   */
  ai_prohibited_roles: AiProhibitedRole[];
  /** Owner must explicitly approve before any state change. */
  owner_approval_required: boolean;
  /** How this capability is rolled back if it causes harm. */
  rollback_path: string;
  /** Which deterministic service/rule owns the state transition. */
  control_path: string;
  created_at: string;
}

// ─── Full prohibited-role list (reused on every capability) ──────────────────

const ALL_PROHIBITED: AiProhibitedRole[] = [
  "decide",
  "execute",
  "verify_evidence",
  "approve",
  "admit_learning",
  "control_status",
  "override_rules",
  "override_constraints",
  "bypass_review",
  "train_self",
  "act_external",
];

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ownerModeCapabilityRegistry: ReadonlyArray<OwnerModeCapability> = [
  {
    id: "CAP-001",
    capability_name: "input_quality_assessment",
    description:
      "Assess completeness and reliability of owner-submitted business data before diagnosis.",
    risk_level: "medium",
    autonomy_level: "observe_only",
    access_level: "read_only",
    ai_allowed: true,
    ai_allowed_roles: ["summarize", "identify_contradictions", "explain"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Re-submit original input; system re-scores quality from scratch without storing prior assessment.",
    control_path:
      "InputQualityService.assess() → deterministic scoring rules → owner_input_quality_assessments record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-002",
    capability_name: "diagnosis_generation",
    description:
      "Generate a root-cause diagnosis from quality-gated business evidence.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "read_only",
    ai_allowed: true,
    ai_allowed_roles: ["suggest", "explain", "challenge", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Diagnosis is advisory only; owner may reject or request reassessment at any time.",
    control_path:
      "DiagnosisService.generate() → evidence-contract rules → diagnosis_evidence record with confidence_reason",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-003",
    capability_name: "recommendation_generation",
    description:
      "Generate structured, evidence-backed recommendations from a verified diagnosis.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "read_only",
    ai_allowed: true,
    ai_allowed_roles: [
      "draft",
      "suggest",
      "compare_options",
      "challenge",
      "prepare_narrative",
    ],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Recommendation is advisory; owner may reject, defer, or request verification before accepting.",
    control_path:
      "RecommendationService.create() → status machine (draft → recommended) → owner_recommendations record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-004",
    capability_name: "recommendation_verification",
    description:
      "Challenge OpsIQ's own recommendation with counter-evidence, assumption checks, and anti-overreliance gate.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "read_only",
    ai_allowed: true,
    ai_allowed_roles: [
      "challenge",
      "identify_contradictions",
      "compare_options",
      "explain",
    ],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Verification result does not alter the recommendation record; owner always sees both.",
    control_path:
      "VerificationService.verify() → deterministic question set → owner_recommendation_verifications record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-005",
    capability_name: "owner_decision_capture",
    description:
      "Record owner's explicit accept / reject / modify / defer decision on a recommendation.",
    risk_level: "critical",
    autonomy_level: "act_with_owner_approval",
    access_level: "write_owner_approved_internal_action",
    ai_allowed: false,
    ai_allowed_roles: [],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: true,
    rollback_path:
      "Owner may update decision status (e.g. reopen deferred); original decision record is preserved in audit trail.",
    control_path:
      "OwnerDecisionService.record() → status machine (pending → accepted|rejected|modified|deferred) → owner_decisions record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-006",
    capability_name: "action_tracking",
    description:
      "Create and track an owner-approved action with execution log and compliance scoring.",
    risk_level: "high",
    autonomy_level: "act_with_owner_approval",
    access_level: "write_owner_approved_internal_action",
    ai_allowed: true,
    ai_allowed_roles: ["draft", "summarize", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: true,
    rollback_path:
      "Action may be marked blocked/cancelled; execution log preserved; no external side-effect initiated.",
    control_path:
      "ActionService.create() → requires accepted owner_decision → owner_actions record; ExecutionLogService.record() → owner_action_execution_logs",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-007",
    capability_name: "evidence_verification",
    description:
      "Record whether submitted evidence is verified, rejected, conflicting, or stale. Verifier metadata always stored.",
    risk_level: "critical",
    autonomy_level: "advise_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["identify_contradictions", "explain", "summarize"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Verification status may be superseded with a new record; original verification preserved.",
    control_path:
      "EvidenceVerificationService.verify() → deterministic verifier-type rules → owner_evidence_verifications record; AI output is not the final verification",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-008",
    capability_name: "outcome_tracking",
    description:
      "Record what actually happened after an action was executed, including metric deltas and external events.",
    risk_level: "high",
    autonomy_level: "observe_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["summarize", "prepare_narrative", "explain"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Outcome record is immutable after creation; superseded by reassessment if disputed.",
    control_path:
      "OutcomeService.record() → owner_action_outcomes + owner_outcome_metrics records",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-009",
    capability_name: "failure_adjudication",
    description:
      "Classify why an outcome succeeded, failed, or cannot be judged using deterministic rule set.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["explain", "challenge", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Adjudication may be superseded by human review; original classification preserved.",
    control_path:
      "AdjudicationService.classify() → deterministic failure-class rules → owner_failure_adjudications record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-010",
    capability_name: "causal_attribution",
    description:
      "Classify whether the action likely caused the outcome or only correlates with it.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["challenge", "explain", "identify_contradictions"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Attribution record may be disputed and superseded; learning gate blocked until human review if confounded.",
    control_path:
      "CausalAttributionService.classify() → deterministic attribution rules → owner_causal_attribution_reviews record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-011",
    capability_name: "reassessment_generation",
    description:
      "Reopen diagnosis and produce a corrected action when a recommendation fails or is disputed.",
    risk_level: "high",
    autonomy_level: "advise_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: [
      "draft",
      "suggest",
      "challenge",
      "compare_options",
      "prepare_narrative",
    ],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Reassessment creates a new record; original diagnosis/recommendation untouched.",
    control_path:
      "ReassessmentService.create() → requires adjudication record → owner_reassessment_events + owner_corrective_diagnoses",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-012",
    capability_name: "learning_eligibility_gate",
    description:
      "Determine whether a completed case is eligible to become business-specific learning. Cannot be bypassed.",
    risk_level: "critical",
    autonomy_level: "advise_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: false,
    ai_allowed_roles: [],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: true,
    rollback_path:
      "Eligibility decision may be overridden by human review; learning never admitted without human_approved status on high-confidence cases.",
    control_path:
      "LearningEligibilityService.evaluate() → deterministic gate rules (adjudication + causal attribution + harm + execution required) → owner_learning_eligibility_reviews record",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-013",
    capability_name: "decision_memory",
    description:
      "Store business-specific history (accepted/rejected actions, do-not-repeat rules, owner constraints) with evidence links.",
    risk_level: "high",
    autonomy_level: "observe_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["summarize", "explain", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Memory entries are append-only; superseded entries marked inactive but never deleted.",
    control_path:
      "DecisionMemoryService.record() → owner_decision_memory records; only eligible cases write to memory",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-014",
    capability_name: "business_timeline",
    description:
      "Record periodic business state snapshots and detect metric trends over time.",
    risk_level: "medium",
    autonomy_level: "observe_only",
    access_level: "write_internal_tracking_only",
    ai_allowed: true,
    ai_allowed_roles: ["summarize", "explain", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Snapshots are immutable; incorrect data requires new snapshot with corrected values.",
    control_path:
      "BusinessTimelineService.snapshot() → deterministic trend detection rules → owner_business_state_snapshots + owner_trend_detections",
    created_at: "2026-06-18",
  },
  {
    id: "CAP-015",
    capability_name: "dashboard_summarization",
    description:
      "Present the current state of the Owner Mode reality loop to the owner without exposing hidden learning internals.",
    risk_level: "medium",
    autonomy_level: "observe_only",
    access_level: "read_only",
    ai_allowed: true,
    ai_allowed_roles: ["summarize", "explain", "prepare_narrative"],
    ai_prohibited_roles: ALL_PROHIBITED,
    owner_approval_required: false,
    rollback_path:
      "Dashboard is read-only; no state transitions triggered by viewing.",
    control_path:
      "DashboardService.buildOwnerSummary() → read-only query of owner loop records; no internal learning data exposed",
    created_at: "2026-06-18",
  },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up a capability by ID. Returns undefined if not found. */
export function getCapabilityById(
  id: string
): OwnerModeCapability | undefined {
  return ownerModeCapabilityRegistry.find((c) => c.id === id);
}

/** Look up a capability by name. Returns undefined if not found. */
export function getCapabilityByName(
  name: string
): OwnerModeCapability | undefined {
  return ownerModeCapabilityRegistry.find((c) => c.capability_name === name);
}

/** Return all capabilities that require owner approval. */
export function getOwnerApprovalRequired(): ReadonlyArray<OwnerModeCapability> {
  return ownerModeCapabilityRegistry.filter(
    (c) => c.owner_approval_required
  );
}

/** Return all capabilities where AI is allowed (support-only). */
export function getAiAllowedCapabilities(): ReadonlyArray<OwnerModeCapability> {
  return ownerModeCapabilityRegistry.filter((c) => c.ai_allowed);
}
