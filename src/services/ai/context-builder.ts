/**
 * Owner Mode Governed AI Copilot — Context Builder (Phase AI-1/AI-2).
 *
 * Builds the minimal, workspace/business/task-scoped, source-classified context
 * the model is allowed to see. Hard rule: if workspace scope cannot be proven the
 * call is BLOCKED (no context leaves). Untrusted items (owner/operator/imported
 * text) are labelled as DATA, never instructions.
 */
import { assertWorkspaceScopedQuery } from "../../domain/owner-mode/security-rules";
import type {
  AiContext,
  AiContextItem,
  AiRiskLevel,
  AiTaskType,
} from "./provider";

export interface BuildAiContextInput {
  workspaceId: string;
  businessId?: string;
  taskType: AiTaskType;
  riskLevel: AiRiskLevel;
  items: ScopedContextItem[];
  gates?: AiContext["gates"];
}

/** Items from a foreign workspace must never enter a context. Enforced structurally. */
export interface ScopedContextItem extends AiContextItem {
  /** Optional originating workspace; if present it MUST equal the target workspace. */
  sourceWorkspaceId?: string;
}

export class AiContextScopeError extends Error {}

/**
 * Build a scoped AI context. Throws {@link AiContextScopeError} if the workspace
 * cannot be proven or any item belongs to another workspace.
 */
export function buildAiContext(input: BuildAiContextInput): AiContext {
  // Fail-closed workspace scope (reuses the canonical SEC-007/008 guard).
  try {
    assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  } catch (e) {
    throw new AiContextScopeError(
      e instanceof Error ? e.message : "workspace scope could not be proven"
    );
  }

  for (const item of input.items) {
    if (item.sourceWorkspaceId && item.sourceWorkspaceId !== input.workspaceId) {
      throw new AiContextScopeError(
        `cross-workspace context item rejected: "${item.label}" belongs to ${item.sourceWorkspaceId}, not ${input.workspaceId}`
      );
    }
  }

  const allowedEvidenceIds = Array.from(
    new Set(input.items.map((i) => i.evidenceId).filter((id): id is string => !!id))
  );

  // Strip the scope marker before handing context onward (it is enforcement-only).
  const items: AiContextItem[] = input.items.map((i) => ({
    kind: i.kind,
    label: i.label,
    value: i.value,
    evidenceId: i.evidenceId,
    trusted: i.trusted,
  }));

  return {
    workspaceId: input.workspaceId,
    businessId: input.businessId,
    taskType: input.taskType,
    riskLevel: input.riskLevel,
    items,
    allowedEvidenceIds,
    gates: input.gates ?? {},
  };
}

/** All untrusted free-text the model received, concatenated for injection scanning. */
export function untrustedText(context: AiContext): string {
  return context.items
    .filter((i) => !i.trusted)
    .map((i) => `${i.label}: ${i.value ?? ""}`)
    .join("\n");
}
