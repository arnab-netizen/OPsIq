/**
 * F-AUTH-ROOT-FAST-FAIL root cause: the authenticated `/` redirect decision
 * (policy-context resolution, then -- only for a proven self-serve owner --
 * owner-login-href resolution, which transitively reads the full
 * owner-first-run/diagnosis graph) had no caller-side bound at all. Unlike
 * getSession()'s own raw-SQL read (bounded by a genuine Postgres-side
 * statement_timeout, see SESSION_QUERY_TIMEOUT_MS in auth.ts),
 * getPolicyContext()'s four Prisma reads and the deep owner-first-run graph
 * beneath resolveOwnerLoginHref() carried NO server-side statement_timeout
 * at all -- a stalled read anywhere in either path could ride Vercel's 300s
 * function ceiling before this route ever resolved.
 *
 * Database-review finding (CRITICAL/HIGH), fixed for the policy-context
 * portion: getPolicyContextForSession() now accepts options.statementTimeoutMs
 * (see auth.ts), which runs its reads as raw SQL inside
 * withRawStatementTimeout() -- the SAME primitive getSession() itself uses
 * -- for a REAL Postgres-side statement_timeout, with acquisition bounded
 * only by the pool's own connectionTimeoutMillis (round-2 database review:
 * an earlier draft of this fix used Prisma's interactive $transaction()
 * instead, which reintroduced the exact P2028-under-ordinary-contention
 * defect class this codebase already diagnosed and moved getSession()
 * itself away from -- see POLICY_CONTEXT_QUERY_TIMEOUT_MS's doc comment in
 * auth.ts). Postgres cancels the statement and the connection is guaranteed
 * back to the pool (or discarded cleanly), independent of whatever this
 * function's own outer race decides. This call site opts in; every OTHER
 * caller of getPolicyContext() is unaffected (the option is off by
 * default), keeping this fix root-specific.
 *
 * The owner-first-run graph beneath resolveOwnerLoginHref() still has no
 * server-side statement_timeout -- converting that graph onto the same
 * primitive spans dozens of files well outside this one route (owner-first-run,
 * owner-finance, diagnosis, audit...) and is out of scope for this slice;
 * see the KNOWN LIMITATION paragraph immediately below for the full,
 * precise statement of what that leaves unprotected.
 *
 * KNOWN LIMITATION, stated precisely per database/TypeScript-review findings
 * (not the vaguer "can keep running" this file's first draft used): if the
 * outer race below times out while resolveOwnerLoginHref()'s unprotected
 * read is still in flight, that read is abandoned client-side, NOT cancelled
 * server-side. Production's Prisma pool is `max: 1` for the WHOLE
 * application (src/lib/db.ts) -- the same single connection getSession(),
 * every other getPolicyContext() caller, and virtually every other
 * DB-backed route shares. An abandoned, uncancelled read can hold that sole
 * connection until it eventually settles on its own, which can stall EVERY
 * OTHER request in the app needing a database connection, not merely this
 * one request -- and if the function instance freezes/resumes while that
 * read is still outstanding (the documented P0-15 freeze/dead-socket
 * failure mode, see attachDatabasePool()'s doc comment in db.ts), the
 * connection may never be released at all, pinning the pool until Vercel
 * recycles the instance. This fix stops the ROUTE from hanging the caller;
 * it does not reduce the probability or duration of this app-wide
 * pool-pressure risk for the unprotected owner-first-run graph specifically.
 * Closing that fully requires the same deeper, multi-file root-cause closure
 * described above.
 */
import { logger } from "@/infra/logger";
import {
  getPolicyContextForSession,
  POLICY_CONTEXT_QUERY_TIMEOUT_MS,
  POLICY_CONTEXT_STATEMENT_TIMEOUT_MS,
  SESSION_QUERY_TIMEOUT_MS,
  type SessionInfo,
} from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";
import { resolveOwnerLoginHref } from "@/services/owner-first-run/first-run.service";

/**
 * Budget for the still-unprotected owner-first-run graph beneath
 * resolveOwnerLoginHref() -- covers both its own connection-ACQUISITION
 * wait under ordinary contention and its query EXECUTION time once
 * connected (many fast, indexed reads across owner-first-run/owner-finance/
 * diagnosis).
 *
 * Database-review finding (H1, round 1): this must not be an independently
 * hand-picked number. Database-review finding (H1, round 2): it also must
 * not simply re-add a SECOND full POOL_CONNECTION_TIMEOUT_MS (90s) on top
 * of POLICY_CONTEXT_QUERY_TIMEOUT_MS -- that formula (see auth.ts) ALREADY
 * bakes in one full POOL_CONNECTION_TIMEOUT_MS worth of cold-start/
 * contention tolerance for the policy-context reads that run moments
 * earlier in the SAME request; stacking a second independent 90s on top of
 * that for the owner-first-run graph double-counts the same risk (a fresh
 * Neon-compute wake can only genuinely happen once per request's first DB
 * touch) and, combined with getSession()'s own ~107s worst case, would
 * push this route's total past Vercel's 300s ceiling (see
 * TOTAL_AUTH_ROOT_WORST_CASE_MS and its module-load assertion below, which
 * verifies this arithmetic directly rather than by comment alone).
 *
 * Instead, sized from this codebase's own documented PRODUCTION EVIDENCE
 * for ordinary pool-queuing contention on an ALREADY-WARM connection (the
 * realistic case here, since getSession() and the policy-context reads
 * have both just succeeded moments earlier in this same request): db.ts's
 * own P0-15 forensic cites "several seconds" of queuing under a concurrent
 * cold-start burst in production. 30s is an order of magnitude above that
 * observed figure -- generous, but proportionate to real evidence rather
 * than an arbitrary number or a second full fresh-pool ceiling.
 */
