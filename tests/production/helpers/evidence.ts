/**
 * Sanitized evidence capture for the live-production acceptance lane.
 *
 * RAW_PLAYWRIGHT_TRACE_UPLOAD=0 -- this suite NEVER produces or uploads a
 * Playwright trace archive (context.tracing.*) for a live-production run.
 * Run #32509563234 proved raw traces can capture a plaintext password typed
 * into a login form; run #32528037515 proved that even after that was fixed
 * (auth completes before any capture starts), a raw trace of AUTHENTICATED
 * activity still records the live session Cookie header on every subsequent
 * request -- an authenticated trace is *inherently* self-contradictory with
 * a scanner that must search captured evidence for that same session token:
 * a real session doing real authenticated work will always match. The fix
 * is not to weaken the scanner (it stays, as defense-in-depth) but to never
 * capture credential-bearing raw request/response data in the first place.
 *
 * This module therefore never touches context.tracing. It captures only:
 *  - checkpoint/failure screenshots (pixel data -- this app never renders a
 *    session token or password on screen, so screenshots carry no secret);
 *  - a sanitized network event log: timestamp, method, PATHNAME ONLY (no
 *    query string, no full URL), status, duration, and a test-name label --
 *    explicitly never headers (Cookie/Authorization/Set-Cookie), never
 *    request/response bodies;
 *  - a sanitized console log: only the message's rendered text, which this
 *    app's console output never uses to print secrets.
 *
 * State is tracked per-context (WeakSet + WeakMap, not module-level flags)
 * since multiple spec files import this module within the same worker
 * process. Every function no-ops safely if collection was never started for
 * a given context (e.g. login/setup failed before startEvidenceCollection()
 * ran) -- teardown never throws a misleading secondary error on top of a
 * real setup failure.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page, Request as PWRequest, TestInfo } from "@playwright/test";

const EVIDENCE_ROOT = "production-test-results/evidence";

function evidenceDirFor(specName: string): string {
  const dir = join(EVIDENCE_ROOT, specName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(raw: string): string {
  return raw.replace(/[^a-z0-9-]+/gi, "_").slice(0, 80);
}

function sanitizedPathname(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "unparsable-url";
  }
}

export interface SanitizedNetworkEntry {
  timestamp: string;
  method: string;
  pathname: string;
  status: number | null;
  durationMs: number;
  label: string;
}

export interface SanitizedConsoleEntry {
  timestamp: string;
  type: string;
  text: string;
}

interface EvidenceState {
  network: SanitizedNetworkEntry[];
  console: SanitizedConsoleEntry[];
}

const evidenceState = new WeakMap<BrowserContext, EvidenceState>();
const collectionStartedFor = new WeakSet<BrowserContext>();

/**
 * Attaches the sanitized network/console listeners. Callers MUST call this
 * only AFTER authenticateProductionOwner() resolves (matching this suite's
 * existing "auth before any capture" convention) even though the sanitized
 * entries recorded here never carry headers/cookies regardless of timing --
 * keeping capture start gated on successful login avoids any doubt and
 * keeps a single, easy-to-audit invariant across this whole module.
 */
export function startEvidenceCollection(context: BrowserContext, page: Page, specName: string): void {
  const state: EvidenceState = { network: [], console: [] };
  evidenceState.set(context, state);
  collectionStartedFor.add(context);

  const requestStartedAt = new Map<PWRequest, number>();
  page.on("request", (req) => {
    requestStartedAt.set(req, Date.now());
  });

  const record = (req: PWRequest, status: number | null) => {
    const startedAt = requestStartedAt.get(req);
    requestStartedAt.delete(req);
    state.network.push({
      timestamp: new Date().toISOString(),
      method: req.method(),
      pathname: sanitizedPathname(req.url()),
      status,
      durationMs: startedAt !== undefined ? Date.now() - startedAt : -1,
      label: specName,
    });
  };

  page.on("requestfinished", async (req) => {
    const res = await req.response().catch(() => null);
    record(req, res ? res.status() : null);
  });
  page.on("requestfailed", (req) => record(req, null));

  page.on("console", (msg) => {
    state.console.push({ timestamp: new Date().toISOString(), type: msg.type(), text: msg.text() });
  });
}

/** Call from a serial suite's afterEach(async ({}, testInfo) => ...). No-ops
 * safely if context/page were never created, or if collection was never
 * started for this context (e.g. login/setup failed in beforeAll before
 * startEvidenceCollection() ran) -- never throws on top of a real setup
 * failure. Captures a screenshot only -- no trace file. */
export async function captureOnFailure(
  context: BrowserContext | undefined,
  page: Page | undefined,
  testInfo: TestInfo,
  specName: string
): Promise<void> {
  if (!context || !page || !collectionStartedFor.has(context)) return;
  if (testInfo.status === "passed") return;
  try {
    const dir = evidenceDirFor(specName);
    const base = safeName(testInfo.title);
    await page.screenshot({ path: join(dir, `FAILED-${base}-screenshot.png`), fullPage: true }).catch(() => {});
  } catch (err) {
    // Never let evidence capture itself mask or replace the real test
    // failure/error -- report and continue.
    console.error(`captureOnFailure: evidence capture failed (${specName}): ${(err as Error).message}`);
  }
}

/**
 * Explicit checkpoint screenshot at a critical journey step, independent of
 * pass/fail -- required for critical closure journeys per the acceptance
 * program's evidence spec, even on success. No-ops if collection was never
 * started for this context.
 */
export async function checkpointScreenshot(
  context: BrowserContext | undefined,
  page: Page | undefined,
  specName: string,
  label: string
): Promise<void> {
  if (!context || !page || !collectionStartedFor.has(context)) return;
  const dir = evidenceDirFor(specName);
  await page
    .screenshot({ path: join(dir, `checkpoint-${safeName(label)}.png`), fullPage: true })
    .catch(() => {});
}

/** Flushes the sanitized network/console logs to disk. Safe to call even if
 * collection was never started or context was never created (e.g.
 * blocked-upstream teardown). */
export async function finalizeEvidence(context: BrowserContext | undefined, specName: string): Promise<void> {
  if (!context || !collectionStartedFor.has(context)) return;
  try {
    const state = evidenceState.get(context);
    if (state) {
      const dir = evidenceDirFor(specName);
      writeFileSync(join(dir, `${specName}-network-log.json`), JSON.stringify(state.network, null, 2));
      writeFileSync(join(dir, `${specName}-console-log.json`), JSON.stringify(state.console, null, 2));
    }
  } catch (err) {
    console.error(`finalizeEvidence: failed to flush sanitized logs: ${(err as Error).message}`);
  } finally {
    collectionStartedFor.delete(context);
    evidenceState.delete(context);
  }
}
