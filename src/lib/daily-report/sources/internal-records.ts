/**
 * Internal signup/activation/revenue records -- module 6 of the daily reporting system.
 *
 * Queries OpsIQ's own product data (not a customer's business data) the same way the existing
 * admin dashboard already does: see src/app/api/admin/overview/route.ts, which is the real
 * precedent this module follows --
 *   - signups: db.user.count(...) scoped to workspaceMemberships.workspace.signupSource in
 *     [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] (src/lib/beta.ts), windowed by
 *     User.createdAt;
 *   - activations: the same user set, windowed by User.emailVerifiedAt, with isActive true;
 *   - revenue: an MRR-style snapshot -- sum of Plan.priceMonthly for every Subscription with
 *     status "active" (prisma/schema.prisma models Subscription/Plan) as of the end of the window.
 *
 * No live DATABASE_URL exists in this sandbox, so this module reports BLOCKED cleanly without ever
 * touching Prisma -- proven correct by fixture tests that inject a mock `InternalRecordsQueries` for
 * every other state. The real query implementation (`createPrismaInternalRecordsQueries`) is wired
 * to `@/lib/db` lazily (dynamic import, only reached once DATABASE_URL is confirmed present) so this
 * module never fails to even load in an environment with no database configured.
 */
import { buildMetric, buildSourceReport, type Metric, type SourceContext, type SourceModule, type SourceReport } from "../types";

export const INTERNAL_RECORDS_SOURCE_ID = "internal-records";

export interface InternalRecordsQueries {
  countSignupsInWindow(window: { start: string; end: string }): Promise<number>;
  countActivationsInWindow(window: { start: string; end: string }): Promise<number>;
  /** MRR-style snapshot as of `asOf`, in whole currency units (not cents) -- matches Plan.priceMonthly's own unit. */
  sumActiveMonthlyRevenue(asOf: string): Promise<number>;
}

export interface InternalRecordsOptions {
  queries?: InternalRecordsQueries;
}

/**
 * Real implementation, lazily bound to this repo's own Prisma client and the same beta signup-source
 * tagging the admin overview route uses. Only imported when a DATABASE_URL is actually present.
 */
export async function createPrismaInternalRecordsQueries(): Promise<InternalRecordsQueries> {
  const [{ db }, { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE }] = await Promise.all([import("@/lib/db"), import("@/lib/beta")]);
  const betaSignupSources = [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE];
  const betaWorkspaceFilter = { workspaceMemberships: { some: { workspace: { signupSource: { in: betaSignupSources } } } } };

  return {
    async countSignupsInWindow(window) {
      return db.user.count({ where: { createdAt: { gte: new Date(window.start), lte: new Date(window.end) }, ...betaWorkspaceFilter } });
    },
    async countActivationsInWindow(window) {
      return db.user.count({
        where: { isActive: true, emailVerifiedAt: { gte: new Date(window.start), lte: new Date(window.end) }, ...betaWorkspaceFilter },
      });
    },
    async sumActiveMonthlyRevenue(asOf) {
      const subs = await db.subscription.findMany({
        where: { status: "active", currentPeriodStart: { lte: new Date(asOf) }, currentPeriodEnd: { gt: new Date(asOf) } },
        include: { plan: true },
      });
      return subs.reduce((sum: number, s: { plan?: { priceMonthly?: number } }) => sum + (s.plan?.priceMonthly ?? 0), 0);
    },
  };
}

export function createInternalRecordsModule(opts: InternalRecordsOptions = {}): SourceModule {
  return {
    id: INTERNAL_RECORDS_SOURCE_ID,
    displayName: "Internal signup/activation/revenue records",
    async run(ctx: SourceContext): Promise<SourceReport> {
      const startedAt = ctx.now().toISOString();
      const databaseUrl = ctx.env.DATABASE_URL || ctx.env.TEST_DATABASE_URL;

      if (!opts.queries && !databaseUrl) {
        const retrievedAt = ctx.now().toISOString();
        const blockedDetail = "DATABASE_URL is not configured in this environment; no query was attempted.";
        return buildSourceReport({
          source: INTERNAL_RECORDS_SOURCE_ID,
          displayName: "Internal signup/activation/revenue records",
          startedAt,
          metrics: (["signups", "activations", "revenue"] as const).map((name) =>
            buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "BLOCKED", window: ctx.window, value: null, detail: blockedDetail, retrievedAt }),
          ),
        });
      }

      let queries: InternalRecordsQueries;
      try {
        queries = opts.queries ?? (await createPrismaInternalRecordsQueries());
      } catch (err) {
        const retrievedAt = ctx.now().toISOString();
        const detail = `Could not initialize the database client: ${String((err as Error)?.message ?? err)}`;
        return buildSourceReport({
          source: INTERNAL_RECORDS_SOURCE_ID,
          displayName: "Internal signup/activation/revenue records",
          startedAt,
          metrics: (["signups", "activations", "revenue"] as const).map((name) =>
            buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "BLOCKED", window: ctx.window, value: null, detail, retrievedAt }),
          ),
        });
      }

      const metrics: Metric[] = [];

      metrics.push(await safeCountMetric(ctx, "signups", () => queries.countSignupsInWindow(ctx.window), "signups"));
      metrics.push(await safeCountMetric(ctx, "activations", () => queries.countActivationsInWindow(ctx.window), "activations"));
      metrics.push(
        await safeCountMetric(ctx, "revenue", () => queries.sumActiveMonthlyRevenue(ctx.window.end), "in active monthly revenue (as of window end)"),
      );

      return buildSourceReport({ source: INTERNAL_RECORDS_SOURCE_ID, displayName: "Internal signup/activation/revenue records", startedAt, metrics });
    },
  };
}

async function safeCountMetric(ctx: SourceContext, name: string, fn: () => Promise<number>, noun: string): Promise<Metric> {
  const retrievedAt = ctx.now().toISOString();
  try {
    const count = await fn();
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      return buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "FAILED", window: ctx.window, value: null, detail: `Query for ${noun} returned a non-numeric or negative result.`, retrievedAt });
    }
    if (count === 0) {
      return buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "CONFIRMED_ZERO", window: ctx.window, value: 0, detail: `Query succeeded: zero ${noun} in this window (a real, successfully-retrieved zero).`, retrievedAt });
    }
    return buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "VERIFIED", window: ctx.window, value: count, detail: `Query succeeded: ${count} ${noun} in this window.`, retrievedAt });
  } catch (err) {
    return buildMetric({ name, source: INTERNAL_RECORDS_SOURCE_ID, status: "FAILED", window: ctx.window, value: null, detail: `Query for ${noun} failed: ${String((err as Error)?.message ?? err)}`, retrievedAt });
  }
}
