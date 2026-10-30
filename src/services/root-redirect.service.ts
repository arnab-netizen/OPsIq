/**
 * F-AUTH-ROOT-SINGLE-TX: the authenticated `/` redirect decision — session validation, policy
 * resolution, and (only for a proven self-serve owner) owner-login-href resolution — now runs
 * inside ONE root-specific, bounded, cancellable Prisma interactive transaction, instead of three
 * separately-bounded DB domains (getSession()'s ~107s worst case, getPolicyContextForSession()'s
 * ~122s worst case, and an unprotected owner-first-run graph needing a further +30s margin —
 * together ~256s). Replacing that with one transaction removes the need to independently re-pay a
 * full cold-start acquisition tolerance three times for the SAME request: a genuine Neon
 * compute-wake can only happen once per request's first DB touch, and this route's first DB touch is
 * now the one transaction below.
 *
 * Proven via real local PostgreSQL + real PgBouncer transaction-mode spikes (test-only, not
 * committed) before this implementation: session/policy/owner-first-run semantic equivalence against
 * the prior three-domain path, exactly one backend/transaction for the whole decision, read-only
 * transaction compatibility (a write attempt is rejected), independent statement-cancellation proof
 * for each of the three phases, whole-transaction-timeout proof, acquisition (`maxWait`) proof at
 * 3s/8s/>10s, and the deadline-alignment finding below.
 *
 * Reuses canonical logic verbatim through dependency injection, never a second implementation:
 * validateSessionTokenInTransaction() (auth.ts) runs the SAME SQL text and revoked/expiry/active
 * checks as getSession() itself; runPolicyContextReads() (auth.ts) is the SAME canonical Prisma
 * policy logic getPolicyContextForSession()'s default path already used, now exported for reuse;
 * resolveOwnerLoginHref()/getFirstRunContext() (first-run.service.ts) are the SAME owner-first-run
 * functions, each now accepting an optional Prisma client (default: the global `db` singleton, so
 * every non-root caller is byte-for-byte unaffected).
 *
 * getSession()'s own timeouts (SESSION_QUERY_TIMEOUT_MS, ~107s) and
 * getPolicyContextForSession()'s generic raw-timeout path (POLICY_CONTEXT_QUERY_TIMEOUT_MS, ~122s)
 * are UNCHANGED for every other caller — this file no longer calls either of them at all for the
 * root route, but neither constant was touched.
 */
