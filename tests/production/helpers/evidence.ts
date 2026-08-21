/**
 * Manual trace/screenshot capture for the live-production acceptance lane.
 *
 * This suite shares one authenticated context/page across a serial journey
 * (matching this repo's established tests/browser/ pattern of creating the
 * context by hand in beforeAll). Playwright's automatic trace/screenshot
 * retain-on-failure behavior is disabled at the config level (trace: 'off',
 * screenshot: 'off' in playwright.production.config.ts) -- run
 * #32509563234 proved that setting starts recording at context-creation
 * time regardless of who creates the context, which captured a login
 * failure's plaintext password in a trace before this module's own
 * tracing ever ran. This module is therefore the ONLY tracing/screenshot
 * mechanism for this suite.
 *
 * Tracing state is tracked per-context (not as a module-level flag, since
 * multiple spec files import this module within the same worker process)
 * so teardown is always safe: it never throws a misleading secondary error
 * on top of a real setup failure (e.g. login rejected before tracing ever
 * started), and never touches a context that was never created.
 */
import { mkdirSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";

const EVIDENCE_ROOT = "production-test-results/evidence";

function evidenceDirFor(specName: string): string {
  const dir = join(EVIDENCE_ROOT, specName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(raw: string): string {
  return raw.replace(/[^a-z0-9-]+/gi, "_").slice(0, 80);
}

const tracingStartedFor = new WeakSet<BrowserContext>();

export async function startTracing(context: BrowserContext): Promise<void> {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await context.tracing.startChunk();
  tracingStartedFor.add(context);
}

/** Call from a serial suite's afterEach(async ({}, testInfo) => ...). No-ops
 * safely if context/page were never created, or if tracing was never
 * started for this context (e.g. login/setup failed in beforeAll before
 * startTracing() ran) -- never throws on top of a real setup failure. */
export async function captureOnFailure(
  context: BrowserContext | undefined,
  page: Page | undefined,
  testInfo: TestInfo,
  specName: string
): Promise<void> {
  if (!context || !page || !tracingStartedFor.has(context)) return;
  const failed = testInfo.status !== "passed";
  try {
    if (failed) {
      const dir = evidenceDirFor(specName);
      const base = safeName(testInfo.title);
      await context.tracing.stopChunk({ path: join(dir, `FAILED-${base}-trace.zip`) });
      await page.screenshot({ path: join(dir, `FAILED-${base}-screenshot.png`), fullPage: true }).catch(() => {});
    } else {
      // No path -- the chunk is discarded, matching screenshot/trace:
      // only-on-failure / retain-on-failure semantics.
      await context.tracing.stopChunk();
    }
    await context.tracing.startChunk();
  } catch (err) {
    // Never let evidence capture itself mask or replace the real test
    // failure/error -- report and continue.
    console.error(`captureOnFailure: evidence capture failed (${specName}): ${(err as Error).message}`);
  }
}

/**
 * Explicit checkpoint screenshot at a critical journey step, independent of
 * pass/fail -- required for critical closure journeys per the acceptance
 * program's evidence spec, even on success. No-ops if tracing was never
 * started for this context (page state before login is never worth a
 * checkpoint here, and capturing it would defeat the purpose of gating
 * capture on login success).
 */
export async function checkpointScreenshot(
  context: BrowserContext | undefined,
  page: Page | undefined,
  specName: string,
  label: string
): Promise<void> {
  if (!context || !page || !tracingStartedFor.has(context)) return;
  const dir = evidenceDirFor(specName);
  await page
    .screenshot({ path: join(dir, `checkpoint-${safeName(label)}.png`), fullPage: true })
    .catch(() => {});
}

/** Safe to call even if tracing was never started or context was never
 * created (e.g. blocked-upstream teardown). */
export async function finalizeTracing(context: BrowserContext | undefined): Promise<void> {
  if (!context || !tracingStartedFor.has(context)) return;
  try {
    await context.tracing.stop();
  } catch (err) {
    console.error(`finalizeTracing: failed to stop tracing: ${(err as Error).message}`);
  } finally {
    tracingStartedFor.delete(context);
  }
}
