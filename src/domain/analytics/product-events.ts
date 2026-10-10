/**
 * Public-beta product analytics — the closed event vocabulary and payload sanitiser.
 *
 * Privacy contract (enforced by sanitiseProductEventProps, pinned by test): a payload may only carry
 * allow-listed keys holding either a short enum token or a bounded whole number (a duration/count). Free
 * text, money amounts, names, emails and any key not listed here are DROPPED, never forwarded — so revenue,
 * cash, customer names and other business-sensitive values cannot reach analytics by construction.
 * Pure (no I/O).
 */
import { AUDIT_EVENTS, type AuditEventName } from "@/domain/constants/audit-events";

export const PRODUCT_EVENTS = {
  public_start_free_clicked: AUDIT_EVENTS.PRODUCT_PUBLIC_START_FREE_CLICKED,
  signup_started: AUDIT_EVENTS.PRODUCT_SIGNUP_STARTED,
  signup_completed: AUDIT_EVENTS.PRODUCT_SIGNUP_COMPLETED,
  email_verified: AUDIT_EVENTS.PRODUCT_EMAIL_VERIFIED,
  first_run_started: AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED,
  business_profile_completed: AUDIT_EVENTS.PRODUCT_BUSINESS_PROFILE_COMPLETED,
  first_evidence_saved: AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED,
  first_diagnosis_completed: AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED,
  first_result_viewed: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
  first_result_action_accepted: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_ACTION_ACCEPTED,
  first_result_corrected: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_CORRECTED,
  first_result_improvement_requested: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_IMPROVEMENT_REQUESTED,
  first_result_question_skipped: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_QUESTION_SKIPPED,
  first_trusted_decision_interaction: AUDIT_EVENTS.PRODUCT_FIRST_TRUSTED_DECISION_INTERACTION,
  first_value_feedback: AUDIT_EVENTS.PRODUCT_FIRST_VALUE_FEEDBACK,
  cockpit_reached: AUDIT_EVENTS.PRODUCT_COCKPIT_REACHED,
  returning_owner: AUDIT_EVENTS.PRODUCT_RETURNING_OWNER,
  outcome_verification_started: AUDIT_EVENTS.PRODUCT_OUTCOME_VERIFICATION_STARTED,
  outcome_verified: AUDIT_EVENTS.PRODUCT_OUTCOME_VERIFIED,
} as const satisfies Record<string, AuditEventName>;

export type ProductEventName = keyof typeof PRODUCT_EVENTS;

export const PRODUCT_EVENT_NAMES = Object.keys(PRODUCT_EVENTS) as ProductEventName[];

/** Events a not-yet-authenticated browser may report (no identity, no payload). Everything else is server-emitted. */
export const ANONYMOUS_CLIENT_EVENTS = ["public_start_free_clicked", "signup_started"] as const satisfies readonly ProductEventName[];

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRODUCT_EVENTS, value);
}

export function isAnonymousClientEvent(value: unknown): value is (typeof ANONYMOUS_CLIENT_EVENTS)[number] {
  return typeof value === "string" && (ANONYMOUS_CLIENT_EVENTS as readonly string[]).includes(value);
}

/** Allowed payload keys and the only value shape each may carry. */
const ENUM_TOKEN = /^[A-Z][A-Z0-9_]{1,40}$/;
const PROP_RULES: Record<string, { kind: "enum" } | { kind: "int"; max: number }> = {
  /** Time from verification to a trusted interaction, in seconds. */
  timeToFirstValueSeconds: { kind: "int", max: 31_536_000 },
  firstRunState: { kind: "enum" },
  evidenceQuality: { kind: "enum" },
  confidenceTier: { kind: "enum" },
  interactionKind: { kind: "enum" },
  rating: { kind: "enum" },
  verificationClass: { kind: "enum" },
  reason: { kind: "enum" },
  admissionMode: { kind: "enum" },
  questionsAnswered: { kind: "int", max: 50 },
};

export type ProductEventProps = Record<string, string | number>;

export function sanitiseProductEventProps(props: Record<string, unknown> | undefined): ProductEventProps {
  const out: ProductEventProps = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    const rule = PROP_RULES[key];
    if (!rule) continue;
    if (rule.kind === "enum" && typeof value === "string" && ENUM_TOKEN.test(value)) out[key] = value;
    if (rule.kind === "int" && typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= rule.max) out[key] = value;
  }
  return out;
}
