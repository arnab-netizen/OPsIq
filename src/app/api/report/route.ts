import { CAPABILITIES } from "@/domain/constants/capabilities";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { generateReport } from "@/services/report/engine";

// NOTE: generateReport() failures are intentionally left uncaught here.
// withCanonicalEnforcement's own catch (see canonical-route-enforcement.ts)
// already classifies any thrown error safely: a real internal failure (e.g.
// the DB read inside generateReport failing) becomes a 500 with a generic
// "Internal server error" body, never a raw message. Wrapping it in a local
// try/catch that rethrew everything as `BadRequestError` (400) mislabeled
// genuine server failures as client errors -- this route now matches the
// same pattern used by every sibling SYSTEM_VIEW_AUDIT route (e.g.
// /api/governance/metrics, /api/observability/summary), which do not
// locally catch and reclassify handler errors either.
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return generateReport(ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_VIEW_AUDIT], requireWorkspace: true }
);
