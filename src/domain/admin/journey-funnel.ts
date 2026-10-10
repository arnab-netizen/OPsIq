/**
 * Operator-facing journey funnel: which governed events make up each step, and how raw event rows reduce to counts.
 * Aggregates only — the inputs are event names and workspace ids, never payloads, emails, tokens or money. Pure.
 * The two pre-account steps come from an anonymous, rate-capped beacon: they are raw taps, not people, and can be
 * inflated or starved by a hostile caller, so they are labelled approximate.
 */
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export interface FunnelStepDef { key: string; label: string; eventName: string; unit: "workspaces" | "attempts" }

/** In the order a new owner experiences them. `workspaces` = distinct workspaces; `attempts` = raw events (no workspace yet). */
export const FUNNEL_STEPS: readonly FunnelStepDef[] = [
  { key: "start_free_clicked", label: "Taps on Start free (anonymous, approximate)", eventName: AUDIT_EVENTS.PRODUCT_PUBLIC_START_FREE_CLICKED, unit: "attempts" },
  { key: "signup_started", label: "Signup form opens (anonymous, approximate)", eventName: AUDIT_EVENTS.PRODUCT_SIGNUP_STARTED, unit: "attempts" },
  { key: "signup_completed", label: "Signed up", eventName: AUDIT_EVENTS.PRODUCT_SIGNUP_COMPLETED, unit: "workspaces" },
  { key: "email_verified", label: "Verified email", eventName: AUDIT_EVENTS.PRODUCT_EMAIL_VERIFIED, unit: "workspaces" },
  { key: "first_run_started", label: "Started first run", eventName: AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED, unit: "workspaces" },
  { key: "business_profile_completed", label: "Set up the business", eventName: AUDIT_EVENTS.PRODUCT_BUSINESS_PROFILE_COMPLETED, unit: "workspaces" },
  { key: "first_evidence_saved", label: "Saved first numbers", eventName: AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED, unit: "workspaces" },
  { key: "first_diagnosis_completed", label: "Got a first diagnosis", eventName: AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED, unit: "workspaces" },
  { key: "first_result_viewed", label: "Saw the first read", eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED, unit: "workspaces" },
  { key: "first_trusted_decision_interaction", label: "Acted on it (activated)", eventName: AUDIT_EVENTS.PRODUCT_FIRST_TRUSTED_DECISION_INTERACTION, unit: "workspaces" },
  { key: "cockpit_reached", label: "Reached the Cockpit", eventName: AUDIT_EVENTS.PRODUCT_COCKPIT_REACHED, unit: "workspaces" },
];

/** Governed failure categories (each is an event the product already emits; one row = one occurrence). */
export const FAILURE_CATEGORIES: ReadonlyArray<{ key: string; label: string; eventName: string }> = [
  { key: "signup_refused_closed", label: "Signup refused: registration closed", eventName: AUDIT_EVENTS.SIGNUP_REFUSED_BETA_DISABLED },
  { key: "signup_refused_capacity", label: "Signup refused: beta full", eventName: AUDIT_EVENTS.SIGNUP_REFUSED_BETA_CAP },
  { key: "verification_email_not_sent", label: "Verification email could not be sent", eventName: AUDIT_EVENTS.EMAIL_VERIFICATION_NOT_SENT },
];

export const FUNNEL_EVENT_NAMES: readonly string[] = [...FUNNEL_STEPS.map((s) => s.eventName), ...FAILURE_CATEGORIES.map((f) => f.eventName)];

export interface FunnelCount { key: string; label: string; count: number }
