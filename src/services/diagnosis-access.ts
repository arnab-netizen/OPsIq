/**
 * Who may use the consultant quick diagnosis (/diagnosis → POST /api/diagnosis).
 *
 * The page renders from this decision, and it applies the same two server-side checks the API
 * path enforces, so page visibility and API permission always agree:
 *  1. ENGAGEMENT_CREATE — required by the route (withCanonicalEnforcement requireCapabilities);
 *  2. the workspace plan's "create_engagement" entitlement — required by diagnoseBusiness /
 *     createEngagement (PlanLimitError → 402).
 * A new client can only be added by actors holding CLIENT_CREATE (diagnoseBusiness enforces it);
 * canAddClients lets the form say so up front.
 * Fails closed: no session or workspace → "denied"; a lookup error → "unavailable" (never the form).
 */
import { getPolicyContext } from "@/services/auth";
import { assertCapability } from "@/services/entitlement.service";
import { hasCapability, isSelfServeOwnerContext } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";

/**
 * allowed: show the form · owner: self-serve owner → Owner diagnosis · not_in_plan: capability held,
 * plan lacks engagements · denied: anything else · unavailable: access couldn't be checked.
 */
export type DiagnosisAccessState = "allowed" | "owner" | "not_in_plan" | "denied" | "unavailable";
export interface DiagnosisAccess {
  state: DiagnosisAccessState;
  canAddClients: boolean;
}

export async function resolveDiagnosisAccess(): Promise<DiagnosisAccess> {
  const deny = (state: DiagnosisAccessState): DiagnosisAccess => ({ state, canAddClients: false });
  try {
    const policy = await getPolicyContext();
    if (!policy) return deny("denied");
    if (!hasCapability(policy, CAPABILITIES.ENGAGEMENT_CREATE)) {
      return deny(isSelfServeOwnerContext(policy) ? "owner" : "denied");
    }
    // getPolicyContext loads only role assignments scoped to the workspace it resolved (the same
    // earliest-active-membership derivation withCanonicalEnforcement uses), so their scopeId is
    // that workspace.
    const workspaceId = policy.roles.find((r) => r.scope === "workspace" && r.scopeId)?.scopeId;
    if (!workspaceId) return deny("denied");
    const entitlement = await assertCapability(workspaceId, "create_engagement");
    if (!entitlement.allowed) return deny("not_in_plan");
    return { state: "allowed", canAddClients: hasCapability(policy, CAPABILITIES.CLIENT_CREATE) };
  } catch {
    return deny("unavailable"); // never show a form the API might reject
  }
}
