/**
 * GET /api/admin/acceptance-fixtures/capability
 *
 * Read-only acceptance PREFLIGHT. Declares exactly the same gate as every write route under
 * /api/admin/acceptance-fixtures (ACCEPTANCE_FIXTURE_WRITE + a verified workspace), so "authorized
 * here" and "authorized to create" can never differ: a caller that reaches the handler is, by the
 * canonical wrapper's own decision, allowed to create fixtures; anyone else gets 401/403 before the
 * handler runs. Returns no data and writes nothing. Production acceptance calls this before it
 * creates anything.
 */
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async () => ({ acceptanceFixtureAuthority: true }),
  { requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true }
);