import { logger } from "@/infra/logger";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { validateSessionTokenInTransaction, runPolicyContextReads, getSessionCookieName, type SessionInfo } from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";
import { getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Acquisition budget for the one root-specific transaction below. Deliberately a direct
 * `db.$transaction({maxWait})` call, not routed through `withStatementTimeout()`'s process-local
 * acquisition queue (db.ts) built for OTHER same-process callers of that specific primitive —
 * fresh-context review finding: this means ordinary same-process contention for the shared `max:1`
 * pool (ANY other concurrent `db.$transaction()`/query in this Node instance holding the sole
 * connection, not only a rare cold Neon wake) can make THIS 10s budget expire before session
 * validation ever runs. That is the accepted, deliberate tradeoff for this one low-stakes redirect
 * decision (far shorter than the generic pool's own `connectionTimeoutMillis`, ~90s, that
 * getSession()/getPolicyContextForSession() still tolerate for every other caller): acquisition
 * failure here happens BEFORE `phase.sessionEstablished` is ever set, so it always fails closed to
 * `{kind: "anonymous"}` -- a signed-in user intermittently sees the public landing page instead of
 * their dashboard under contention, never an authorization bypass. Widening this budget, or routing
 * it through the shared acquisition queue, is a legitimate follow-up if that UX cost proves too
 * frequent in production -- not done here because it was not a reproduced defect.
 */
export const ROOT_AUTH_MAX_WAIT_MS = 10_000;
/** Whole-transaction execution budget (session + policy + owner-first-run together). */
export const ROOT_AUTH_TX_TIMEOUT_MS = 15_000;
/** Server-side `SET LOCAL statement_timeout` applied inside the transaction, bounding each statement. */
export const ROOT_AUTH_STATEMENT_TIMEOUT_MS = 2_000;

/**
 * Deadline-alignment finding (measured with real injected latency, not assumed): Prisma's
 * interactive-transaction `timeout` is only checked before DISPATCHING the next statement — it does
 * not preemptively cancel one already in flight. A statement that begins just before the transaction
 * deadline therefore rides out its OWN `statement_timeout` before the transaction is reported expired
 * (measured worst case: tx_timeout + statement_timeout, not tx_timeout alone). This margin accounts
 * for exactly that straddling-statement overhang.
 */
const ROOT_AUTH_STATEMENT_OVERHANG_ALLOWANCE_MS = ROOT_AUTH_STATEMENT_TIMEOUT_MS;
/** Measured/conservative allowance for the rollback and connection-cleanup that follow any of the above. */
const ROOT_AUTH_CLEANUP_MARGIN_MS = 1_000;

/** The legitimate worst case for the whole root transaction: acquisition, then execution, then the measured straddling-statement overhang, then cleanup. */
export const ROOT_AUTH_INNER_WORST_CASE_MS =
  ROOT_AUTH_MAX_WAIT_MS + ROOT_AUTH_TX_TIMEOUT_MS + ROOT_AUTH_STATEMENT_OVERHANG_ALLOWANCE_MS + ROOT_AUTH_CLEANUP_MARGIN_MS;

/**
 * Pure defensive backstop around the whole transaction — strictly greater than
 * ROOT_AUTH_INNER_WORST_CASE_MS so it can never fire while the transaction is still legitimately
 * completing, and comfortably under Vercel's 300s function ceiling.
 */
export const ROOT_AUTH_OUTER_TIMEOUT_MS = 29_000;

if (ROOT_AUTH_OUTER_TIMEOUT_MS <= ROOT_AUTH_INNER_WORST_CASE_MS) {
  // Module-load assertion, not a runtime check on the hot path: catches constant drift at
  // startup/build/test time rather than letting the outer backstop abandon still-legitimate work.
  throw new Error(
    `[root-redirect] ROOT_AUTH_OUTER_TIMEOUT_MS (${ROOT_AUTH_OUTER_TIMEOUT_MS}ms) must be strictly greater than ROOT_AUTH_INNER_WORST_CASE_MS (${ROOT_AUTH_INNER_WORST_CASE_MS}ms).`
  );
}
if (ROOT_AUTH_OUTER_TIMEOUT_MS > 30_000) {
  throw new Error(`[root-redirect] ROOT_AUTH_OUTER_TIMEOUT_MS (${ROOT_AUTH_OUTER_TIMEOUT_MS}ms) exceeds the 30000ms target.`);
}

/** Pre-existing default destination for every authenticated actor this route cannot positively resolve as a self-serve owner. */
const DEFAULT_DESTINATION = "/dashboard";

export type RootAuthDecision = { kind: "anonymous" } | { kind: "redirect"; href: string };

type RootAuthTransactionClient = Prisma.TransactionClient;

/**
 * Mutated exactly once, the instant session validation positively succeeds inside the transaction
 * below — read by the outer catch (never by the transaction itself) so a failure/timeout AFTER that
 * point fails closed to DEFAULT_DESTINATION (an authenticated actor's safe default), while a
 * failure/timeout BEFORE it (no cookie was ever proven to name a real session) fails closed to
 * `anonymous` — this codebase must never infer owner authorization from DB uncertainty, but must
 * also never discard a session that genuinely was proven, by silently sending an authenticated actor
 * back to the anonymous public landing page.
 */
interface SessionPhaseTracker {
  sessionEstablished: boolean;
}

export async function resolveAuthenticatedRootDecision(): Promise<RootAuthDecision> {
  // Cookie read BEFORE any DB initialization — every anonymous visitor (the overwhelming majority of
  // root-route traffic) must never pay for pool construction/connection at all.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getSessionCookieName())?.value;
  if (!sessionToken) return { kind: "anonymous" };

  const phase: SessionPhaseTracker = { sessionEstablished: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveAuthenticatedRootDecisionUnbounded(sessionToken, phase),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Authenticated root decision exceeded ${ROOT_AUTH_OUTER_TIMEOUT_MS}ms`)),
          ROOT_AUTH_OUTER_TIMEOUT_MS
        );
        // Must never keep the process/event loop alive on its own -- this is a pure defensive
        // backstop that should never actually fire, not real work the runtime should wait on.
        if (typeof timer === "object" && timer.unref) timer.unref();
      }),
    ]);
  } catch (error) {
    logger.warn("[root-redirect] authenticated root decision failed or timed out -- failing closed", {
      error: String(error),
      sessionEstablished: phase.sessionEstablished,
    });
    // No positive session proof yet: this request never authenticated, so it gets the SAME
    // treatment as a missing/invalid cookie -- the public landing page, never a redirect.
    // Session WAS positively proven: fail closed to the existing authenticated default, exactly as
    // an authenticated actor this route cannot positively resolve as a self-serve owner already does.
    return phase.sessionEstablished ? { kind: "redirect", href: DEFAULT_DESTINATION } : { kind: "anonymous" };
  } finally {
    // Clear the backstop timer once the race settles on the common, fast-path win -- avoids leaving
    // a dangling scheduled callback on every single successful request.
    clearTimeout(timer);
  }
}

async function resolveAuthenticatedRootDecisionUnbounded(
  sessionToken: string,
  phase: SessionPhaseTracker
): Promise<RootAuthDecision> {
  return db.$transaction(
    async (tx: RootAuthTransactionClient) => {
      const txRaw = tx as unknown as { $executeRawUnsafe: (query: string) => Promise<unknown> };
      // Read-only invariant: the whole decision only ever reads. Proven (test-only) that a write
      // attempt inside this transaction is rejected by Postgres while legitimate reads still succeed.
      await txRaw.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      // Server-side kill switch for any single blocked statement in this transaction -- Postgres
      // cancels it (SQLSTATE 57014) and the transaction rolls back, independent of whatever the
      // outer race above decides.
      await txRaw.$executeRawUnsafe(`SET LOCAL statement_timeout = ${ROOT_AUTH_STATEMENT_TIMEOUT_MS}`);

      const session = await validateSessionTokenInTransaction(tx as RootAuthTransactionClient, sessionToken);
      if (!session) return { kind: "anonymous" as const };
      // Positive proof established -- from here on, any later failure fails closed to
      // DEFAULT_DESTINATION (via the outer catch's phase check), never back to anonymous.
      phase.sessionEstablished = true;

      const policy = await runPolicyContextReads(
        tx as unknown as Pick<Prisma.TransactionClient, "workspaceMembership" | "userRoleAssignment" | "engagementMembership">,
        session as SessionInfo,
        undefined
      );
      const ownerHome = policy ? isSelfServeOwnerContext(policy) : false;
      if (!ownerHome) return { kind: "redirect" as const, href: DEFAULT_DESTINATION };

      // F-AUTH-ROOT-SINGLE-TX (security-review finding): deliberately NOT calling
      // resolveOwnerLoginHref() here, even though it is otherwise the canonical function for this
      // exact lookup. Its own pre-existing try/catch (unchanged, correct for its OTHER potential
      // callers) swallows any internal failure and returns the hardcoded "/owner/cockpit" --
      // which, inside THIS shared transaction, would let a later-phase statement cancellation or
      // transaction-abort be silently converted into a real owner-labeled destination instead of
      // propagating to this function's own outer catch (which already correctly fails closed to
      // DEFAULT_DESTINATION once `phase.sessionEstablished` is true). Inlining the SAME two reads
      // resolveOwnerLoginHref() itself performs, without a catch, lets any failure here abort the
      // transaction and reach that outer fail-closed path instead.
      const membership = await (tx as RootAuthTransactionClient).workspaceMembership.findFirst({
        where: { userId: session.user.id, isActive: true },
        orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
        select: { workspaceId: true },
      });
      if (!membership) return { kind: "redirect" as const, href: "/owner/cockpit" };
      // TypeScript-review finding: `as never` disables type-checking on this call site permanently
      // (never is assignable to anything); `as unknown as PrismaClient` keeps checking against the
      // actual declared target type instead, so a future signature change on getFirstRunContext()
      // is still caught here. Prisma.TransactionClient is a real structural subset of PrismaClient
      // (missing $connect/$disconnect/$on/$extends, none of which this call graph uses), so this
      // narrowing is safe today and remains checked going forward.
      const href = (await getFirstRunContext(membership.workspaceId, undefined, tx as unknown as PrismaClient)).loginHref;
      return { kind: "redirect" as const, href };
    },
    { maxWait: ROOT_AUTH_MAX_WAIT_MS, timeout: ROOT_AUTH_TX_TIMEOUT_MS }
  );
}