const OWNER_FIRST_RUN_GRAPH_MARGIN_MS = 30_000;

/**
 * Outer JS-side bound on the whole policy-context + owner-login-href
 * decision. Derived from the SAME constants the rest of the
 * authenticated-route ecosystem already tolerates (database-review finding
 * H1):
 *   - POLICY_CONTEXT_QUERY_TIMEOUT_MS: the policy-context reads' own real,
 *     server-cancelled worst case (see auth.ts) -- itself derived from
 *     POOL_CONNECTION_TIMEOUT_MS, so that cold-start/contention tolerance
 *     is already accounted for once here.
 *   - OWNER_FIRST_RUN_GRAPH_MARGIN_MS: see above.
 *
 * This budget is paid AFTER getSession() (SESSION_QUERY_TIMEOUT_MS, ~107s
 * worst case, pre-existing and unchanged) has already succeeded in the same
 * request -- the two are sequential, not concurrent, so the ROUTE's own
 * total worst case is their SUM. Asserted explicitly (not just hoped) to
 * stay materially under Vercel's 300_000ms function ceiling.
 */
export const AUTH_ROOT_DECISION_TIMEOUT_MS = POLICY_CONTEXT_QUERY_TIMEOUT_MS + OWNER_FIRST_RUN_GRAPH_MARGIN_MS;

const VERCEL_FUNCTION_CEILING_MS = 300_000;
/**
 * santa-loop review finding: "materially under" is a claim about MARGIN,
 * not mere non-equality -- a bare `>= VERCEL_FUNCTION_CEILING_MS` check
 * would let a total of 299_999ms pass despite being functionally AT the
 * ceiling (zero room for scheduler jitter, clock drift, or Vercel's own
 * overhead on top of this route's own code). Requires at least this much
 * headroom below the ceiling for the assertion to pass.
 */
const REQUIRED_CEILING_HEADROOM_MS = 30_000;
/** The authenticated root route's own full, sequential, end-to-end worst case: getSession() + this decision. */
export const TOTAL_AUTH_ROOT_WORST_CASE_MS = SESSION_QUERY_TIMEOUT_MS + AUTH_ROOT_DECISION_TIMEOUT_MS;
if (TOTAL_AUTH_ROOT_WORST_CASE_MS >= VERCEL_FUNCTION_CEILING_MS - REQUIRED_CEILING_HEADROOM_MS) {
  // A module-load-time assertion, not a runtime check on the hot path: if
  // either budget this derives from ever changes such that their sum would
  // stop being materially faster than the platform ceiling, fail loudly at
  // startup/build/test time rather than silently regressing Phase 0's
  // "materially faster than Vercel's 300s ceiling" requirement.
  throw new Error(
    `[root-redirect] TOTAL_AUTH_ROOT_WORST_CASE_MS (${TOTAL_AUTH_ROOT_WORST_CASE_MS}ms) leaves less than ${REQUIRED_CEILING_HEADROOM_MS}ms of headroom under Vercel's ${VERCEL_FUNCTION_CEILING_MS}ms function ceiling -- re-derive AUTH_ROOT_DECISION_TIMEOUT_MS.`
  );
}

/** Pre-existing default destination for every authenticated actor this route cannot positively resolve as a self-serve owner. */
const DEFAULT_DESTINATION = "/dashboard";

export async function resolveAuthenticatedRootDestination(session: SessionInfo): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveAuthenticatedRootDestinationUnbounded(session),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Authenticated root redirect decision exceeded ${AUTH_ROOT_DECISION_TIMEOUT_MS}ms`)),
          AUTH_ROOT_DECISION_TIMEOUT_MS
        );
        // Must never keep the process/event loop alive on its own -- this is
        // a pure defensive backstop, not real work the runtime should wait on.
        if (typeof timer === "object" && timer.unref) timer.unref();
      }),
    ]);
  } catch (error) {
    logger.warn("[root-redirect] authenticated root decision failed or timed out -- failing closed to the default destination", {
      error: String(error),
    });
    return DEFAULT_DESTINATION;
  } finally {
    // TypeScript/fresh-context review finding: clear the backstop timer once
    // the race settles on the common, fast-path win -- avoids leaving a
    // dangling scheduled callback on every single successful request.
    clearTimeout(timer);
  }
}

async function resolveAuthenticatedRootDestinationUnbounded(session: SessionInfo): Promise<string> {
  const policy = await getPolicyContextForSession(session, undefined, {
    statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS,
  });
  const ownerHome = policy ? isSelfServeOwnerContext(policy) : false;
  if (!ownerHome) return DEFAULT_DESTINATION;
  return resolveOwnerLoginHref(session.user.id);
}
