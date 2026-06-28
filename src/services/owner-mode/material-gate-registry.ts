/**
 * Jarvis 360 gap-closure (G04,G05,G06) — material owner-path gate registry.
 *
 * Strict re-audit finding: the safety-gate spine was only invoked from one call site, and
 * nothing guarded against a new material owner path being added without registering the
 * gate. This is the single source of truth for "which runtime paths MUST pass through a
 * safety gate, and which gate symbol enforces them". The accompanying regression test
 * (material-gate-registry.test.ts) asserts each registered call site still contains its
 * enforcing symbol — so dropping a gate fails CI.
 */

export interface MaterialGatePath {
  /** Human label for the material owner decision path. */
  id: string;
  /** Source file (repo-relative) that must invoke the gate. */
  file: string;
  /** The exported symbol whose presence in `file` proves the gate is wired. */
  enforcingSymbol: string;
  /** Why this path is material (affects cash/margin/capacity/proof/repeat). */
  rationale: string;
}

/**
 * Every material owner promotion/completion path and the gate it must call. Adding a new
 * material path WITHOUT an entry here (and the symbol in the file) is the regression we
 * guard against.
 */
export const MATERIAL_GATE_PATHS: readonly MaterialGatePath[] = [
  {
    id: "recommendation.approve",
    file: "src/services/recommendation.ts",
    enforcingSymbol: "enforceOwnerGatesForPromotion",
    rationale: "Promoting a recommendation to approved must pass cash/margin/capacity/data/confidence/do-not-repeat gates.",
  },
  {
    id: "recommendation.generate.arbitrate",
    file: "src/services/recommendation.ts",
    enforcingSymbol: "arbitrateInterventions",
    rationale: "Generating recommendations must arbitrate the candidate set (chosen vs rejected + what-not-to-do).",
  },
  {
    id: "task.complete",
    file: "src/services/execution/task-completion.service.ts",
    enforcingSymbol: "evaluateProofClearance",
    rationale: "Completing a delegated task must be gated on cleared (accepted, non-duplicate, fresh) proof.",
  },
  {
    id: "approval.enforce",
    file: "src/services/approval/workflow.ts",
    enforcingSymbol: "resolveOwnerApproval",
    rationale: "High-impact approvals must consult standing instructions + approval memory before re-asking the owner.",
  },
  // EH-01/EH-02 — every owner-mode domain action service must pass material transitions
  // through the owner-mode gate (default-on, opt-out aware). Adding a new owner-domain
  // action service without this call is the regression we guard against.
  ...(
    ["finance", "cashflow", "sales", "marketing", "operations", "sop", "strategy"].map((d) => ({
      id: `owner.${d}.action`,
      file: `src/services/owner-${d}/action.service.ts`,
      enforcingSymbol: "enforceOwnerActionGates",
      rationale: `Owner ${d} action transitions (in_progress/completed) must pass the owner-mode safety gate.`,
    }))
  ),
] as const;
