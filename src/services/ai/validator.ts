/**
 * Owner Mode Governed AI Copilot — Post-AI Validator / Guardrails (Phase AI-1/AI-5).
 *
 * Deterministic, pure. Runs AFTER schema validation. AI output is advisory until it
 * passes here, and even then can never bypass deterministic services. Rejects output
 * that hallucinates evidence, obeys prompt injection, overclaims confidence, proposes
 * unauthorized actions/state mutation, leaks workspace scope, or asserts unsupported
 * numbers. Fail-closed: anything ambiguous is rejected.
 */
import type { AiContext } from "./provider";
import { untrustedText } from "./context-builder";

export const AI_VALIDATOR_STATUSES = [
  "ACCEPTED",
  "REJECTED_SCHEMA_INVALID",
  "REJECTED_HALLUCINATED_EVIDENCE",
  "REJECTED_POLICY_VIOLATION",
  "REJECTED_CONFIDENCE_OVERCLAIM",
  "REJECTED_UNAUTHORIZED_ACTION",
  "REJECTED_WORKSPACE_SCOPE",
  "REJECTED_PROMPT_INJECTION",
  "REJECTED_UNSUPPORTED_NUMBERS",
  "AI_UNAVAILABLE",
] as const;
export type AiValidatorStatus = (typeof AI_VALIDATOR_STATUSES)[number];

export interface AiValidationResult {
  status: AiValidatorStatus;
  accepted: boolean;
  reasons: string[];
}

// ── Hostile / out-of-bounds patterns (an AI assistant must NEVER perform these) ──
const APPROVAL_DIRECTIVE = /\b(i\s+)?(approve|approved|auto-?approve|sign\s*off|authori[sz]e)\b/i;
const VERIFY_DIRECTIVE = /\b(mark(ed)?\s+(this|the|it)?\s*(outcome|result)?\s*(as\s+)?verif\w*|outcome\s+verif\w*|confirm(ed)?\s+success)\b/i;
const DELETE_AUDIT_DIRECTIVE = /\b(delete|drop|erase|wipe|clear)\b[^.]{0,40}\b(audit|log|event|ledger|trail)\b/i;
const CROSS_WORKSPACE_DIRECTIVE = /\b(another|other|different|cross[-\s]?)\s*workspace\b/i;
const UNSAFE_REASSURANCE = /\b(safe|fine|ok(ay)?|no\s+problem)\b[^.]{0,40}\b(even|despite|regardless)\b[^.]{0,40}\b(cash|runway|low|debt|insolven)\b/i;
const INJECTION_ECHO = /\b(ignore|disregard|forget)\b[^.]{0,30}\b(previous|prior|above|earlier)\b[^.]{0,20}\b(instruction|rule|prompt)/i;
const PUBLIC_SAAS = /\b(product\s*hunt|stripe|lemon\s*squeezy|subscription\s*tier|pricing\s*page|public\s*launch|marketing\s*page)\b/i;
const CONFIDENCE_OVERCLAIM = /\b(high\s+confidence|i\s+am\s+(certain|sure|confident)|definitely|guaranteed|certainly\b|100%\s+(sure|certain)|without\s+a\s+doubt)\b/i;
// A definitive numeric assertion about a business metric (questions ASK, they never ASSERT facts).
const METRIC_ASSERTION =
  /\b(your|the)\s+(revenue|margin|profit|cash|runway|cost|cac|ltv|churn|debt|payroll)\b[^?]{0,25}\b(is|was|equals|stands\s+at|=)\b\s*[₹$]?\s*[\d][\d,.]*/i;

/** Scan a blob of model-authored text for forbidden directives; returns the first hit class. */
function scanDirectives(text: string): AiValidatorStatus | null {
  if (INJECTION_ECHO.test(text)) return "REJECTED_PROMPT_INJECTION";
  if (DELETE_AUDIT_DIRECTIVE.test(text)) return "REJECTED_PROMPT_INJECTION";
  if (CROSS_WORKSPACE_DIRECTIVE.test(text)) return "REJECTED_WORKSPACE_SCOPE";
  if (UNSAFE_REASSURANCE.test(text)) return "REJECTED_POLICY_VIOLATION";
  if (PUBLIC_SAAS.test(text)) return "REJECTED_POLICY_VIOLATION";
  if (APPROVAL_DIRECTIVE.test(text)) return "REJECTED_UNAUTHORIZED_ACTION";
  if (VERIFY_DIRECTIVE.test(text)) return "REJECTED_UNAUTHORIZED_ACTION";
  return null;
}

export interface ValidatableOutput {
  /** Text fields the model authored that must be scanned (exclude example/sample fields). */
  scannableText: string;
  /** Evidence ids the model claims to have used. */
  citedEvidenceIds: string[];
}

/**
 * Validate already-schema-valid AI output against the context + guardrails.
 * Pure and deterministic; never throws.
 */
export function validateAiOutput(
  output: ValidatableOutput,
  context: AiContext
): AiValidationResult {
  const reasons: string[] = [];
  const text = output.scannableText;

  // 1. Hallucinated evidence: any cited id outside the closed allowed set.
  const allowed = new Set(context.allowedEvidenceIds);
  const fabricated = output.citedEvidenceIds.filter((id) => !allowed.has(id));
  if (fabricated.length > 0) {
    return {
      status: "REJECTED_HALLUCINATED_EVIDENCE",
      accepted: false,
      reasons: [`cited evidence not in context: ${fabricated.join(", ")}`],
    };
  }

  // 2. Forbidden directives (injection / unauthorized action / scope / policy).
  const directiveHit = scanDirectives(text);
  if (directiveHit) {
    return { status: directiveHit, accepted: false, reasons: [`forbidden directive in output (${directiveHit})`] };
  }

  // 3. Injection echo: output that reproduces an instruction smuggled in untrusted input.
  //    If untrusted input contained an imperative the output now restates, reject.
  const untrusted = untrustedText(context).toLowerCase();
  if (untrusted && (INJECTION_ECHO.test(untrusted) || APPROVAL_DIRECTIVE.test(untrusted))) {
    // The presence of injection in the DATA is fine; obeying it is not. Re-scan output for compliance.
    if (APPROVAL_DIRECTIVE.test(text) || VERIFY_DIRECTIVE.test(text)) {
      return {
        status: "REJECTED_PROMPT_INJECTION",
        accepted: false,
        reasons: ["output appears to obey an instruction embedded in untrusted input"],
      };
    }
  }

  // 4. Confidence overclaim.
  if (CONFIDENCE_OVERCLAIM.test(text)) {
    return { status: "REJECTED_CONFIDENCE_OVERCLAIM", accepted: false, reasons: ["output overclaims confidence/certainty"] };
  }

  // 5. Unsupported numbers: asserting a business metric as a known fact.
  if (METRIC_ASSERTION.test(text)) {
    return { status: "REJECTED_UNSUPPORTED_NUMBERS", accepted: false, reasons: ["output asserts an unsupported business metric"] };
  }

  return { status: "ACCEPTED", accepted: true, reasons };
}
