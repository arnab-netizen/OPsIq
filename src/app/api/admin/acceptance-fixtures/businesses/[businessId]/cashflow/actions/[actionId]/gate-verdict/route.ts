/**
 * GET /api/admin/acceptance-fixtures/businesses/[businessId]/cashflow/actions/[actionId]/gate-verdict?toStatus=in_progress
 *
 * Acceptance-only, read-only prediction of the owner-action gate's verdict for a Cashflow fixture
 * action's assigned -> in_progress transition -- the SAME canonical calculation
 * (assessOwnerActionGate) the real PATCH uses, with zero audit writes and zero mutation. Exists so
 * tests/production/24-cashflow-acceptance.spec.ts (test 24-06) can assert the live PATCH's outcome
 * against a specific predicted verdict instead of a generic "200 or 409 is fine" acceptance. Scoped to
 * toStatus=in_progress only: "completed" carries additional completion-evidence validation independent
 * of the gate, so a gate-only verdict cannot predict that mutation's outcome.
 *
 * Fails closed WITHOUT an enumeration oracle: a nonexistent business, a cross-workspace business, and
 * an ordinary (non-fixture) business are ALL the identical 404 (status AND message -- both throws below
 * share one error-building closure keyed only on the caller's own params, never on which check failed);
 * likewise a nonexistent action, a cross-workspace action, and an action belonging to a different
 * business are ALL that same identical 404. Each lookup's WHERE clause folds the ownership check into
 * the query itself (isFixtureBusiness / businessId are query conditions, never a separate check branch),
 * so there is no code path, status, or message that could distinguish "found but refused" from "not
 * found" WITHIN either category. (The two lookups are sequential, so a business-level 404 makes one DB
 * round-trip and an action-level 404 makes two -- an inherent, unavoidable artifact of any two-segment
 * path, not a message/status leak, and not something this route's capability-gated, workspace-scoped
 * callers can usefully exploit.) Unauthorized capability/workspace access is whatever 401/403
 * withCanonicalEnforcement already returns, unchanged.
 *
 * See docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, parseSearchParams, uuidSchema } from "@/lib/validation";
import { NotFoundError } from "@/infra/errors";
import { db } from "@/lib/db";
import { acceptanceGateVerdictQuerySchema } from "@/domain/acceptance-fixtures/validation";
import { assessOwnerActionGate } from "@/services/owner-mode/owner-action-gate.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    parseOrThrow(uuidSchema, params.actionId);
    parseSearchParams(ctx.request!.url, acceptanceGateVerdictQuerySchema);

    // Every refusal reason must collapse to the SAME 404 -- not just the same status code, but the same
    // response BODY, so a caller cannot tell from the message which lookup failed. One error, one label,
    // one identifier string, reused verbatim by both throws below.
    const notFound = () => new NotFoundError("AcceptanceFixtureCashflowGateVerdictTarget", `${params.businessId}/${params.actionId}`);

    // One WHERE clause each: existence, workspace, and fixture/ownership are the SAME query condition,
    // never a separate check after a successful lookup -- so every refusal reason collapses to one 404.
    const business = await db.ownerBusiness.findFirst({
      where: { id: params.businessId, workspaceId: ctx.verifiedWorkspaceId, isFixtureBusiness: true },
      select: { id: true },
    });
    if (!business) throw notFound();

    const action = await db.ownerCashflowAction.findFirst({
      where: { id: params.actionId, workspaceId: ctx.verifiedWorkspaceId, businessId: business.id },
      select: { businessId: true, findingId: true, findingCode: true },
    });
    if (!action) throw notFound();

    const verdict = await assessOwnerActionGate({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId: action.businessId,
      actionId: params.actionId,
      domain: "cashflow",
      toStatus: "in_progress",
      findingCode: action.findingCode,
      findingId: action.findingId,
    });

    return canonicalJson(
      verdict.allowed ? { allowed: true, expectedMutationStatus: 200 } : { allowed: false, expectedMutationStatus: 409, code: verdict.code },
      { status: 200 }
    );
  },
  { requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true }
);
