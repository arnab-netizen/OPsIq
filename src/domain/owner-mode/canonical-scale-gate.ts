/**
 * Canonical SCALE permission (pure) — the ONE answer to "may this business deploy growth / scaling capital?"
 * for every surface that still speaks the legacy whole-business-plan vocabulary (`growth.scaleAllowed`).
 *
 * This is NOT a second safety calculation. It is the owner action gate's own GROW evaluation
 * (owner-action-gate-policy.ts `evaluateOwnerActionGate`, the same policy the canonical owner decision,
 * Home and the server-side mutation gate use) over the same loaded constraints
 * (`loadOwnerGateConstraints`), re-expressed as a yes/no with named reasons. Two fail-closed rules are
 * added only where the canonical gate is silent by design (it enforces *actions* against known danger):
 *   - no current cash/finance reading → scale is NOT affirmed (unknown is never safe);
 *   - constraints unavailable (load failed) → scale is NOT affirmed.
 *
 * Semantics: the GROW gate holds only growth deployment (marketing/expansion/scaling capital). Ordinary
 * operating actions, protective work and capped stabilisation are different intents and are not held here.
 * Do-not-repeat memories are domain-specific and are not part of the scale permission (as in owner-now-view).
 */
import { evaluateOwnerActionGate, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";

export type CanonicalScaleBlockCode =
  | "cash_safety_gate"
  | "capacity_safety_gate"
  | "margin_safety_gate"
  | "compliance_gate"
  | "cash_finance_reading_missing"
  | "safety_state_unavailable";

export interface CanonicalScaleBlock {
  code: CanonicalScaleBlockCode;
  reason: string;
}

export interface CanonicalScaleGate {
  /** True only when the canonical GROW gate permits growth AND a current cash/finance reading exists. */
  allowed: boolean;
  blocks: CanonicalScaleBlock[];
}

const CODE_MAP: Readonly<Record<string, CanonicalScaleBlockCode>> = Object.freeze({
  CASH_SAFETY_BLOCKED: "cash_safety_gate",
  CAPACITY_BLOCKED: "capacity_safety_gate",
  MARGIN_SAFETY_BLOCKED: "margin_safety_gate",
  COMPLIANCE_BLOCKED: "compliance_gate",
});

/** `null` constraints = the safety state could not be loaded: scale is not affirmed. */
export function evaluateCanonicalScaleGate(constraints: OwnerGateConstraints | null): CanonicalScaleGate {
  if (constraints === null) {
    return {
      allowed: false,
      blocks: [{ code: "safety_state_unavailable", reason: "The business's current safety state could not be established, so scaling is not permitted until it can." }],
    };
  }
  // The owner's audited opt-out disables the canonical gate for every action; scale follows it.
  if (constraints.optedOut) return { allowed: true, blocks: [] };

  const blocks: CanonicalScaleBlock[] = [];
  if (!constraints.businessScoped || constraints.cash.gateState === null) {
    blocks.push({ code: "cash_finance_reading_missing", reason: "There is no current cash or Finance reading, so scaling cannot be shown to be safe." });
  }
  const verdict = evaluateOwnerActionGate({ ...constraints, doNotRepeat: [] }, { domain: "marketing", intent: "GROW", findingId: null, findingCode: null });
  if (!verdict.allowed) {
    for (const b of verdict.blocks) {
      const code = CODE_MAP[b.code];
      if (code) blocks.push({ code, reason: b.reason });
    }
  }
  return { allowed: blocks.length === 0, blocks };
}
